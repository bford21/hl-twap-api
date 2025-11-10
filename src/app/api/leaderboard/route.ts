import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache for 1 hour since leaderboard updates once per day

/**
 * GET /api/leaderboard
 * 
 * Returns the top TWAP traders by volume
 * 
 * Query Parameters:
 *   limit: number (default: 10, max: 100) - Number of entries to return
 * 
 * Response:
 *   {
 *     data: [
 *       {
 *         rank: number,
 *         user_address: string,
 *         total_volume: number,
 *         total_trades: number,
 *         unique_twaps: number,
 *         last_updated: string
 *       }
 *     ],
 *     count: number,
 *     last_updated: string
 *   }
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);

    console.log('[Leaderboard API] Fetching leaderboard with limit:', limit);

    // Fetch leaderboard data
    const { data, error, count } = await supabase
      .from('leaderboard_stats')
      .select('*', { count: 'exact' })
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Leaderboard API] Supabase error:', error);
      console.error('[Leaderboard API] Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { 
          error: 'Failed to fetch leaderboard data', 
          details: error.message,
          hint: error.hint || 'Check if leaderboard_stats table exists and has data'
        },
        { status: 500 }
      );
    }

    console.log('[Leaderboard API] Successfully fetched', data?.length || 0, 'entries');

    // Get the most recent update time
    const lastUpdated = data && data.length > 0 
      ? data[0].last_updated 
      : null;

    const response = NextResponse.json({
      data: data || [],
      count: count || 0,
      last_updated: lastUpdated
    });

    // Add cache headers - cache for 1 hour since leaderboard updates once per day
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    
    return response;

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

