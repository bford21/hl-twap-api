import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * DELTA/INCREMENTAL Leaderboard Update Script
 * 
 * This script only processes NEW trades since the last update,
 * making it extremely fast for regular updates (seconds instead of minutes).
 * 
 * Prerequisites:
 *   1. Populate leaderboard once via psql (all users with ranks)
 *   2. Then use this script for all subsequent updates
 * 
 * How it works:
 *   - Checks the last_updated timestamp from leaderboard_stats
 *   - Only processes trades added after that timestamp
 *   - Updates affected users' stats
 *   - Recalculates rankings for ALL users (not just top 100)
 * 
 * Expected execution time: 5-60 seconds (depending on new trades and user count)
 */

interface UserUpdate {
  user_address: string;
  new_twaps: number;
  new_trades: number;
  new_volume: string;
}

async function updateLeaderboardDelta() {
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
  
  // Use SESSION pooler for reliability
  const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    query_timeout: 60000, // 60 second timeout should be plenty for incremental updates
  });

  try {
    console.log('🔄 Starting DELTA leaderboard update...');
    const startTime = Date.now();

    // Step 1: Check if leaderboard has been initialized
    console.log('🔍 Checking leaderboard status...');
    const statusCheck = await pool.query(`
      SELECT 
        COUNT(*) as entry_count,
        MAX(last_updated) as last_update
      FROM leaderboard_stats
    `);

    const entryCount = Number(statusCheck.rows[0].entry_count);
    const lastUpdate = statusCheck.rows[0].last_update;

    if (entryCount === 0) {
      console.log('');
      console.log('⚠️  Leaderboard is empty!');
      console.log('');
      console.log('📋 Please run the initial setup first:');
      console.log('');
      console.log('   1. Make sure you have psql installed');
      console.log('   2. Run this command (replace YOUR_PROJECT_REF and YOUR_PASSWORD):');
      console.log('');
      console.log('      psql "postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres" -f scripts/initial-leaderboard-setup.sql');
      console.log('');
      console.log('   3. Then run this script again for incremental updates');
      console.log('');
      await pool.end();
      process.exit(1);
    }

    console.log(`   Last updated: ${lastUpdate}`);
    console.log(`   Current entries: ${entryCount}`);

    // Step 2: Find trades added since last update
    console.log('📊 Checking for new trades since last update...');
    const newTradesCheck = await pool.query(`
      SELECT COUNT(*) as new_trade_count
      FROM trades
      WHERE time > $1
    `, [lastUpdate]);

    const newTradeCount = Number(newTradesCheck.rows[0].new_trade_count);
    console.log(`   Found ${newTradeCount.toLocaleString()} new trades`);

    if (newTradeCount === 0) {
      console.log('');
      console.log('✨ Leaderboard is already up to date!');
      console.log('');
      await pool.end();
      return;
    }

    // Step 3: Get users affected by new trades
    console.log('👥 Finding users with new TWAP trades...');
    const affectedUsersResult = await pool.query(`
      SELECT DISTINCT tp.user_address
      FROM trade_participants tp
      INNER JOIN trades t ON tp.trade_id = t.id
      WHERE tp.twap_id IS NOT NULL
        AND t.time > $1
    `, [lastUpdate]);

    const affectedUsers = affectedUsersResult.rows.map(r => r.user_address);
    console.log(`   Found ${affectedUsers.length} users with new TWAP activity`);

    if (affectedUsers.length === 0) {
      console.log('   (New trades exist but none are TWAP trades)');
      console.log('');
      console.log('✨ Leaderboard is up to date (no new TWAP trades)!');
      console.log('');
      await pool.end();
      return;
    }

    // Step 4: Recalculate COMPLETE stats for ALL users (needed for accurate rankings)
    console.log('📈 Recalculating complete stats and rankings for all users...');
    
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
      SELECT * FROM ranked_users ORDER BY rank ASC
    `;

    const result = await pool.query(query);
    console.log(`   Calculated rankings for ${result.rows.length} users`);

    // Step 5: Update leaderboard table
    console.log('💾 Updating leaderboard table...');
    
    await pool.query('BEGIN');
    
    // Clear existing data
    await pool.query('TRUNCATE TABLE leaderboard_stats');
    
    // Insert updated rankings
    if (result.rows.length > 0) {
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
    }
    
    await pool.query('COMMIT');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✨ Leaderboard update complete!');
    console.log('');
    console.log(`📊 Update summary:`);
    console.log(`   - New trades processed: ${newTradeCount.toLocaleString()}`);
    console.log(`   - Users with new activity: ${affectedUsers.length}`);
    console.log(`   - Total leaderboard entries: ${result.rows.length.toLocaleString()}`);
    console.log(`   - Lowest rank: ${result.rows.length > 0 ? result.rows[result.rows.length - 1].rank : 0}`);
    console.log('');
    console.log(`📈 Top 10 users by volume:`);
    console.log('');
    
    const top10 = result.rows.slice(0, 10);
    top10.forEach(user => {
      const volume = parseFloat(user.total_volume);
      console.log(`   ${user.rank}. ${user.user_address.slice(0, 8)}...${user.user_address.slice(-6)} - $${volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${user.total_trades} trades, ${user.unique_twaps} TWAPs)`);
    });
    
    console.log('');
    console.log(`⏱️  Execution time: ${duration}s`);
    console.log(`📅 Updated at: ${new Date().toISOString()}`);
    console.log('');
    console.log('💡 This script runs fast because it only checks for new trades!');
    console.log('   Run it daily via cron to keep the leaderboard fresh.');
    console.log(`   Schedule: 0 0 * * * cd /path/to/project && npm run update:leaderboard:delta`);

  } catch (error) {
    console.error('❌ Error updating leaderboard:', error);
    await pool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the update
updateLeaderboardDelta()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

