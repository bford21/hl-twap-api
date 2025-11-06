#!/usr/bin/env tsx

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { listS3Objects, getS3Object } from '../lib/s3';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

// Validate and create Supabase client
if (!process.env.SUPABASE_URL) {
  console.error('❌ Error: SUPABASE_URL not found in .env file');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY not found in .env file');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// node_fills_by_block format
interface TradeData {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number; // Unix timestamp in milliseconds
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  cloid?: string;
  feeToken: string;
  twapId?: number | null;
}

interface BlockRecord {
  local_time: string;
  block_time: string;
  block_number: number;
  events: Array<[string, TradeData]>; // [user_address, trade_data]
}

interface TradeWithParticipants {
  trade: {
    coin: string;
    side: string;
    time: string; // ISO 8601
    px: number;
    sz: number;
    hash: string;
    trade_dir_override: string | null;
  };
  participants: Array<{
    user_address: string;
    start_pos: number;
    oid: number;
    twap_id: number | null;
    cloid: string | null;
  }>;
}

// Get yesterday's date in YYYYMMDD format
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

// Check if a trade has at least one participant with twapId
function tradeHasTwapId(participants: Array<[string, TradeData]>): boolean {
  return participants.some(([_, trade]) => trade.twapId !== null && trade.twapId !== undefined);
}

// Parse node_fills_by_block format and extract TWAP trades grouped by tid
function parseTrades(content: string): TradeWithParticipants[] {
  const lines = content.trim().split('\n').filter(line => line.trim().length > 0);
  const tradesMap = new Map<number, Array<[string, TradeData]>>();
  
  // Parse all blocks and group events by tid
  for (const line of lines) {
    try {
      const block: BlockRecord = JSON.parse(line);
      
      if (!block.events || block.events.length === 0) continue;
      
      for (const [userAddress, trade] of block.events) {
        if (!trade.tid || !userAddress) continue;
        
        if (!tradesMap.has(trade.tid)) {
          tradesMap.set(trade.tid, []);
        }
        tradesMap.get(trade.tid)!.push([userAddress, trade]);
      }
    } catch (error) {
      // Skip invalid lines
      continue;
    }
  }
  
  // Convert to TradeWithParticipants format, filtering for TWAP trades
  const trades: TradeWithParticipants[] = [];
  
  for (const [tid, participants] of Array.from(tradesMap.entries())) {
    if (participants.length === 0) continue;
    
    // Only include trades with at least one TWAP ID
    if (!tradeHasTwapId(participants)) continue;
    
    // Use first participant's trade data for the trade record
    const firstTrade = participants[0][1];
    
    trades.push({
      trade: {
        coin: firstTrade.coin,
        side: firstTrade.side,
        time: new Date(firstTrade.time).toISOString(),
        px: parseFloat(firstTrade.px),
        sz: parseFloat(firstTrade.sz),
        hash: firstTrade.hash,
        trade_dir_override: firstTrade.dir || null,
      },
      participants: participants.map(([userAddress, trade]: [string, TradeData]) => ({
        user_address: userAddress,
        start_pos: parseFloat(trade.startPosition),
        oid: trade.oid,
        twap_id: trade.twapId ?? null,
        cloid: trade.cloid ?? null,
      })),
    });
  }
  
  return trades;
}

// Batch insert trades with their participants
async function insertTradesBatch(trades: TradeWithParticipants[]): Promise<{ inserted: number; errors: number }> {
  if (trades.length === 0) return { inserted: 0, errors: 0 };
  
  let inserted = 0;
  let errors = 0;
  
  for (const { trade, participants } of trades) {
    try {
      // Insert trade first
      const { data: tradeData, error: tradeError } = await supabase
        .from('trades')
        .insert(trade)
        .select()
        .single();
      
      if (tradeError || !tradeData) {
        console.error(`  ❌ Error inserting trade:`, tradeError?.message);
        errors++;
        continue;
      }
      
      // Insert all participants for this trade
      const participantRecords = participants.map(p => ({
        trade_id: tradeData.id,
        ...p,
      }));
      
      const { error: participantError } = await supabase
        .from('trade_participants')
        .insert(participantRecords);
      
      if (participantError) {
        console.error(`  ❌ Error inserting participants for trade ${tradeData.id}:`, participantError.message);
        // Rollback trade
        await supabase.from('trades').delete().eq('id', tradeData.id);
        errors++;
      } else {
        inserted++;
      }
    } catch (error) {
      console.error(`  ❌ Error processing trade:`, error);
      errors++;
    }
  }
  
  return { inserted, errors };
}

async function syncDataFromS3() {
  // Check for dry-run mode
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('🚀 Starting daily TWAP data sync from S3...');
  console.log('📅 Timestamp:', new Date().toISOString());
  if (isDryRun) {
    console.log('🧪 MODE: DRY RUN (will write to file instead of database)');
  } else {
    console.log('💾 MODE: PRODUCTION (will write to database)');
  }
  console.log('='.repeat(70));

  try {
    // Calculate yesterday's date
    const yesterday = getYesterdayDate();
    console.log(`📆 Syncing data for: ${yesterday}`);
    
    // Check if we've already synced this date (unless dry-run)
    if (!isDryRun) {
      console.log(`🔍 Checking if ${yesterday} data already exists...`);
      
      // Get date boundaries for yesterday
      const year = parseInt(yesterday.substring(0, 4));
      const month = parseInt(yesterday.substring(4, 6));
      const day = parseInt(yesterday.substring(6, 8));
      
      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
      
      // Check if any trades exist for this date
      const { data: existingTrades, error: checkError } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .gte('time', startDate.toISOString())
        .lte('time', endDate.toISOString())
        .limit(1);
      
      if (checkError) {
        console.warn(`⚠️  Could not check for existing data: ${checkError.message}`);
      } else if (existingTrades && existingTrades.length > 0) {
        console.log(`✅ Data for ${yesterday} already exists in database`);
        console.log(`⏭️  Skipping sync (run again with --force to override)`);
        console.log('\nTo re-sync this date, manually delete trades for this date first.');
        return;
      } else {
        console.log(`✓ No existing data found for ${yesterday}, proceeding with sync`);
      }
    }
    
    // S3 path: node_fills_by_block/hourly/YYYYMMDD/
    const prefix = `node_fills_by_block/hourly/${yesterday}/`;
    console.log(`📂 S3 path: s3://hl-mainnet-node-data/${prefix}`);
    console.log('');
    
    // List all hour files for yesterday
    const objects = await listS3Objects(prefix);
    console.log(`📊 Found ${objects.length} hour files`);

    if (objects.length === 0) {
      console.log('⚠️  No files found for yesterday. This might be normal if data hasn\'t been uploaded yet.');
      return;
    }

    let totalTrades = 0;
    let totalInserted = 0;
    let totalErrors = 0;
    let filesProcessed = 0;
    const allTrades: TradeWithParticipants[] = []; // For dry-run mode

    // Process each hour file
    for (const obj of objects) {
      if (!obj.Key) continue;
      
      // Skip non-data files (like ._ files on macOS)
      const fileName = obj.Key.split('/').pop() || '';
      if (fileName.startsWith('.') || fileName.startsWith('._')) continue;

      console.log(`\n⏳ Processing: ${fileName}`);

      try {
        // Get the file content
        const content = await getS3Object(obj.Key);
        
        // Parse trades from node_fills_by_block format
        const trades = parseTrades(content);
        console.log(`   Found ${trades.length} TWAP trades`);
        
        if (trades.length === 0) {
          console.log(`   ⚠️  No TWAP trades in this file, skipping`);
          filesProcessed++;
          continue;
        }
        
        totalTrades += trades.length;
        
        if (isDryRun) {
          // Dry run: collect trades for file output
          allTrades.push(...trades);
          console.log(`   📝 Collected ${trades.length} trades (dry-run)`);
          totalInserted += trades.length;
        } else {
          // Live mode: insert into database
          const { inserted, errors } = await insertTradesBatch(trades);
          totalInserted += inserted;
          totalErrors += errors;
          console.log(`   ✅ Inserted: ${inserted} | Errors: ${errors}`);
        }
        
        filesProcessed++;
      } catch (error) {
        console.error(`   ❌ Error processing ${obj.Key}:`, error);
        totalErrors++;
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Sync completed!');
    console.log('='.repeat(70));
    console.log(`📁 Files processed:     ${filesProcessed}`);
    console.log(`📊 Total TWAP trades:   ${totalTrades}`);
    console.log(`✅ Successfully ${isDryRun ? 'collected' : 'inserted'}: ${totalInserted}`);
    console.log(`❌ Errors:               ${totalErrors}`);
    console.log(`📈 Success rate:        ${totalTrades > 0 ? ((totalInserted / totalTrades) * 100).toFixed(2) : 0}%`);
    console.log('='.repeat(70));

    // Write to file if dry-run
    if (isDryRun && allTrades.length > 0) {
      const outputFile = path.join(process.cwd(), `sync-data-preview-${yesterday}.json`);
      
      console.log('\n📝 Writing preview data to file...');
      
      // Create summary with sample data
      const preview = {
        metadata: {
          date: yesterday,
          timestamp: new Date().toISOString(),
          totalTrades: allTrades.length,
          filesProcessed,
        },
        summary: {
          firstTrade: allTrades[0],
          lastTrade: allTrades[allTrades.length - 1],
          sampleSize: Math.min(10, allTrades.length),
        },
        sampleTrades: allTrades.slice(0, 10), // First 10 trades
        // Uncomment to write all trades (could be large)
        // allTrades: allTrades,
      };
      
      fs.writeFileSync(outputFile, JSON.stringify(preview, null, 2), 'utf-8');
      
      console.log(`✅ Preview data written to: ${outputFile}`);
      console.log(`📊 Preview contains:`);
      console.log(`   - Metadata and summary`);
      console.log(`   - First 10 trades (out of ${allTrades.length} total)`);
      console.log(`\n💡 To see all ${allTrades.length} trades, uncomment 'allTrades' in the script`);
    }

  } catch (error) {
    console.error('❌ Fatal error during sync:', error);
    process.exit(1);
  }
}

// Run the sync
syncDataFromS3()
  .then(() => {
    console.log('\nSync script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nSync script failed:', error);
    process.exit(1);
  });

