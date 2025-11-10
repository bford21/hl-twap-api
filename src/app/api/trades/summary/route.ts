import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Pool } from 'pg';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Cache for total trader count (refreshed every 10 minutes)
let cachedTotalTraders: { count: number; timestamp: number } | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

async function getTotalTraders(): Promise<number | null> {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedTotalTraders && (now - cachedTotalTraders.timestamp) < CACHE_DURATION) {
    return cachedTotalTraders.count;
  }
  
  // Fetch fresh count
  const { count } = await supabase
    .from('leaderboard_stats')
    .select('*', { count: 'exact', head: true });
  
  if (count !== null) {
    cachedTotalTraders = { count, timestamp: now };
    return count;
  }
  
  return null;
}

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

    // NEW APPROACH: Use leaderboard table for summary stats (instant!)
    console.log(`[SUMMARY] Step 1: Checking leaderboard for pre-calculated stats...`);
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from('leaderboard_stats')
      .select('total_volume, total_trades, unique_twaps, rank')
      .eq('user_address', user.toLowerCase())
      .single();

    let summaryStats = null;
    let userRank = null;
    let totalTraders = null;
    
    if (leaderboardData && !leaderboardError) {
      console.log(`[SUMMARY] ✅ Found user in leaderboard! Rank: ${leaderboardData.rank}`);
      summaryStats = {
        unique_twaps: leaderboardData.unique_twaps,
        total_trades: leaderboardData.total_trades,
        total_volume: parseFloat(leaderboardData.total_volume),
      };
      userRank = leaderboardData.rank;
      
      // Get total trader count for context (cached for 10 minutes)
      totalTraders = await getTotalTraders();
      console.log(`[SUMMARY] Total traders in leaderboard: ${totalTraders}`);
    } else {
      console.log(`[SUMMARY] User not in leaderboard, will calculate from scratch...`);
    }

    // OPTIMIZED: Get TWAP summaries using database aggregation (server-side grouping)
    console.log(`[SUMMARY] Step 2: Fetching TWAP order summaries via aggregation...`);
    
    // Use direct postgres connection for complex aggregation query
    if (!process.env.SUPABASE_URL || !process.env.POSTGRES_PASSWORD) {
      throw new Error('Missing database credentials');
    }

    const supabaseUrl = new URL(process.env.SUPABASE_URL);
    const projectRef = supabaseUrl.hostname.split('.')[0];
    const encodedPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;

    const pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      query_timeout: 30000, // 30 second timeout
    });

    try {
      // Aggregation query - does the heavy lifting on the database server
      const query = `
        SELECT 
          tp.twap_id,
          tp.user_address as address,
          STRING_AGG(DISTINCT t.coin, ', ' ORDER BY t.coin) as coin,
          STRING_AGG(DISTINCT 
            CASE 
              WHEN tp.side = 'A' THEN 'Sell'
              WHEN tp.side = 'B' THEN 'Buy'
              ELSE tp.side
            END, ', '
          ) as side,
          COUNT(DISTINCT tp.trade_id) as trade_count,
          SUM(t.px * t.sz) as total_volume,
          AVG(t.px) as avg_price
        FROM trade_participants tp
        INNER JOIN trades t ON tp.trade_id = t.id
        WHERE tp.user_address = $1
          AND tp.twap_id IS NOT NULL
        GROUP BY tp.twap_id, tp.user_address
        ORDER BY tp.twap_id DESC
      `;

      const result = await pool.query(query, [user.toLowerCase()]);
      
      console.log(`[SUMMARY] ✅ Found ${result.rows.length} TWAP orders`);

      // If we don't have summary stats from leaderboard, calculate them here
      if (!summaryStats && result.rows.length > 0) {
        const uniqueTwaps = result.rows.length;
        const totalTrades = result.rows.reduce((sum, row) => sum + parseInt(row.trade_count), 0);
        const totalVolume = result.rows.reduce((sum, row) => sum + parseFloat(row.total_volume || 0), 0);
        
        summaryStats = {
          unique_twaps: uniqueTwaps,
          total_trades: totalTrades,
          total_volume: totalVolume,
        };
      }

      // Return empty result if no data
      if (result.rows.length === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          stats: summaryStats || {
            unique_twaps: 0,
            total_trades: 0,
            total_volume: 0,
          },
          rank: userRank,
          total_traders: totalTraders,
        });
      }

      // Format results
      const formattedData = result.rows.map(row => ({
        twap_id: parseInt(row.twap_id),
        address: row.address,
        coin: row.coin,
        side: row.side,
        trade_count: parseInt(row.trade_count),
        total_volume: parseFloat(row.total_volume),
        avg_price: parseFloat(row.avg_price),
      }));

      console.log(`[SUMMARY] ✅ Success - Returning ${formattedData.length} TWAP summaries`);
      console.log(`[SUMMARY] Stats: ${summaryStats?.unique_twaps} TWAPs, ${summaryStats?.total_trades} trades, $${summaryStats?.total_volume.toFixed(2)} volume`);
      if (userRank) {
        console.log(`[SUMMARY] User rank: #${userRank} out of ${totalTraders}`);
      }

      return NextResponse.json({
        data: formattedData,
        count: formattedData.length,
        stats: summaryStats || {
          unique_twaps: 0,
          total_trades: 0,
          total_volume: 0,
        },
        rank: userRank,
        total_traders: totalTraders,
      });

    } finally {
      await pool.end();
    }


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

