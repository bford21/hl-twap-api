#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

interface SideInfo {
  user: string;
  start_pos: string;
  oid: number;
  twap_id: number | null;
  cloid: string | null;
}

interface TradeRecord {
  coin: string;
  side: string;
  time: string;
  px: string;
  sz: string;
  hash: string;
  trade_dir_override: string;
  side_info: SideInfo[];
}

interface ImportStats {
  filesProcessed: number;
  totalLinesRead: number;
  tradesWithTwap: number;
  tradesInserted: number;
  tradesSkipped: number;
  errors: number;
  startTime: number;
}

// Check if a trade has at least one participant with non-null twap_id
function hasTwapId(record: TradeRecord): boolean {
  return record.side_info.some(si => si.twap_id !== null);
}

// Recursively find all files in a directory
function findAllFiles(dir: string): string[] {
  const files: string[] = [];
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively search subdirectories
      files.push(...findAllFiles(fullPath));
    } else if (stat.isFile() && !item.startsWith('.')) {
      // Add files (skip hidden files)
      files.push(fullPath);
    }
  }
  
  return files;
}

async function insertTradesBatch(records: TradeRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    // Step 1: Insert all trades in one batch
    const tradeRecords = records.map(record => ({
      coin: record.coin,
      side: record.side,
      time: record.time,
      px: parseFloat(record.px),
      sz: parseFloat(record.sz),
      hash: record.hash,
      trade_dir_override: record.trade_dir_override,
    }));

    const { data: insertedTrades, error: tradeError } = await supabase
      .from('trades')
      .insert(tradeRecords)
      .select('id');

    if (tradeError || !insertedTrades) {
      console.error(`  ❌ Error inserting trade batch:`, tradeError?.message);
      return 0;
    }

    // Step 2: Build all participant records with their corresponding trade_ids
    const allParticipants = [];
    for (let i = 0; i < records.length; i++) {
      const tradeId = insertedTrades[i].id;
      const participants = records[i].side_info.map(si => ({
        trade_id: tradeId,
        user_address: si.user,
        start_pos: parseFloat(si.start_pos),
        oid: si.oid,
        twap_id: si.twap_id,
        cloid: si.cloid,
      }));
      allParticipants.push(...participants);
    }

    // Step 3: Insert all participants in one batch
    const { error: participantError } = await supabase
      .from('trade_participants')
      .insert(allParticipants);

    if (participantError) {
      console.error(`  ❌ Error inserting participant batch:`, participantError.message);
      // Clean up trades on error
      const tradeIds = insertedTrades.map(t => t.id);
      await supabase.from('trades').delete().in('id', tradeIds);
      return 0;
    }

    return insertedTrades.length;
  } catch (error) {
    console.error(`  ❌ Error processing batch:`, error);
    return 0;
  }
}

