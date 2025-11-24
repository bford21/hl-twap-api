import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Increase timeout for large exports (if using Vercel, this requires Pro plan)
export const maxDuration = 60; // 60 seconds

// Helper to escape CSV fields
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  const strValue = String(value);
  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
}

// GET /api/trades/export - Export trades to CSV (streaming)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const user = searchParams.get('user');
  const coin = searchParams.get('coin');
  const side = searchParams.get('side');
  const twapId = searchParams.get('twap_id');
  const startTime = searchParams.get('start_time');
  const endTime = searchParams.get('end_time');

  if (!user && !twapId) {
    return new Response(JSON.stringify({ error: 'Either user or twap_id parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const identifier = user 
    ? `${user.slice(0, 8)}`
    : `twap_${twapId}`;
  const filename = `hyperliquid_trades_${identifier}_${timestamp}.csv`;

  // Create a streaming response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send CSV header immediately
        const header = [
          'Trade ID',
          'Time',
          'Coin',
          'Side',
          'Price',
          'Size',
          'Value (USD)',
          'User Address',
          'TWAP ID',
          'Order ID',
          'Client Order ID',
          'Start Position',
          'Hash'
        ].join(',') + '\n';
        
        controller.enqueue(encoder.encode(header));

        console.log(`Starting CSV export for ${user ? `user ${user}` : `twap ${twapId}`}`);

        // Fetch and stream participants in batches (no count query - just process until empty)
        const batchSize = 1000; // Small batches to avoid timeout
        let lastId = 0; // Cursor for pagination
        let hasMore = true;
        let fetchedCount = 0;
        let rowsWritten = 0;
        let batchNumber = 0;

        while (hasMore) {
          // Fetch participant batch using cursor-based pagination (faster than OFFSET)
          let participantQuery = supabase
            .from('trade_participants')
            .select('id, trade_id, user_address, side, start_pos, oid, twap_id, cloid')
            .gt('id', lastId)
            .order('id', { ascending: true })
            .limit(batchSize);

          if (user) {
            participantQuery = participantQuery.eq('user_address', user.toLowerCase());
          }

          if (twapId) {
            participantQuery = participantQuery.eq('twap_id', parseInt(twapId));
          }

          if (side && (side === 'A' || side === 'B')) {
            participantQuery = participantQuery.eq('side', side);
          }

          const { data: participants, error: partError } = await participantQuery;

          if (partError) {
            controller.error(partError);
            return;
          }

          if (!participants || participants.length === 0) {
            hasMore = false;
            break;
          }

          fetchedCount += participants.length;
          batchNumber++;
          console.log(`Batch ${batchNumber}: Fetched ${participants.length} participants (${fetchedCount} total so far)`);

          // Update cursor for next batch
          lastId = participants[participants.length - 1].id;

          // Get unique trade IDs from this batch
          const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));

          // Fetch trades for this batch
          const trades = [];
          const tradeBatchSize = 500; // Smaller batch to avoid timeout
          
          for (let i = 0; i < tradeIds.length; i += tradeBatchSize) {
            const batchIds = tradeIds.slice(i, i + tradeBatchSize);
            
            let tradeQuery = supabase
              .from('trades')
              .select('*')
              .in('id', batchIds);

            if (coin) {
              tradeQuery = tradeQuery.eq('coin', coin.toUpperCase());
            }

            if (startTime) {
              tradeQuery = tradeQuery.gte('time', startTime);
            }

            if (endTime) {
              tradeQuery = tradeQuery.lte('time', endTime);
            }

            const { data: tradeBatch, error: tradeError } = await tradeQuery;

            if (tradeError) {
              controller.error(tradeError);
              return;
            }

            if (tradeBatch && tradeBatch.length > 0) {
              trades.push(...tradeBatch);
            }
          }

          // Map participants to trades
          const participantsByTrade = new Map<number, any[]>();
          participants.forEach(p => {
            if (!participantsByTrade.has(p.trade_id)) {
              participantsByTrade.set(p.trade_id, []);
            }
            participantsByTrade.get(p.trade_id)!.push(p);
          });

          // Sort trades by time descending
          trades.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

          // Write CSV rows for this batch
          trades.forEach(trade => {
            const tradeParticipants = participantsByTrade.get(trade.id) || [];
            const value = trade.px * trade.sz;
            
            tradeParticipants.forEach(participant => {
              const row = [
                escapeCsvField(trade.id),
                escapeCsvField(new Date(trade.time).toISOString()),
                escapeCsvField(trade.coin),
                escapeCsvField(participant.side === 'A' ? 'Ask/Sell' : participant.side === 'B' ? 'Bid/Buy' : participant.side),
                escapeCsvField(trade.px),
                escapeCsvField(trade.sz),
                escapeCsvField(value.toFixed(2)),
                escapeCsvField(participant.user_address),
                escapeCsvField(participant.twap_id || ''),
                escapeCsvField(participant.oid),
                escapeCsvField(participant.cloid || ''),
                escapeCsvField(participant.start_pos),
                escapeCsvField(trade.hash)
              ].join(',') + '\n';
              
              controller.enqueue(encoder.encode(row));
              rowsWritten++;
            });
          });
          
          // Break if we got fewer results than batch size
          if (participants.length < batchSize) {
            hasMore = false;
          }
        }

        console.log(`CSV export complete: ${rowsWritten} rows written`);
        controller.close();
      } catch (error) {
        console.error('Export error:', error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    },
  });
}
