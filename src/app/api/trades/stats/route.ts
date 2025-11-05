import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering - API routes should not be pre-rendered
export const dynamic = 'force-dynamic';

// GET /api/trades/stats - Get aggregated trade statistics
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coin = searchParams.get('coin');
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Calculate time threshold
    const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Build base query
    let query = `
      SELECT 
        coin,
        COUNT(*) as trade_count,
        MIN(px) as min_price,
        MAX(px) as max_price,
        AVG(px) as avg_price,
        SUM(sz) as total_volume,
        MIN(time) as first_trade,
        MAX(time) as last_trade
      FROM trades
      WHERE time >= '${timeThreshold}'
    `;

    if (coin) {
      query += ` AND coin = '${coin.toUpperCase()}'`;
    }

    query += ' GROUP BY coin ORDER BY trade_count DESC';

    const { data, error } = await supabase.rpc('execute_sql', { query_text: query });

    if (error) {
      // Fallback to manual aggregation if RPC doesn't work
      let baseQuery = supabase
        .from('trades')
        .select('coin, px, sz, time')
        .gte('time', timeThreshold);

      if (coin) {
        baseQuery = baseQuery.eq('coin', coin.toUpperCase());
      }

      const { data: trades, error: fetchError } = await baseQuery;

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 }
        );
      }

      // Manually aggregate
      const statsByCoin = new Map();

      trades?.forEach(trade => {
        if (!statsByCoin.has(trade.coin)) {
          statsByCoin.set(trade.coin, {
            coin: trade.coin,
            trade_count: 0,
            min_price: Infinity,
            max_price: -Infinity,
            total_price: 0,
            total_volume: 0,
            first_trade: trade.time,
            last_trade: trade.time,
          });
        }

        const stats = statsByCoin.get(trade.coin);
        stats.trade_count++;
        stats.min_price = Math.min(stats.min_price, trade.px);
        stats.max_price = Math.max(stats.max_price, trade.px);
        stats.total_price += trade.px;
        stats.total_volume += trade.sz;
        if (trade.time < stats.first_trade) stats.first_trade = trade.time;
        if (trade.time > stats.last_trade) stats.last_trade = trade.time;
      });

      const aggregatedData = Array.from(statsByCoin.values()).map(stats => ({
        coin: stats.coin,
        trade_count: stats.trade_count,
        min_price: stats.min_price,
        max_price: stats.max_price,
        avg_price: stats.total_price / stats.trade_count,
        total_volume: stats.total_volume,
        first_trade: stats.first_trade,
        last_trade: stats.last_trade,
      }));

      aggregatedData.sort((a, b) => b.trade_count - a.trade_count);

      // Apply pagination to aggregated results
      const paginatedData = aggregatedData.slice(offset, offset + limit);

      return NextResponse.json({
        data: paginatedData,
        count: aggregatedData.length,
        limit,
        offset,
        time_range_hours: hours,
        generated_at: new Date().toISOString(),
      });
    }

    // Paginate raw results
    const paginatedData = data.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginatedData,
      count: data.length,
      limit,
      offset,
      time_range_hours: hours,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

