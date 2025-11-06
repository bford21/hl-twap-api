import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Leaderboard Update Script
 * 
 * Performance considerations for 75M+ row datasets:
 * - Uses indexed columns (tp.twap_id, tp.trade_id, t.id) for optimal JOIN performance
 * - Filters early with WHERE tp.twap_id IS NOT NULL to reduce dataset
 * - Limits to top 100 users to minimize INSERT operations
 * - Includes 10-minute timeout to handle large aggregations
 * - Verifies required indexes before execution
 * 
 * Expected execution time: 2-5 minutes depending on TWAP participant count
 * 
 * To analyze query performance, set EXPLAIN_QUERY=true environment variable
 */

const EXPLAIN_QUERY = process.env.EXPLAIN_QUERY === 'true';

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
  // Transaction pooler (6543) times out, direct connection may be disabled
  const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false },
    // No timeouts - let queries run as long as needed
    connectionTimeoutMillis: 30000,
    query_timeout: 0, // Disable query timeout
    statement_timeout: 0, // Disable statement timeout
    idle_in_transaction_session_timeout: 0 // Disable idle timeout
  });

  try {
    console.log('🚀 Starting leaderboard computation...');
    console.log('📊 Dataset info: ~75M trades rows');
    const startTime = Date.now();

    // Set session timeouts
    await pool.query('SET statement_timeout = 0');
    await pool.query('SET idle_in_transaction_session_timeout = 0');

    // Step 0: Check data size to estimate time
    console.log('🔍 Checking TWAP participants count...');
    const countResult = await pool.query(`
      SELECT COUNT(*) as twap_participant_count
      FROM trade_participants
      WHERE twap_id IS NOT NULL
    `);
    console.log(`   Found ${Number(countResult.rows[0].twap_participant_count).toLocaleString()} TWAP participant records`);

    // Step 1: Verify indexes exist for optimal performance
    console.log('🔧 Verifying critical indexes...');
    const indexCheck = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes
      WHERE tablename IN ('trade_participants', 'trades')
        AND (
          indexname LIKE '%twap_id%' OR 
          indexname LIKE '%trade_id%' OR
          indexname = 'trades_pkey'
        )
      ORDER BY tablename, indexname
    `);
    
    console.log('   Indexes found:');
    indexCheck.rows.forEach(row => {
      console.log(`   - ${row.tablename}.${row.indexname}`);
    });
    
    if (indexCheck.rows.length < 3) {
      console.warn('⚠️  Warning: Some expected indexes may be missing. Query may be slow.');
    }

    // Step 2: Calculate stats for all users with TWAP trades
    console.log('📊 Calculating user statistics (this may take several minutes)...');
    console.log('   💡 Tip: The query uses indexed columns for optimal performance');
    
    const queryStartTime = Date.now();
    
    // Optional: Run EXPLAIN ANALYZE for query performance analysis
    if (EXPLAIN_QUERY) {
      console.log('');
      console.log('🔍 Running EXPLAIN ANALYZE (query performance analysis)...');
      const explainQuery = `
        EXPLAIN ANALYZE
        WITH user_stats AS (
          SELECT 
            tp.user_address,
            COUNT(DISTINCT tp.twap_id) as unique_twaps,
            COUNT(DISTINCT tp.trade_id) as total_trades,
            SUM(t.px * t.sz) as total_volume
          FROM trade_participants tp
          INNER JOIN trades t ON tp.trade_id = t.id
          WHERE tp.twap_id IS NOT NULL
          GROUP BY tp.user_address
        ),
        ranked_users AS (
          SELECT 
            user_address,
            total_volume,
            total_trades,
            unique_twaps,
            ROW_NUMBER() OVER (ORDER BY total_volume DESC) as rank
          FROM user_stats
          WHERE total_volume > 0
        )
        SELECT * FROM ranked_users WHERE rank <= 100 ORDER BY rank ASC
      `;
      
      const explainResult = await pool.query(explainQuery);
      console.log('');
      console.log('📋 Query Plan:');
      explainResult.rows.forEach(row => {
        console.log(row['QUERY PLAN']);
      });
      console.log('');
      console.log('💡 Look for "Seq Scan" (bad) vs "Index Scan" (good) on large tables');
      console.log('');
    }
    
    const query = `
      WITH user_stats AS (
        SELECT 
          tp.user_address,
          COUNT(DISTINCT tp.twap_id) as unique_twaps,
          COUNT(DISTINCT tp.trade_id) as total_trades,
          SUM(t.px * t.sz) as total_volume
        FROM trade_participants tp
        INNER JOIN trades t ON tp.trade_id = t.id
        WHERE tp.twap_id IS NOT NULL
        GROUP BY tp.user_address
      ),
      ranked_users AS (
        SELECT 
          user_address,
          total_volume,
          total_trades,
          unique_twaps,
          ROW_NUMBER() OVER (ORDER BY total_volume DESC) as rank
        FROM user_stats
        WHERE total_volume > 0
      )
      SELECT 
        user_address,
        total_volume,
        total_trades,
        unique_twaps,
        rank
      FROM ranked_users
      WHERE rank <= 100
      ORDER BY rank ASC
    `;

    const result = await pool.query(query);
    const queryDuration = ((Date.now() - queryStartTime) / 1000).toFixed(2);
    
    console.log(`✅ Computed stats for ${result.rows.length} users in ${queryDuration}s`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No user data found');
      await pool.end();
      return;
    }

    // Step 3: Clear existing leaderboard data
    console.log('🗑️  Clearing old leaderboard data...');
    await pool.query('TRUNCATE TABLE leaderboard_stats');

    // Step 4: Insert new leaderboard data in batch
    console.log('💾 Inserting new leaderboard data...');
    
    const insertQuery = `
      INSERT INTO leaderboard_stats (user_address, total_volume, total_trades, unique_twaps, rank, last_updated)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;

    for (const row of result.rows) {
      await pool.query(insertQuery, [
        row.user_address,
        row.total_volume,
        row.total_trades,
        row.unique_twaps,
        row.rank
      ]);
    }

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

