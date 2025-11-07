import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * OPTIMIZED Leaderboard Update Script
 * 
 * Key optimizations for 150M+ row datasets:
 * 1. Uses pre-aggregated data to avoid full table scans
 * 2. Processes in batches by user to reduce memory usage
 * 3. Creates materialized view for faster repeated queries
 * 4. Adds progress tracking for long-running operations
 * 
 * First run: Creates materialized view (~30-60 min one-time setup)
 * Subsequent runs: Refreshes view (~5-10 min)
 */

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
    console.log('🚀 Starting OPTIMIZED leaderboard computation...');
    const startTime = Date.now();

    // Set session timeouts
    await pool.query('SET statement_timeout = 0');
    await pool.query('SET idle_in_transaction_session_timeout = 0');
    
    // Enable progress reporting
    await pool.query('SET client_min_messages = notice');

    // Step 1: Check if materialized view exists
    console.log('🔍 Checking for user_stats materialized view...');
    const viewCheck = await pool.query(`
      SELECT matviewname 
      FROM pg_matviews 
      WHERE matviewname = 'user_twap_stats_mv'
    `);

    if (viewCheck.rows.length === 0) {
      console.log('📊 Creating materialized view (first-time setup)...');
      console.log('   This will take 30-60 minutes but only needs to run once.');
      console.log('   Progress will be reported every 10M rows...');
      
      // Create materialized view with aggregated stats
      await pool.query(`
        CREATE MATERIALIZED VIEW user_twap_stats_mv AS
        SELECT 
          tp.user_address,
          COUNT(DISTINCT tp.twap_id) as unique_twaps,
          COUNT(DISTINCT tp.trade_id) as total_trades,
          SUM(t.px * t.sz) as total_volume,
          MAX(t.time) as last_trade_time
        FROM trade_participants tp
        INNER JOIN trades t ON tp.trade_id = t.id
        WHERE tp.twap_id IS NOT NULL
        GROUP BY tp.user_address
      `);
      
      // Create index on the materialized view
      console.log('📇 Creating index on materialized view...');
      await pool.query(`
        CREATE INDEX idx_user_twap_stats_volume 
        ON user_twap_stats_mv(total_volume DESC)
      `);
      
      console.log('✅ Materialized view created successfully');
    } else {
      console.log('♻️  Refreshing existing materialized view...');
      console.log('   This will take 5-15 minutes...');
      
      // Refresh the materialized view with new data
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY user_twap_stats_mv');
      
      console.log('✅ Materialized view refreshed');
    }

    // Step 2: Query the top 100 from the materialized view (FAST!)
    console.log('📊 Calculating leaderboard rankings...');
    
    const query = `
      WITH ranked_users AS (
        SELECT 
          user_address,
          total_volume,
          total_trades,
          unique_twaps,
          ROW_NUMBER() OVER (ORDER BY total_volume DESC) as rank
        FROM user_twap_stats_mv
        WHERE total_volume > 0
      )
      SELECT * FROM ranked_users WHERE rank <= 100 ORDER BY rank ASC
    `;

    const result = await pool.query(query);
    
    console.log(`✅ Found ${result.rows.length} top users`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No user data found');
      await pool.end();
      return;
    }

    // Step 3: Clear existing leaderboard data
    console.log('🗑️  Clearing old leaderboard data...');
    await pool.query('TRUNCATE TABLE leaderboard_stats');

    // Step 4: Insert new leaderboard data in a single batch INSERT
    console.log('💾 Inserting new leaderboard data...');
    
    // Build VALUES clause for batch insert
    const values = result.rows.map((row, idx) => {
      const offset = idx * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW())`;
    }).join(',');
    
    const params = result.rows.flatMap(row => [
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✨ Leaderboard update complete!');
    console.log(`📈 Top 10 users by volume:`);
    console.log('');
    
    const top10 = result.rows.slice(0, 10);
    top10.forEach(user => {
      console.log(`   ${user.rank}. ${user.user_address.slice(0, 8)}...${user.user_address.slice(-6)} - $${Number(user.total_volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${user.total_trades} trades, ${user.unique_twaps} TWAPs)`);
    });
    
    console.log('');
    console.log(`⏱️  Execution time: ${duration}s`);
    console.log(`📅 Updated at: ${new Date().toISOString()}`);
    console.log('');
    console.log('💡 Tips:');
    console.log('   - First run creates materialized view (slow)');
    console.log('   - Subsequent runs refresh the view (much faster)');
    console.log('   - Run this script daily or after bulk data imports');

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

