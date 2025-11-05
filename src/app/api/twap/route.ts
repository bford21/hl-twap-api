import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic rendering - API routes should not be pre-rendered
export const dynamic = 'force-dynamic';

// GET /api/twap - Get list of TWAP IDs with summary stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coin = searchParams.get('coin');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Simplified approach: Just get distinct TWAP IDs with limit/offset
    // We sacrifice exact trade counts for performance
    let data: any;
    let error: any;

    if (coin) {
      // If filtering by coin, join with trades
      const result = await supabase
        .from('trade_participants')
        .select('twap_id, trades!inner(coin)')
        .not('twap_id', 'is', null)
        .eq('trades.coin', coin.toUpperCase())
        .range(offset, offset + limit - 1);
      
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from('trade_participants')
        .select('twap_id')
        .not('twap_id', 'is', null)
        .range(offset, offset + limit - 1);
      
      data = result.data;
      error = result.error;
    }

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        limit,
        offset,
      });
    }

    // Get unique TWAP IDs from the fetched data
    const uniqueTwapIds = Array.from(new Set(data.map((d: any) => d.twap_id)));

    // For each TWAP ID, get a quick count (limit to 1000 to avoid timeout)
    const twapList = await Promise.all(
      uniqueTwapIds.slice(0, limit).map(async (twapId) => {
        const { count } = await supabase
          .from('trade_participants')
          .select('trade_id', { count: 'exact', head: true })
          .eq('twap_id', twapId);

        return {
          twap_id: twapId,
          trade_count: count || 0,
        };
      })
    );

    // Sort by trade count
    twapList.sort((a, b) => b.trade_count - a.trade_count);

    // Get total count of unique TWAPs (estimate based on first batch)
    const totalCount = uniqueTwapIds.length;

    return NextResponse.json({
      data: twapList,
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

