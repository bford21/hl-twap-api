#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { pipeline } from 'stream/promises';
import { from as copyFrom } from 'pg-copy-streams';
import { config } from 'dotenv';

// Load environment variables
config();

interface DayCsvs {
  dayName: string;
  tradesPath: string;
  participantsPath: string;
  source: string; // 'node_trades' or 'node_fills_by_block'
}

interface ImportStats {
  daysProcessed: number;
  tradesImported: number;
  participantsImported: number;
  errors: number;
  startTime: number;
}

// Find all CSV pairs in a directory structure
function findCsvPairs(baseDir: string, sourceName: string): DayCsvs[] {
  const csvPairs: DayCsvs[] = [];
  
  // Look for hourly subdirectory
  const hourlyDir = path.join(baseDir, 'hourly');
  if (!fs.existsSync(hourlyDir)) {
    return csvPairs;
  }
  
  const items = fs.readdirSync(hourlyDir);
  for (const item of items) {
    if (item.startsWith('.')) continue;
    
    const fullPath = path.join(hourlyDir, item);
    const stat = fs.statSync(fullPath);
    
    // Look for YYYYMMDD directories
    if (stat.isDirectory() && /^\d{8}$/.test(item)) {
      const tradesPath = path.join(fullPath, `trades_${item}.csv`);
      const participantsPath = path.join(fullPath, `trade_participants_${item}.csv`);
      
      // Only include if both files exist
      if (fs.existsSync(tradesPath) && fs.existsSync(participantsPath)) {
        csvPairs.push({
          dayName: item,
          tradesPath,
          participantsPath,
          source: sourceName,
        });
      }
    }
  }
  
  return csvPairs;
}

// Get line count from a file (for progress tracking)
function getLineCount(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.trim().split('\n').length;
  } catch (error) {
    return 0;
  }
}

