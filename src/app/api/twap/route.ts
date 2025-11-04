import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/twap - Get list of TWAP IDs with summary stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coin = searchParams.get('coin');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get distinct TWAP IDs with trade counts
    let query = supabase
      .from('trade_participants')
      .select('twap_id, trade_id')
      .not('twap_id', 'is', null);

    const { data: participants, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        limit,
        offset,
      });
    }

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

      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('id, coin')
        .in('id', allTradeIds)
        .eq('coin', coin.toUpperCase());

      if (tradesError) {
        return NextResponse.json(
          { error: tradesError.message },
          { status: 500 }
        );
      }

      const coinTradeIds = new Set(trades?.map(t => t.id) || []);

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

