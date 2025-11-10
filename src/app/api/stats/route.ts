import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

/**
 * GET /api/stats
 * 
 * Returns general statistics about the database
 * 
 * Response:
 *   {
 *     max_trade_id: number,
 *     total_traders: number | null
 *   }
 */
export async function GET() {
  try {
    // Get max trade ID
    const { data: maxIdData, error: maxIdError } = await supabase
      .from('trades')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (maxIdError && maxIdError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[Stats API] Error fetching max trade ID:', maxIdError);
      return NextResponse.json(
        { error: 'Failed to fetch stats' },
        { status: 500 }
      );
    }

    const maxTradeId = maxIdData?.id || 0;

    // Get total traders from leaderboard (if available)
    const { count: totalTraders } = await supabase
      .from('leaderboard_stats')
      .select('*', { count: 'exact', head: true });

    const response = NextResponse.json({
      max_trade_id: maxTradeId,
      total_traders: totalTraders || null
    });

    // Cache for 5 minutes
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return response;

  } catch (error) {
    console.error('[Stats API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