async function importDay(
  client: Client,
  day: DayCsvs,
  stats: ImportStats
): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📅 Importing ${day.dayName} (${day.source}) → staging`);
  console.log(`${'='.repeat(70)}`);
  
  try {
    const startTime = Date.now();
    
    // Get file sizes for progress info
    const tradesLines = getLineCount(day.tradesPath);
    const participantsLines = getLineCount(day.participantsPath);
    
    console.log(`  📊 Expected: ${tradesLines.toLocaleString()} trades, ${participantsLines.toLocaleString()} participants`);
    
    // Import trades to STAGING using COPY FROM STDIN
    console.log(`  ⏳ Importing trades to staging...`);
    const tradesStart = Date.now();
    
    const tradesStream = client.query(
      copyFrom(`COPY trades_staging(id, coin, time, px, sz, hash, trade_dir_override) FROM STDIN WITH (FORMAT csv, NULL '\\N')`)
    );
    const tradesFileStream = fs.createReadStream(day.tradesPath);
    await pipeline(tradesFileStream, tradesStream);
    
    const tradesDuration = Date.now() - tradesStart;
    console.log(`  ✓ Trades imported in ${(tradesDuration / 1000).toFixed(2)}s`);
    
    // Import participants to STAGING using COPY FROM STDIN
    console.log(`  ⏳ Importing participants to staging...`);
    const participantsStart = Date.now();
    
    const participantsStream = client.query(
      copyFrom(`COPY trade_participants_staging(trade_id, user_address, side, start_pos, oid, twap_id, cloid) FROM STDIN WITH (FORMAT csv, NULL '\\N')`)
    );
    const participantsFileStream = fs.createReadStream(day.participantsPath);
    await pipeline(participantsFileStream, participantsStream);
    
    const participantsDuration = Date.now() - participantsStart;
    console.log(`  ✓ Participants imported in ${(participantsDuration / 1000).toFixed(2)}s`);
    
    const totalDuration = Date.now() - startTime;
    const tradesRate = tradesLines / (totalDuration / 1000);
    
    console.log(`  📈 Total: ${totalDuration / 1000}s | Rate: ${tradesRate.toFixed(0)} trades/sec`);
    
    stats.daysProcessed++;
    stats.tradesImported += tradesLines;
    stats.participantsImported += participantsLines;
    
  } catch (error) {
    console.error(`  ❌ Error importing ${day.dayName}:`, error);
    stats.errors++;
    throw error; // Re-throw to stop processing
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function main() {
  const args = process.argv.slice(2);
  const baseDir = args.find(arg => !arg.startsWith('--')) || './hl-data';
  const skipSequence = args.includes('--skip-sequence');
  const stagingOnly = args.includes('--staging-only');
  const migrateOnly = args.includes('--migrate-only');
  
  // Parse --start-date parameter
  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const startDate = startDateArg ? startDateArg.split('=')[1] : null;
  
  // Validate start date format if provided
  if (startDate && !/^\d{8}$/.test(startDate)) {
    console.error(`❌ Error: Invalid start date format "${startDate}". Expected format: YYYYMMDD (e.g., 20251006)`);
    process.exit(1);
  }
  
  console.log('🚀 Unified PostgreSQL CSV Import Script (with Staging Tables)');
  console.log('='.repeat(70));
  console.log(`Base directory: ${baseDir}`);
  console.log(`Mode: ${stagingOnly ? 'STAGING ONLY (will not migrate)' : migrateOnly ? 'MIGRATE ONLY (expects staging loaded)' : 'FULL (staging + migration)'}`);
  console.log(`Skip sequence update: ${skipSequence ? 'Yes' : 'No'}`);
  if (startDate) {
    console.log(`Start date filter: ${startDate} (${startDate.substring(0,4)}-${startDate.substring(4,6)}-${startDate.substring(6,8)})`);
  }
  console.log('='.repeat(70));

  if (!fs.existsSync(baseDir)) {
    console.error(`❌ Error: Base directory not found: ${baseDir}`);
    process.exit(1);
  }

  // Validate mutually exclusive flags
  if (stagingOnly && migrateOnly) {
    console.error('❌ Error: Cannot use both --staging-only and --migrate-only flags simultaneously.');
    process.exit(1);
  }

  // Validate environment variables
  if (!process.env.SUPABASE_URL) {
    console.error('❌ Error: SUPABASE_URL not found in .env file');
    process.exit(1);
  }

  if (!process.env.POSTGRES_PASSWORD) {
    console.error('❌ Error: POSTGRES_PASSWORD not found in .env file');
    console.error('   This is your database password from Supabase project settings.');
    console.error('   Add it to your .env file: POSTGRES_PASSWORD=your_db_password');
    process.exit(1);
  }

  // Parse Supabase URL to get project reference
  const supabaseUrl = new URL(process.env.SUPABASE_URL);
  const projectRef = supabaseUrl.hostname.split('.')[0];
  
  // URL-encode the password to handle special characters
  const encodedPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD);
  
  // Try different connection methods
  const connectionStrings = [
    // Shared Connection Pooler (pgbouncer) - Transaction mode (port 6543)
    `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
    // Alternative without pgbouncer param
    `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    // Session pooler (port 5432)
    `postgresql://postgres.${projectRef}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
  ];

  // Scan for CSV files (skip if --migrate-only)
  let csvPairs: DayCsvs[] = [];
  
  if (!migrateOnly) {
    console.log(`\n🔍 Scanning for CSV files...`);
    
    // Scan node_trades directory
    const nodeTradesDir = path.join(baseDir, 'node_trades');
    if (fs.existsSync(nodeTradesDir)) {
      console.log(`  📂 Scanning node_trades...`);
      const nodeTradesPairs = findCsvPairs(nodeTradesDir, 'node_trades');
      console.log(`     Found ${nodeTradesPairs.length} day(s)`);
      csvPairs.push(...nodeTradesPairs);
    } else {
      console.log(`  ⚠️  node_trades directory not found, skipping`);
    }
    
    // Scan node_fills_by_block directory
    const nodeFillsDir = path.join(baseDir, 'node_fills_by_block');
    if (fs.existsSync(nodeFillsDir)) {
      console.log(`  📂 Scanning node_fills_by_block...`);
      const nodeFillsPairs = findCsvPairs(nodeFillsDir, 'node_fills_by_block');
      console.log(`     Found ${nodeFillsPairs.length} day(s)`);
      csvPairs.push(...nodeFillsPairs);
    } else {
      console.log(`  ⚠️  node_fills_by_block directory not found, skipping`);
    }
    
    if (csvPairs.length === 0) {
      console.error(`❌ No CSV pairs found in ${baseDir}`);
      console.log('Expected structure:');
      console.log('  {baseDir}/node_trades/hourly/YYYYMMDD/trades_YYYYMMDD.csv');
      console.log('  {baseDir}/node_trades/hourly/YYYYMMDD/trade_participants_YYYYMMDD.csv');
      console.log('  {baseDir}/node_fills_by_block/hourly/YYYYMMDD/trades_YYYYMMDD.csv');
      console.log('  {baseDir}/node_fills_by_block/hourly/YYYYMMDD/trade_participants_YYYYMMDD.csv');
      process.exit(1);
    }
    
    // Sort all CSV pairs by day name (chronological order)
    csvPairs.sort((a, b) => a.dayName.localeCompare(b.dayName));

    // Filter by start date if provided
    if (startDate) {
      const beforeFilter = csvPairs.length;
      const originalFirstDay = csvPairs[0]?.dayName;
      const originalLastDay = csvPairs[csvPairs.length - 1]?.dayName;
      
      csvPairs = csvPairs.filter(pair => pair.dayName >= startDate);
      const afterFilter = csvPairs.length;
      
      if (afterFilter === 0) {
        console.error(`\n❌ Error: No CSV files found on or after ${startDate}`);
        console.log(`   Available date range: ${originalFirstDay} to ${originalLastDay}`);
        process.exit(1);
      }
      
      console.log(`\n🗓️  Filtered by start date: ${beforeFilter} → ${afterFilter} day(s) (skipped ${beforeFilter - afterFilter})`);
    }

    const firstDay = csvPairs[0].dayName;
    const lastDay = csvPairs[csvPairs.length - 1].dayName;
    
    console.log(`\n📁 Total: ${csvPairs.length} day(s) to import`);
    console.log(`📅 Date range: ${firstDay} to ${lastDay}`);
    
    // Group by source for summary
    const bySource = csvPairs.reduce((acc, pair) => {
      acc[pair.source] = (acc[pair.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`📊 Breakdown:`);
    for (const [source, count] of Object.entries(bySource)) {
      console.log(`   ${source}: ${count} day(s)`);
    }

    if (stagingOnly) {
      console.log('\n📋 Phase 1: LOAD TO STAGING');
      console.log('   Will load all CSVs into staging tables');
      console.log('   ⚠️  Will NOT migrate to production (use --migrate-only later)');
    } else {
      console.log('\n📋 Import Strategy: STAGING → PRODUCTION');
      console.log('   1. Load all CSVs into staging tables (fast, no constraints)');
      console.log('   2. Verify data integrity and check for ID conflicts');
      console.log('   3. Migrate from staging to production (atomic transaction)');
      console.log('   4. Update sequence and cleanup');
    }
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } else {
    console.log('\n📋 Phase 2: MIGRATE TO PRODUCTION');
    console.log('   Will migrate data from staging tables to production');
    console.log('   (Assumes staging tables are already loaded)');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const stats: ImportStats = {
    daysProcessed: 0,
    tradesImported: 0,
    participantsImported: 0,
    errors: 0,
    startTime: Date.now(),
  };

  // Connect to PostgreSQL
  console.log('🔌 Connecting to PostgreSQL...');
  
  let client: Client | null = null;
  let connectedMethod = '';

  // Try each connection method
  for (let i = 0; i < connectionStrings.length; i++) {
    const connectionString = connectionStrings[i];
    const methodNames = [
      'Shared Pooler with pgbouncer (port 6543)',
      'Shared Pooler without pgbouncer (port 6543)',
      'Session Pooler (port 5432)',
    ];
    const methodName = methodNames[i];
    
    try {
      console.log(`   Trying ${methodName}...`);
      
      const testClient = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000, // 30 seconds to establish connection
        query_timeout: 0, // No query timeout (for large COPY operations)
        statement_timeout: 0, // No statement timeout
      });
      
      await testClient.connect();
      
      // Disable timeouts for this session (for long-running COPY operations)
      await testClient.query('SET statement_timeout = 0');
      await testClient.query('SET idle_in_transaction_session_timeout = 0');
      client = testClient;
      connectedMethod = methodName;
      console.log(`✓ Connected via ${methodName}\n`);
      break;
    } catch (error: any) {
      console.log(`   Failed: ${error.message}`);
      if (i < connectionStrings.length - 1) {
        console.log(`   Trying next method...\n`);
      }
    }
  }

  if (!client) {
    console.error('\n❌ All connection methods failed!');
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check your POSTGRES_PASSWORD is correct in .env');
    console.error('   2. Verify your Supabase project is active');
    process.exit(1);
  }

  try {

    // Query current max ID before import
    const { rows: beforeRows } = await client.query('SELECT MAX(id) FROM trades');
    const maxIdBefore = beforeRows[0]?.max || 0;
    console.log(`📊 Current max trade ID: ${maxIdBefore.toLocaleString()}\n`);

    // Phase 1: Load CSVs to staging (skip if --migrate-only)
    if (!migrateOnly) {
      // Import each day
      for (let i = 0; i < csvPairs.length; i++) {
        await importDay(client, csvPairs[i], stats);
        
        // Print progress summary every 10 days
        if ((i + 1) % 10 === 0 || i === csvPairs.length - 1) {
          const elapsed = Date.now() - stats.startTime;
          const rate = stats.tradesImported / (elapsed / 1000);
          
          console.log(`\n${'─'.repeat(70)}`);
          console.log(`📊 Progress: ${i + 1}/${csvPairs.length} days`);
          console.log(`   Trades: ${stats.tradesImported.toLocaleString()} | Participants: ${stats.participantsImported.toLocaleString()}`);
          console.log(`   Elapsed: ${formatDuration(elapsed)} | Rate: ${rate.toFixed(0)} trades/sec`);
          console.log(`${'─'.repeat(70)}\n`);
        }
      }
    }

    // Verify staging data
    console.log(`\n${'='.repeat(70)}`);
    console.log('🔍 Verifying Staging Data');
    console.log('='.repeat(70));
    
    const { rows: stagingTradesRows } = await client.query('SELECT COUNT(*), MIN(id), MAX(id) FROM trades_staging');
    const { rows: stagingParticipantsRows } = await client.query('SELECT COUNT(*) FROM trade_participants_staging');
    
    const stagingTradesCount = parseInt(stagingTradesRows[0].count);
    const stagingMinId = stagingTradesRows[0].min;
    const stagingMaxId = stagingTradesRows[0].max;
    const stagingParticipantsCount = parseInt(stagingParticipantsRows[0].count);
    
    console.log(`📊 Staging Tables:`);
    console.log(`   Trades:       ${stagingTradesCount.toLocaleString()}`);
    console.log(`   Participants: ${stagingParticipantsCount.toLocaleString()}`);
    console.log(`   ID Range:     ${stagingMinId?.toLocaleString() || 'N/A'} to ${stagingMaxId?.toLocaleString() || 'N/A'}`);
    
    // Check for ID conflicts
    if (stagingMinId && stagingMinId <= maxIdBefore) {
      console.error(`\n❌ ERROR: ID conflict detected!`);
      console.error(`   Staging min ID (${stagingMinId}) overlaps with production max ID (${maxIdBefore})`);
      console.error(`   You need to regenerate CSVs with --start-id=${maxIdBefore + 1}`);
      process.exit(1);
    }
    
    console.log(`✓ No ID conflicts detected`);
    
    // Stop here if --staging-only
    if (stagingOnly) {
      console.log(`\n${'='.repeat(70)}`);
      console.log('✅ Phase 1 Complete: Data Loaded to Staging');
      console.log('='.repeat(70));
      console.log(`📊 Staging Summary:`);
      console.log(`   Trades:       ${stagingTradesCount.toLocaleString()}`);
      console.log(`   Participants: ${stagingParticipantsCount.toLocaleString()}`);
      console.log(`   ID Range:     ${stagingMinId?.toLocaleString() || 'N/A'} to ${stagingMaxId?.toLocaleString() || 'N/A'}`);
      console.log(`\n💡 Next Steps:`);
      console.log(`   1. Inspect staging tables in Supabase:`);
      console.log(`      SELECT * FROM trades_staging LIMIT 100;`);
      console.log(`      SELECT * FROM trade_participants_staging LIMIT 100;`);
      console.log(`   2. When ready, run migration:`);
      console.log(`      npm run import:all -- --migrate-only`);
      console.log('='.repeat(70));
      
      await client.end();
      console.log('\n🔌 Disconnected from database');
      process.exit(0);
    }
    
    // Phase 2: Migrate from staging to production
    console.log(`\n${'='.repeat(70)}`);
    console.log('🚀 Migrating from Staging → Production');
    console.log('='.repeat(70));
    console.log(`⚠️  This will insert ${stagingTradesCount.toLocaleString()} trades into production.`);
    console.log(`Press Ctrl+C to cancel, or wait 5 seconds to continue...\n`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`⏳ Starting migration (this may take a few minutes)...`);
    const migrationStart = Date.now();
    
    // Use a transaction for safety
    await client.query('BEGIN');
    
    try {
      // Insert trades (explicitly specify columns, excluding id which is auto-generated)
      console.log(`  ⏳ Inserting trades...`);
      await client.query(`
        INSERT INTO trades (id, coin, time, px, sz, hash, trade_dir_override)
        SELECT id, coin, time, px, sz, hash, trade_dir_override
        FROM trades_staging
      `);
      console.log(`  ✓ Trades inserted`);
      
      // Insert participants (explicitly specify columns, excluding id and created_at)
      console.log(`  ⏳ Inserting participants...`);
      await client.query(`
        INSERT INTO trade_participants (trade_id, user_address, side, start_pos, oid, twap_id, cloid)
        SELECT trade_id, user_address, side, start_pos, oid, twap_id, cloid
        FROM trade_participants_staging
      `);
      console.log(`  ✓ Participants inserted`);
      
      // Commit transaction
      await client.query('COMMIT');
      
      const migrationDuration = Date.now() - migrationStart;
      console.log(`\n✅ Migration complete in ${(migrationDuration / 1000).toFixed(2)}s`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`\n❌ Migration failed! Transaction rolled back.`);
      console.error(`   Staging tables preserved for inspection.`);
      throw error;
    }
    
    // Query final max ID
    const { rows: afterRows } = await client.query('SELECT MAX(id) FROM trades');
    const maxIdAfter = afterRows[0]?.max || 0;
    console.log(`\n📊 New max trade ID: ${maxIdAfter.toLocaleString()}`);
    console.log(`   Imported: ${(maxIdAfter - maxIdBefore).toLocaleString()} trades`);

    // Update sequence
    if (!skipSequence) {
      console.log(`\n🔄 Updating sequence...`);
      await client.query(`SELECT setval('trades_id_seq', ${maxIdAfter})`);
      const { rows: seqRows } = await client.query(`SELECT currval('trades_id_seq')`);
      console.log(`✓ Sequence updated to ${seqRows[0].currval}`);
    } else {
      console.log(`\n⚠️  Skipped sequence update (--skip-sequence flag)`);
      console.log(`   Run manually: SELECT setval('trades_id_seq', ${maxIdAfter});`);
    }
    
    // Cleanup staging tables
    console.log(`\n🧹 Cleaning up staging tables...`);
    await client.query('TRUNCATE trades_staging, trade_participants_staging');
    console.log(`✓ Staging tables truncated (structure preserved)`);

    // Final summary
    const totalDuration = Date.now() - stats.startTime;
    const finalRate = stats.tradesImported / (totalDuration / 1000);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Import Complete!');
    console.log('='.repeat(70));
    console.log(`Days processed:        ${stats.daysProcessed}`);
    console.log(`Total trades:          ${stats.tradesImported.toLocaleString()}`);
    console.log(`Total participants:    ${stats.participantsImported.toLocaleString()}`);
    console.log(`Errors:                ${stats.errors}`);
    console.log(`Total duration:        ${formatDuration(totalDuration)}`);
    console.log(`Average rate:          ${finalRate.toFixed(0)} trades/sec`);
    console.log('='.repeat(70));

    console.log('\n✨ All data imported successfully!');

  } catch (error) {
    console.error('\n❌ Fatal error during import:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from database');
  }
}

// Handle interruption gracefully
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Import interrupted by user.');
  process.exit(1);
});

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

