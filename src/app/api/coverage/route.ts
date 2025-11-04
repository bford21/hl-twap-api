import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/coverage - Get data coverage information
export async function GET() {
  try {
    // Get min and max timestamps, and total count
    const { data, error } = await supabase
      .from('trades')
      .select('time')
      .order('time', { ascending: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const { data: latestData, error: latestError } = await supabase
      .from('trades')
      .select('time')
      .order('time', { ascending: false })
      .limit(1);

    if (latestError) {
      return NextResponse.json(
        { error: latestError.message },
        { status: 500 }
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return NextResponse.json(
        { error: countError.message },
        { status: 500 }
      );
    }

    // Get count of trades with TWAP IDs
    const { count: twapCount, error: twapError } = await supabase
      .from('trade_participants')
      .select('trade_id', { count: 'exact', head: true })
      .not('twap_id', 'is', null);

    if (twapError) {
      return NextResponse.json(
        { error: twapError.message },
        { status: 500 }
      );
    }

    // Get unique TWAP count
    const { data: uniqueTwaps, error: uniqueError } = await supabase
      .from('trade_participants')
      .select('twap_id')
      .not('twap_id', 'is', null);

    if (uniqueError) {
      return NextResponse.json(
        { error: uniqueError.message },
        { status: 500 }
      );
    }

    const uniqueTwapIds = new Set(uniqueTwaps?.map(t => t.twap_id) || []);

    return NextResponse.json({
      earliest_trade: data?.[0]?.time || null,
      latest_trade: latestData?.[0]?.time || null,
      total_trades: count || 0,
      twap_trades: twapCount || 0,
      unique_twaps: uniqueTwapIds.size,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

