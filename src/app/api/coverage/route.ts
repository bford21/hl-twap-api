import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/coverage - Get data coverage information
export async function GET() {
  try {
    // Use raw SQL to get all stats in a single optimized query
    const { data, error } = await supabase.rpc('get_coverage_stats');

    if (error) {
      console.log('RPC function error, using fallback:', error.message);
    }

    // Check if we got valid data from RPC
    if (!error && data && Array.isArray(data) && data.length > 0 && data[0].total_trades !== undefined) {
      const stats = data[0];
      return NextResponse.json({
        earliest_trade: stats.earliest_trade || null,
        latest_trade: stats.latest_trade || null,
        total_trades: stats.total_trades || 0,
        twap_trades: stats.twap_trades || 0,
        unique_twaps: stats.unique_twaps || 0,
        last_updated: new Date().toISOString(),
      });
    }

    // Fallback - use separate optimized queries
    console.log('Using fallback queries for coverage stats');
    
    // Fetch all stats in parallel for better performance
    const [tradesResult, maxData, totalCountResult, twapResult, uniqueTwapResult] = await Promise.all([
      // Earliest trade
      supabase.from('trades').select('time').order('time', { ascending: true }).limit(1),
      // Latest trade
      supabase.from('trades').select('time').order('time', { ascending: false }).limit(1),
      // Total trade count
      supabase.from('trades').select('*', { count: 'exact', head: true }),
      // TWAP trade count (trades with at least one participant with twap_id)
      supabase.from('trade_participants')
        .select('twap_id', { count: 'exact', head: true })
        .not('twap_id', 'is', null),
      // Unique TWAP count - fetch all TWAPs in batches and count unique
      (async () => {
        const allTwapIds = new Set<number>();
        let offset = 0;
        const batchSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('trade_participants')
            .select('twap_id')
            .not('twap_id', 'is', null)
            .range(offset, offset + batchSize - 1);
          
          if (error || !data || data.length === 0) break;
          
          data.forEach(row => {
            if (row.twap_id) allTwapIds.add(row.twap_id);
          });
          
          // If we got less than batch size, we've reached the end
          if (data.length < batchSize) break;
          
          offset += batchSize;
        }
        
        return allTwapIds.size;
      })()
    ]);

    return NextResponse.json({
      earliest_trade: tradesResult.data?.[0]?.time || null,
      latest_trade: maxData.data?.[0]?.time || null,
      total_trades: totalCountResult.count || 0,
      twap_trades: twapResult.count || 0,
      unique_twaps: uniqueTwapResult,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

