import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// GET /api/trades/summary - Get unique TWAP summaries for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user = searchParams.get('user');

    console.log(`[SUMMARY] Request for user: ${user}`);

    if (!user) {
      console.log('[SUMMARY] Error: No user address provided');
      return NextResponse.json(
        { error: 'User address is required' },
        { status: 400 }
      );
    }

    // Get count of all participants first (for accurate totals)
    console.log(`[SUMMARY] Step 1: Counting participants for user ${user}`);
    const { count: totalParticipantsCount, error: countError } = await supabase
      .from('trade_participants')
      .select('trade_id', { count: 'exact', head: true })
      .eq('user_address', user.toLowerCase())
      .not('twap_id', 'is', null);

    if (countError) {
      console.error('[SUMMARY] Error counting participants:', countError);
      return NextResponse.json(
        { 
          error: countError.message,
          step: 'counting_participants',
          details: countError
        },
        { status: 500 }
      );
    }

    console.log(`[SUMMARY] Found ${totalParticipantsCount} participants`)

    if (!totalParticipantsCount || totalParticipantsCount === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        stats: {
          unique_twaps: 0,
          total_trades: 0,
          total_volume: 0,
        },
      });
    }

    // Fetch all participants in batches of 5000 (Supabase limit)
    console.log(`[SUMMARY] Step 2: Fetching ${totalParticipantsCount} participant records...`);
    const participants = [];
    const batchSize = 5000;
    let offset = 0;

    while (offset < totalParticipantsCount) {
      console.log(`[SUMMARY] Fetching batch at offset ${offset}`);
      const { data: batch, error: partError } = await supabase
        .from('trade_participants')
        .select('twap_id, user_address, trade_id, side')
        .eq('user_address', user.toLowerCase())
        .not('twap_id', 'is', null)
        .range(offset, offset + batchSize - 1);

      if (partError) {
        console.error('[SUMMARY] Error fetching participants batch:', {
          offset,
          error: partError,
          message: partError.message,
          code: partError.code,
          details: partError.details,
          hint: partError.hint
        });
        return NextResponse.json(
          { 
            error: partError.message,
            step: 'fetching_participants',
            offset: offset,
            code: partError.code,
            details: partError.details,
            hint: partError.hint
          },
          { status: 500 }
        );
      }

      if (batch && batch.length > 0) {
        participants.push(...batch);
        console.log(`[SUMMARY] Batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} records (total: ${participants.length})`);
      }

      offset += batchSize;

      // Break if we got fewer results than expected (reached the end)
      if (!batch || batch.length < batchSize) {
        break;
      }
    }

    console.log(`[SUMMARY] Step 2 complete: ${participants.length} participants fetched`);

    // Get unique trade IDs
    console.log(`[SUMMARY] Step 3: Extracting unique trade IDs...`);
    const tradeIds = Array.from(new Set(participants.map(p => p.trade_id)));
    console.log(`[SUMMARY] Found ${tradeIds.length} unique trade IDs`);

    // Fetch trades in batches (limit batch size for .in() filter to avoid URL length issues)
    console.log(`[SUMMARY] Step 4: Fetching trade data...`);
    const trades = [];
    const tradeBatchSize = 1000; // Keep at 1000 for .in() queries to avoid "Bad Request"
    
    for (let i = 0; i < tradeIds.length; i += tradeBatchSize) {
      const batchIds = tradeIds.slice(i, i + tradeBatchSize);
      console.log(`[SUMMARY] Fetching trade batch ${Math.floor(i / tradeBatchSize) + 1} (${batchIds.length} IDs)`);
      
      const { data: tradeBatch, error: tradeError } = await supabase
        .from('trades')
        .select('id, coin, px, sz')
        .in('id', batchIds);

      if (tradeError) {
        console.error('[SUMMARY] Error fetching trades:', {
          batchNumber: Math.floor(i / tradeBatchSize) + 1,
          error: tradeError,
          message: tradeError.message,
          code: tradeError.code,
          details: tradeError.details
        });
        return NextResponse.json(
          { 
            error: tradeError.message,
            step: 'fetching_trades',
            batchNumber: Math.floor(i / tradeBatchSize) + 1,
            code: tradeError.code,
            details: tradeError.details
          },
          { status: 500 }
        );
      }

      if (tradeBatch && tradeBatch.length > 0) {
        trades.push(...tradeBatch);
        console.log(`[SUMMARY] Trade batch ${Math.floor(i / tradeBatchSize) + 1}: ${tradeBatch.length} trades (total: ${trades.length})`);
      }
    }

    console.log(`[SUMMARY] Step 4 complete: ${trades.length} trades fetched`);

    // Create a map of trade_id to trade info
    console.log(`[SUMMARY] Step 5: Creating trade map...`);
    const tradeMap = new Map(trades.map(t => [t.id, t]));
    console.log(`[SUMMARY] Trade map size: ${tradeMap.size}`);

    // Group by TWAP ID and aggregate data
    console.log(`[SUMMARY] Step 6: Aggregating data by TWAP ID...`);
    const twapSummaries = new Map<number, {
      twap_id: number;
      address: string;
      coins: Set<string>;
      sides: Set<string>;
      trade_count: number;
      total_volume: number;
      total_price: number;
      price_count: number;
    }>();

    // Calculate total volume (across all TWAPs)
    let totalVolume = 0;

    participants.forEach(p => {
      const trade = tradeMap.get(p.trade_id);
      if (!trade || !p.twap_id) return;

      if (!twapSummaries.has(p.twap_id)) {
        twapSummaries.set(p.twap_id, {
          twap_id: p.twap_id,
          address: p.user_address,
          coins: new Set(),
          sides: new Set(),
          trade_count: 0,
          total_volume: 0,
          total_price: 0,
          price_count: 0,
        });
      }

      const summary = twapSummaries.get(p.twap_id)!;
      summary.coins.add(trade.coin);
      // Get side from participant (side is now only on trade_participants table)
      if (p.side) {
        summary.sides.add(p.side);
      }
      summary.trade_count++;

      // Calculate volume for this trade (price * size)
      const tradeVolume = Number(trade.px) * Number(trade.sz);
      summary.total_volume += tradeVolume;
      totalVolume += tradeVolume;

      // Accumulate price for average calculation
      summary.total_price += Number(trade.px);
      summary.price_count++;
    });

    console.log(`[SUMMARY] Step 6 complete: ${twapSummaries.size} unique TWAPs found`);

    // Convert to array and format
    console.log(`[SUMMARY] Step 7: Formatting results...`);
    const result = Array.from(twapSummaries.values()).map(s => ({
      twap_id: s.twap_id,
      address: s.address,
      coin: Array.from(s.coins).join(', '),
      side: Array.from(s.sides).map(side => side === 'A' ? 'Sell' : 'Buy').join(', '),
      trade_count: s.trade_count,
      total_volume: s.total_volume,
      avg_price: s.price_count > 0 ? s.total_price / s.price_count : 0,
    }))
    .sort((a, b) => b.twap_id - a.twap_id); // Sort by TWAP ID descending

    // Calculate stats
    const uniqueTwaps = twapSummaries.size;
    const totalTrades = tradeIds.length;

    console.log(`[SUMMARY] ✅ Success - Returning ${result.length} TWAP summaries`);
    console.log(`[SUMMARY] Stats: ${uniqueTwaps} unique TWAPs, ${totalTrades} trades, $${totalVolume.toFixed(2)} volume`);

    return NextResponse.json({
      data: result,
      count: result.length,
      stats: {
        unique_twaps: uniqueTwaps,
        total_trades: totalTrades,
        total_volume: totalVolume,
      },
    });

  } catch (error: any) {
    console.error('[SUMMARY] ❌ Unhandled exception:', {
      error,
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        step: 'unhandled_exception',
        errorType: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

