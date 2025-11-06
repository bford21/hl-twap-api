#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { config } from 'dotenv';

// Load environment variables
config();

interface SideInfo {
  user: string;
  start_pos: string;
  oid: number;
  twap_id: number | null;
  cloid: string | null;
  // NOTE: node_trades format does NOT include 'side' in side_info
  // Per Hyperliquid docs: side_info[0] = buyer (B), side_info[1] = seller (A)
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

interface Stats {
  filesProcessed: number;
  linesRead: number;
  tradesWritten: number;
  participantsWritten: number;
  tradesSkipped: number;
  errors: number;
  startTime: number;
}

// Check if a trade has at least one participant with twap_id
function tradeHasTwapId(sideInfo: SideInfo[]): boolean {
  return sideInfo.some(si => si.twap_id !== null && si.twap_id !== undefined);
}

// Escape CSV fields that contain special characters
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '\\N'; // PostgreSQL NULL representation
  }
  
  let strValue = String(value);
  
  // Escape backslashes and double quotes
  strValue = strValue.replace(/\\/g, '\\\\').replace(/"/g, '""');
  
  // If the string contains commas, newlines, or double quotes, enclose in double quotes
  if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
    return `"${strValue}"`;
  }
  
  return strValue;
}

// Track the next trade ID to assign
// This will be initialized from command-line argument (e.g., max(id) + 1 from database)
let nextTradeId = 1;

async function processFile(
  filePath: string,
  tradesWriter: fs.WriteStream,
  participantsWriter: fs.WriteStream,
  stats: Stats
): Promise<void> {
  try {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    for await (const line of rl) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;
      
      stats.linesRead++;
      
      try {
        const trade: TradeRecord = JSON.parse(trimmedLine);
        
        // Skip if trade doesn't have required fields
        if (!trade.side_info || trade.side_info.length === 0) {
          continue;
        }
        
        // Check if this trade has at least one participant with twapId
        if (!tradeHasTwapId(trade.side_info)) {
          stats.tradesSkipped++;
          continue;
        }
        
        // Assign sequential trade ID
        const tradeId = nextTradeId++;
        
        // Write trade to CSV (with explicit ID) - NO side column
        const tradeRow = [
          tradeId,
          escapeCsvField(trade.coin),
          escapeCsvField(trade.time),
          escapeCsvField(trade.px),
          escapeCsvField(trade.sz),
          escapeCsvField(trade.hash),
          escapeCsvField(trade.trade_dir_override === 'Na' ? null : trade.trade_dir_override),
        ].join(',');
        
        tradesWriter.write(tradeRow + '\n');
        stats.tradesWritten++;
        
        // Write ALL participants for this trade (WITH side column)
        // NOTE: node_trades format doesn't include side in side_info, but per Hyperliquid docs:
        // https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/notation
        // - side_info[0] = buyer (side B)
        // - side_info[1] = seller (side A)
        // The trade.side indicates which side was the aggressor/taker
        for (let i = 0; i < trade.side_info.length; i++) {
          const sideInfo = trade.side_info[i];
          
          // Determine side based on position in array (documented by Hyperliquid)
          let side: string;
          if (i === 0) {
            // First participant is always the buyer (side B)
            side = 'B';
          } else {
            // Second participant is always the seller (side A)
            side = 'A';
          }
          
          const participantRow = [
            tradeId, // trade_id (foreign key)
            escapeCsvField(sideInfo.user),
            escapeCsvField(side), // 'A' = Ask/Sell, 'B' = Bid/Buy
            escapeCsvField(sideInfo.start_pos),
            escapeCsvField(sideInfo.oid),
            escapeCsvField(sideInfo.twap_id),
            escapeCsvField(sideInfo.cloid || null),
          ].join(',');
          
          participantsWriter.write(participantRow + '\n');
          stats.participantsWritten++;
        }
      } catch (error) {
        stats.errors++;
        // Don't log every parsing error to avoid spam - just increment counter
      }
    }
    
    stats.filesProcessed++;
  } catch (error) {
    console.error(`  ❌ Error reading file ${path.basename(filePath)}:`, error);
    stats.errors++;
  }
}

