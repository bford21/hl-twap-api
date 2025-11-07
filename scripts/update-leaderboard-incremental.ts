import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * INCREMENTAL Leaderboard Update Script with Progress Tracking
 * 
 * Instead of materialized views, this processes users in batches
 * and shows real-time progress. Much better for large datasets.
 * 
 * Strategy:
 * 1. Get all unique users with TWAP trades (fast)
 * 2. Process in batches of 1000 users
 * 3. Show progress after each batch
 * 4. Calculate stats for each batch
 * 
 * Expected time: 10-30 minutes with progress updates every 30 seconds
 */

interface UserStats {
  user_address: string;
  unique_twaps: number;
  total_trades: number;
  total_volume: string;
}

async function updateLeaderboard() {
  // Validate environment variables
  if (!process.env.SUPABASE_URL) {
    console.error('❌ Error: SUPABASE_URL not found in .env file');
    process.exit(1);
  }

  if (!process.env.POSTGRES_PASSWORD) {
    console.error('❌ Error: POSTGRES_PASSWORD not found in .env file');
    process.exit(1);
  }

  // Parse Supabase URL to get project reference
  const supabaseUrl = new URL(process.env.SUPABASE_URL);
  const projectRef = supabaseUrl.hostname.split('.')[0];
  
  // URL-encode the password to handle special characters
  const encodedPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD);
  
  // Use SESSION pooler (port 5432) for long-running queries
  const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    query_timeout: 0,
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0
  });

  try {
    console.log('🚀 Starting INCREMENTAL leaderboard computation with progress tracking...');
    const startTime = Date.now();

    // Set session parameters
    await pool.query('SET statement_timeout = 0');
    await pool.query('SET idle_in_transaction_session_timeout = 0');
    await pool.query('SET work_mem = "256MB"'); // Increase working memory

    // Step 1: Get count of TWAP participants
    console.log('🔍 Checking dataset size...');
    const countResult = await pool.query(`
      SELECT COUNT(*) as twap_participant_count
      FROM trade_participants
      WHERE twap_id IS NOT NULL
    `);
    console.log(`   Found ${Number(countResult.rows[0].twap_participant_count).toLocaleString()} TWAP participant records`);

    // Step 2: Get all unique users with TWAP trades
    console.log('👥 Getting list of unique users with TWAP trades...');
    const usersResult = await pool.query(`
      SELECT DISTINCT user_address
      FROM trade_participants
      WHERE twap_id IS NOT NULL
      ORDER BY user_address
    `);
    
    const totalUsers = usersResult.rows.length;
    console.log(`   Found ${totalUsers.toLocaleString()} unique users with TWAP trades`);

    // Step 3: Process users in batches
    const BATCH_SIZE = 500;
    const batches = Math.ceil(totalUsers / BATCH_SIZE);
    const allStats: UserStats[] = [];

    console.log(`📊 Processing ${batches} batches of ${BATCH_SIZE} users each...`);
    console.log('');

    for (let batchNum = 0; batchNum < batches; batchNum++) {
      const batchStart = Date.now();
      const startIdx = batchNum * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, totalUsers);
      const batchUsers = usersResult.rows.slice(startIdx, endIdx).map(r => r.user_address);

      // Calculate stats for this batch of users
      const batchQuery = `
        SELECT 
          tp.user_address,
          COUNT(DISTINCT tp.twap_id) as unique_twaps,
          COUNT(DISTINCT tp.trade_id) as total_trades,
          SUM(t.px * t.sz) as total_volume
        FROM trade_participants tp
        INNER JOIN trades t ON tp.trade_id = t.id
        WHERE tp.twap_id IS NOT NULL
          AND tp.user_address = ANY($1)
        GROUP BY tp.user_address
      `;

      const batchResult = await pool.query(batchQuery, [batchUsers]);
      allStats.push(...batchResult.rows);

      const batchDuration = ((Date.now() - batchStart) / 1000).toFixed(1);
      const progress = ((endIdx / totalUsers) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const remaining = ((Date.now() - startTime) / endIdx * (totalUsers - endIdx) / 1000).toFixed(0);

      console.log(`   Batch ${batchNum + 1}/${batches} (${progress}%) - ${batchResult.rows.length} users in ${batchDuration}s | Elapsed: ${elapsed}s | ETA: ${remaining}s`);
    }

    console.log('');
    console.log(`✅ Computed stats for ${allStats.length.toLocaleString()} users`);

    // Step 4: Rank users by volume
    console.log('📈 Ranking users by volume...');
    const sortedStats = allStats
      .filter(s => parseFloat(s.total_volume) > 0)
      .sort((a, b) => parseFloat(b.total_volume) - parseFloat(a.total_volume))
      .slice(0, 100)
      .map((s, idx) => ({
        ...s,
        rank: idx + 1
      }));

    console.log(`   Top 100 users selected`);

    // Step 5: Clear existing leaderboard data
    console.log('🗑️  Clearing old leaderboard data...');
    await pool.query('TRUNCATE TABLE leaderboard_stats');

    // Step 6: Insert new leaderboard data in a single batch
    console.log('💾 Inserting new leaderboard data...');
    
    if (sortedStats.length > 0) {
      const values = sortedStats.map((row, idx) => {
        const offset = idx * 5;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW())`;
      }).join(',');
      
      const params = sortedStats.flatMap(row => [
        row.user_address,
        row.total_volume,
        row.total_trades,
        row.unique_twaps,
        row.rank
      ]);
      
      await pool.query(`
        INSERT INTO leaderboard_stats (user_address, total_volume, total_trades, unique_twaps, rank, last_updated)
        VALUES ${values}
      `, params);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✨ Leaderboard update complete!');
    console.log(`📈 Top 10 users by volume:`);
    console.log('');
    
    const top10 = sortedStats.slice(0, 10);
    top10.forEach(user => {
      const volume = parseFloat(user.total_volume);
      console.log(`   ${user.rank}. ${user.user_address.slice(0, 8)}...${user.user_address.slice(-6)} - $${volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${user.total_trades} trades, ${user.unique_twaps} TWAPs)`);
    });
    
    console.log('');
    console.log(`⏱️  Total execution time: ${duration}s`);
    console.log(`📅 Updated at: ${new Date().toISOString()}`);

  } catch (error) {
    console.error('❌ Error updating leaderboard:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the update
updateLeaderboard()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

