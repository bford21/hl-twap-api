import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/twap - Get list of TWAP IDs with summary stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coin = searchParams.get('coin');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch ALL participants with non-null twap_id in batches (Supabase has 1000 limit)
    const SUPABASE_MAX = 1000;
    const allParticipants: any[] = [];
    let currentOffset = 0;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('trade_participants')
        .select('twap_id, trade_id')
        .not('twap_id', 'is', null)
        .range(currentOffset, currentOffset + SUPABASE_MAX - 1);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      if (!batch || batch.length === 0) {
        break;
      }

      allParticipants.push(...batch);
      currentOffset += batch.length;

      // If we got fewer than requested, we've reached the end
      if (batch.length < SUPABASE_MAX) {
        break;
      }
    }

    if (allParticipants.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        limit,
        offset,
      });
    }

    const participants = allParticipants;

    // Group by TWAP ID and count trades
    const twapStats = new Map<number, Set<number>>();
    participants.forEach(p => {
      if (p.twap_id) {
        if (!twapStats.has(p.twap_id)) {
          twapStats.set(p.twap_id, new Set());
        }
        twapStats.get(p.twap_id)!.add(p.trade_id);
      }
    });

    // Convert to array and sort by trade count
    let twapList = Array.from(twapStats.entries()).map(([twap_id, tradeIds]) => ({
      twap_id,
      trade_count: tradeIds.size,
    })).sort((a, b) => b.trade_count - a.trade_count);

    // If filtering by coin, we need to check the actual trades
    if (coin) {
      const allTradeIds = Array.from(twapStats.values())
        .flatMap(set => Array.from(set));

      // Fetch trades in batches (Supabase limit)
      const allTrades: any[] = [];
      for (let i = 0; i < allTradeIds.length; i += SUPABASE_MAX) {
        const batchIds = allTradeIds.slice(i, i + SUPABASE_MAX);
        const { data: trades, error: tradesError } = await supabase
          .from('trades')
          .select('id, coin')
          .in('id', batchIds)
          .eq('coin', coin.toUpperCase());

        if (tradesError) {
          return NextResponse.json(
            { error: tradesError.message },
            { status: 500 }
          );
        }

        if (trades) {
          allTrades.push(...trades);
        }
      }

      const coinTradeIds = new Set(allTrades.map(t => t.id));

      // Recalculate stats for filtered trades
      twapStats.clear();
      participants.forEach(p => {
        if (p.twap_id && coinTradeIds.has(p.trade_id)) {
          if (!twapStats.has(p.twap_id)) {
            twapStats.set(p.twap_id, new Set());
          }
          twapStats.get(p.twap_id)!.add(p.trade_id);
        }
      });

      twapList = Array.from(twapStats.entries())
        .map(([twap_id, tradeIds]) => ({
          twap_id,
          trade_count: tradeIds.size,
        }))
        .filter(item => item.trade_count > 0)
        .sort((a, b) => b.trade_count - a.trade_count);
    }

    // Apply pagination
    const totalCount = twapList.length;
    const paginatedList = twapList.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginatedList,
      count: totalCount,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