// Find all day directories (YYYYMMDD format) and their hour files
function findDayDirectories(hourlyDir: string): Map<string, string[]> {
  const dayDirs = new Map<string, string[]>(); // Map of dayDir -> [hourFiles]
  
  const items = fs.readdirSync(hourlyDir);
  for (const item of items) {
    if (item.startsWith('.')) continue; // Skip hidden files
    
    const fullPath = path.join(hourlyDir, item);
    const stat = fs.statSync(fullPath);
    
    // Look for YYYYMMDD directories
    if (stat.isDirectory() && /^\d{8}$/.test(item)) {
      const hourFiles: string[] = [];
      
      // Get all hour files in this day directory
      const hourItems = fs.readdirSync(fullPath);
      for (const hourItem of hourItems) {
        if (hourItem.startsWith('.')) continue; // Skip hidden files
        if (hourItem.endsWith('.csv')) continue; // Skip CSV output files
        
        const hourPath = path.join(fullPath, hourItem);
        const hourStat = fs.statSync(hourPath);
        if (hourStat.isFile()) {
          hourFiles.push(hourPath);
        }
      }
      
      if (hourFiles.length > 0) {
        dayDirs.set(fullPath, hourFiles);
      }
    }
  }
  
  return dayDirs;
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
  const sourceDir = args.find(arg => !arg.startsWith('--')) || './hl-data/node_trades/hourly';
  
  // Parse --start-id argument
  const startIdArg = args.find(arg => arg.startsWith('--start-id='));
  
  // Check for .last_trade_id file (at project root, shared across both generate scripts)
  const trackingFile = path.join(process.cwd(), '.last_trade_id');
  let usedTrackingFile = false;
  
  if (startIdArg) {
    // Manual override takes precedence
    const startId = parseInt(startIdArg.split('=')[1]);
    if (isNaN(startId) || startId < 1) {
      console.error('❌ Error: --start-id must be a positive integer');
      process.exit(1);
    }
    nextTradeId = startId;
  } else if (fs.existsSync(trackingFile)) {
    // Resume from tracking file
    try {
      const lastId = parseInt(fs.readFileSync(trackingFile, 'utf-8').trim());
      if (!isNaN(lastId) && lastId > 0) {
        nextTradeId = lastId + 1;
        usedTrackingFile = true;
        console.log(`📌 Found tracking file: resuming from ID ${nextTradeId.toLocaleString()}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not read tracking file, starting from 1`);
    }
  }
  
  console.log('🚀 TWAP Trade CSV Generator for PostgreSQL COPY (node_trades format)');
  console.log('='.repeat(70));
  console.log(`Source directory: ${sourceDir}`);
  console.log(`Output: One CSV pair per day in source directory`);
  
  let idSource = ' (default)';
  if (startIdArg) idSource = ' (from --start-id)';
  else if (usedTrackingFile) idSource = ' (from .last_trade_id)';
  console.log(`Starting trade ID: ${nextTradeId.toLocaleString()}${idSource}`);
  
  console.log(`Filter: Include ALL participants of trades with at least one twapId`);
  console.log(`Note: Files without TWAP trades will be skipped`);
  console.log('='.repeat(70));

  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Error: Directory not found: ${sourceDir}`);
    process.exit(1);
  }

  console.log('\n🔍 Scanning for day directories (YYYYMMDD)...');
  const dayDirs = findDayDirectories(sourceDir);
  const dayCount = dayDirs.size;
  
  if (dayCount === 0) {
    console.error(`❌ No day directories found in ${sourceDir}`);
    console.log('Expected format: hourly/YYYYMMDD/HH (e.g., hourly/20250322/10, hourly/20250322/11, ...)');
    process.exit(1);
  }
  
  // Show date range
  const sortedDayNames = Array.from(dayDirs.keys())
    .map(dir => path.basename(dir))
    .sort();
  const firstDay = sortedDayNames[0];
  const lastDay = sortedDayNames[sortedDayNames.length - 1];
  
  console.log(`📁 Found ${dayCount} day directories to process`);
  console.log(`📅 Date range: ${firstDay} to ${lastDay}`);
  
  const overallStats: Stats = {
    filesProcessed: 0,
    linesRead: 0,
    tradesWritten: 0,
    participantsWritten: 0,
    tradesSkipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  let processedDays = 0;
  const sortedDays = Array.from(dayDirs.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Process each day
  for (const [dayDir, hourFiles] of sortedDays) {
    const dayName = path.basename(dayDir);
    try {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📅 Processing ${dayName} (${hourFiles.length} hour files)`);
      console.log(`${'='.repeat(70)}`);
      
      // Create CSV files for this day
      const tradesPath = path.join(dayDir, `trades_${dayName}.csv`);
      const participantsPath = path.join(dayDir, `trade_participants_${dayName}.csv`);
      
      // Check if files already exist and warn about overwriting
      const tradesExists = fs.existsSync(tradesPath);
      const participantsExists = fs.existsSync(participantsPath);
      
      if (tradesExists || participantsExists) {
        console.log(`⚠️  Overwriting existing CSV files`);
      }
      
      console.log(`📝 Output files:`);
      console.log(`  - ${tradesPath}`);
      console.log(`  - ${participantsPath}`);
      
      const tradesWriter = fs.createWriteStream(tradesPath);
      const participantsWriter = fs.createWriteStream(participantsPath);
      
      const dayStats: Stats = {
        filesProcessed: 0,
        linesRead: 0,
        tradesWritten: 0,
        participantsWritten: 0,
        tradesSkipped: 0,
        errors: 0,
        startTime: Date.now(),
      };
      
      // Process all hour files for this day
      for (let i = 0; i < hourFiles.length; i++) {
        await processFile(hourFiles[i], tradesWriter, participantsWriter, dayStats);
        
        // Print progress every 5 files
        if ((i + 1) % 5 === 0 || i === hourFiles.length - 1) {
          const elapsed = Date.now() - dayStats.startTime;
          const rate = dayStats.tradesWritten / Math.max(elapsed / 1000, 1);
          
          console.log(`  📊 Progress: ${i + 1}/${hourFiles.length} files | Trades: ${dayStats.tradesWritten.toLocaleString()} | Rate: ${rate.toFixed(2)}/sec`);
        }
      }
      
      // Close write streams (register listeners BEFORE calling .end())
      console.log(`  🔒 Closing streams...`);
      
      // Create promises BEFORE calling .end() to avoid missing the finish event
      const tradesFinished = new Promise<void>((resolve) => {
        tradesWriter.on('finish', () => {
          console.log(`    ✓ Trades stream finished`);
          resolve();
        });
      });
      
      const participantsFinished = new Promise<void>((resolve) => {
        participantsWriter.on('finish', () => {
          console.log(`    ✓ Participants stream finished`);
          resolve();
        });
      });
      
      // Now call .end()
      tradesWriter.end();
      participantsWriter.end();
      
      // Wait for streams to finish with timeout
      console.log(`  ⏳ Waiting for streams to finish...`);
      await Promise.race([
        tradesFinished,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Trades stream timeout')), 10000))
      ]);
      
      await Promise.race([
        participantsFinished,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Participants stream timeout')), 10000))
      ]);
      
      console.log(`  ✓ Streams closed`);
      
      // Day summary
      const dayDuration = Date.now() - dayStats.startTime;
      const dayRate = dayStats.tradesWritten / Math.max(dayDuration / 1000, 1);
      
      console.log(`  📊 Computing summary...`);
      
      if (dayStats.tradesWritten === 0) {
        console.log(`\n  ⚠️  ${dayName}: No TWAP trades found (skipping CSV creation)`);
        // Delete empty CSV files
        try {
          if (fs.existsSync(tradesPath)) fs.unlinkSync(tradesPath);
          if (fs.existsSync(participantsPath)) fs.unlinkSync(participantsPath);
        } catch (e) { /* ignore */ }
      } else {
        console.log(`\n  ✅ ${dayName} complete:`);
        console.log(`     Files:        ${dayStats.filesProcessed}`);
        console.log(`     Trades:       ${dayStats.tradesWritten.toLocaleString()}`);
        console.log(`     Participants: ${dayStats.participantsWritten.toLocaleString()}`);
        console.log(`     Skipped:      ${dayStats.tradesSkipped.toLocaleString()}`);
        if (dayStats.errors > 0) {
          console.log(`     Parse errors: ${dayStats.errors.toLocaleString()}`);
        }
        console.log(`     Duration:     ${formatDuration(dayDuration)}`);
        console.log(`     Rate:         ${dayRate.toFixed(2)} trades/sec`);
      }
    
      // Add to overall stats
      overallStats.filesProcessed += dayStats.filesProcessed;
      overallStats.linesRead += dayStats.linesRead;
      overallStats.tradesWritten += dayStats.tradesWritten;
      overallStats.participantsWritten += dayStats.participantsWritten;
      overallStats.tradesSkipped += dayStats.tradesSkipped;
      overallStats.errors += dayStats.errors;
      
      processedDays++;
    } catch (error) {
      console.error(`\n❌ Fatal error processing ${path.basename(dayDir)}:`, error);
      console.error('Continuing to next day...\n');
      overallStats.errors++;
    }
  }

  console.log(`\n✓ Loop completed. Processed ${processedDays} days.`);
  
  // Final summary
  const totalDuration = Date.now() - overallStats.startTime;
  const finalRate = overallStats.tradesWritten / Math.max(totalDuration / 1000, 1);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ All Days Complete!');
  console.log('📊 Overall Summary');
  console.log('='.repeat(70));
  console.log(`Days processed:        ${processedDays}`);
  console.log(`Total files processed: ${overallStats.filesProcessed}`);
  console.log(`Total lines read:      ${overallStats.linesRead.toLocaleString()}`);
  console.log(`Trades written:        ${overallStats.tradesWritten.toLocaleString()}`);
  console.log(`Participants written:  ${overallStats.participantsWritten.toLocaleString()}`);
  console.log(`Trades skipped:        ${overallStats.tradesSkipped.toLocaleString()}`);
  console.log(`Total errors:          ${overallStats.errors.toLocaleString()}`);
  console.log(`Total duration:        ${formatDuration(totalDuration)}`);
  console.log(`Overall rate:          ${finalRate.toFixed(2)} trades/sec`);
  console.log('='.repeat(70));

  if (overallStats.tradesWritten > 0) {
    console.log('\n💡 Next Steps:');
    console.log('='.repeat(70));
    console.log('Import the generated CSVs to your database:');
    console.log('');
    console.log('  npm run import:node-trades <source_directory> -- --staging-only');
    console.log('');
    console.log('This will load data to staging tables for inspection before production migration.');
    console.log(`Final trade ID will be: ${(nextTradeId - 1).toLocaleString()}`);
    console.log('='.repeat(70));
  } else {
    console.log('\n⚠️  No TWAP trades found in any of the processed files.');
    console.log('This might mean:');
    console.log('  - The files don\'t contain TWAP data (missing twapId field)');
    console.log('  - The date range doesn\'t have any TWAP trades');
    console.log('  - The data format is different than expected');
  }

  if (overallStats.errors > 0) {
    console.error(`\n⚠️  Completed with ${overallStats.errors} errors. Check logs above.`);
    process.exit(1);
  } else {
    console.log('\n🎉 All CSVs generated successfully!');
    
    // Save final trade ID to tracking file
    if (overallStats.tradesWritten > 0) {
      const finalId = nextTradeId - 1; // Last ID used
      try {
        fs.writeFileSync(trackingFile, finalId.toString(), 'utf-8');
        console.log(`📌 Saved final trade ID (${finalId.toLocaleString()}) to .last_trade_id`);
        console.log(`   Next run (node_trades or node_fills_by_block) will resume from ID ${(finalId + 1).toLocaleString()}`);
      } catch (error) {
        console.warn(`⚠️  Could not write tracking file: ${error}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('\n❌ FATAL ERROR:');
  console.error(error);
  process.exit(1);
});