async function processFile(
  filePath: string,
  stats: ImportStats,
  dryRun: boolean = false,
  batchSize: number = 500
): Promise<void> {
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(`\n📄 Processing: ${relativePath}`);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim().length > 0);
    
    stats.totalLinesRead += lines.length;
    
    let tradesWithTwapInFile = 0;
    let insertedInFile = 0;
    const batchToInsert: TradeRecord[] = [];
    
    for (const line of lines) {
      try {
        const record: TradeRecord = JSON.parse(line);
        
        // Check if this trade has at least one participant with twap_id
        if (hasTwapId(record)) {
          tradesWithTwapInFile++;
          stats.tradesWithTwap++;
          
          if (!dryRun) {
            batchToInsert.push(record);
            
            // Insert batch when it reaches batchSize
            if (batchToInsert.length >= batchSize) {
              const inserted = await insertTradesBatch(batchToInsert);
              stats.tradesInserted += inserted;
              insertedInFile += inserted;
              if (inserted < batchToInsert.length) {
                stats.errors += (batchToInsert.length - inserted);
              }
              batchToInsert.length = 0; // Clear batch
            }
          } else {
            stats.tradesInserted++; // Count for dry run
          }
        } else {
          stats.tradesSkipped++;
        }
      } catch (error) {
        stats.errors++;
        // Continue processing other lines
      }
    }
    
    // Insert remaining trades in batch
    if (!dryRun && batchToInsert.length > 0) {
      const inserted = await insertTradesBatch(batchToInsert);
      stats.tradesInserted += inserted;
      insertedInFile += inserted;
      if (inserted < batchToInsert.length) {
        stats.errors += (batchToInsert.length - inserted);
      }
    }
    
    console.log(`  ✓ Lines: ${lines.length} | With TWAP: ${tradesWithTwapInFile} | Inserted: ${insertedInFile}`);
    stats.filesProcessed++;
  } catch (error) {
    console.error(`  ❌ Error reading file:`, error);
    stats.errors++;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function printProgress(stats: ImportStats) {
  const elapsed = Date.now() - stats.startTime;
  const rate = stats.tradesInserted / (elapsed / 1000);
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 Progress Update');
  console.log('='.repeat(70));
  console.log(`Files processed:     ${stats.filesProcessed}`);
  console.log(`Lines read:          ${stats.totalLinesRead.toLocaleString()}`);
  console.log(`Trades with TWAP:    ${stats.tradesWithTwap.toLocaleString()} (${((stats.tradesWithTwap / stats.totalLinesRead) * 100).toFixed(2)}%)`);
  console.log(`Trades inserted:     ${stats.tradesInserted.toLocaleString()}`);
  console.log(`Trades skipped:      ${stats.tradesSkipped.toLocaleString()}`);
  console.log(`Errors:              ${stats.errors}`);
  console.log(`Elapsed time:        ${formatDuration(elapsed)}`);
  console.log(`Insert rate:         ${rate.toFixed(2)} trades/sec`);
  console.log('='.repeat(70));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const hourlyDir = args.find(arg => !arg.startsWith('--')) || './test_files/hourly';
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 500;
  
  console.log('🚀 TWAP Trade Import Script');
  console.log('='.repeat(70));
  console.log(`Source directory: ${hourlyDir}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no data will be inserted)' : 'LIVE IMPORT'}`);
  console.log(`Batch size: ${batchSize} trades per insert`);
  console.log(`Filter: Only trades with non-null twap_id`);
  console.log('='.repeat(70));

  if (!fs.existsSync(hourlyDir)) {
    console.error(`❌ Error: Directory not found: ${hourlyDir}`);
    process.exit(1);
  }

  // Find all files recursively
  console.log('\n🔍 Scanning directories...');
  const files = findAllFiles(hourlyDir);
  console.log(`📁 Found ${files.length} files to process`);

  if (files.length === 0) {
    console.log('No files found. Exiting.');
    process.exit(0);
  }

  // Confirm before proceeding
  if (!dryRun) {
    console.log('\n⚠️  This will insert data into your Supabase database.');
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  const stats: ImportStats = {
    filesProcessed: 0,
    totalLinesRead: 0,
    tradesWithTwap: 0,
    tradesInserted: 0,
    tradesSkipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  // Process files
  for (let i = 0; i < files.length; i++) {
    await processFile(files[i], stats, dryRun, batchSize);
    
    // Print progress every 10 files
    if ((i + 1) % 10 === 0 || i === files.length - 1) {
      printProgress(stats);
    }
  }

  // Final summary
  const totalDuration = Date.now() - stats.startTime;
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Import Complete!');
  console.log('='.repeat(70));
  console.log(`Total files processed:    ${stats.filesProcessed}`);
  console.log(`Total lines read:         ${stats.totalLinesRead.toLocaleString()}`);
  console.log(`Trades with TWAP ID:      ${stats.tradesWithTwap.toLocaleString()}`);
  console.log(`Trades successfully inserted: ${stats.tradesInserted.toLocaleString()}`);
  console.log(`Trades skipped (no TWAP): ${stats.tradesSkipped.toLocaleString()}`);
  console.log(`Errors encountered:       ${stats.errors}`);
  console.log(`Total duration:           ${formatDuration(totalDuration)}`);
  console.log(`Average rate:             ${(stats.tradesInserted / (totalDuration / 1000)).toFixed(2)} trades/sec`);
  console.log('='.repeat(70));

  if (dryRun) {
    console.log('\n💡 This was a DRY RUN. No data was inserted.');
    console.log('   Run without --dry-run to actually insert data.');
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

// Handle interruption gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Import interrupted by user.');
  process.exit(1);
});

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

