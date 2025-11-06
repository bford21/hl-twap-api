#!/usr/bin/env tsx

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface GenerateStats {
  source: string;
  success: boolean;
  duration: number;
  error?: string;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function runGenerateScript(
  scriptName: string,
  sourceName: string,
  sourceDir: string
): Promise<GenerateStats> {
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 Starting ${sourceName} CSV generation`);
  console.log(`${'='.repeat(70)}\n`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    
    // Pass the source directory as an argument
    const child = spawn('tsx', [scriptPath, sourceDir], {
      stdio: 'inherit', // Pass through stdout/stderr
      shell: true,
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        resolve({
          source: sourceName,
          success: true,
          duration,
        });
      } else {
        resolve({
          source: sourceName,
          success: false,
          duration,
          error: `Process exited with code ${code}`,
        });
      }
    });
    
    child.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        source: sourceName,
        success: false,
        duration,
        error: error.message,
      });
    });
  });
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  
  // Accept base directory as parameter (e.g., './hl-data' or '/Volumes/A/hl-data')
  const baseDir = args.find(arg => !arg.startsWith('--')) || './hl-data';
  
  console.log('🚀 Unified CSV Generator for PostgreSQL COPY');
  console.log('='.repeat(70));
  console.log(`Base directory: ${baseDir}`);
  console.log('This will generate CSVs for both data sources:');
  console.log(`  1. node_trades       → ${path.join(baseDir, 'node_trades/hourly')}`);
  console.log(`  2. node_fills_by_block → ${path.join(baseDir, 'node_fills_by_block/hourly')}`);
  console.log('');
  console.log('Both will use the shared .last_trade_id file for sequential IDs');
  console.log('='.repeat(70));
  
  // Check for .last_trade_id file
  const trackingFile = path.join(process.cwd(), '.last_trade_id');
  if (fs.existsSync(trackingFile)) {
    try {
      const lastId = parseInt(fs.readFileSync(trackingFile, 'utf-8').trim());
      if (!isNaN(lastId) && lastId > 0) {
        console.log(`\n📌 Found tracking file: will resume from ID ${(lastId + 1).toLocaleString()}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not read tracking file`);
    }
  } else {
    console.log(`\n📌 No tracking file found: will start from ID 1`);
  }
  
  console.log('\nPress Ctrl+C to cancel, or wait 3 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const results: GenerateStats[] = [];
  
  // Construct source directories
  const nodeTradesDir = path.join(baseDir, 'node_trades/hourly');
  const nodeFillsDir = path.join(baseDir, 'node_fills_by_block/hourly');
  
  // Run node_trades generation
  const nodeTradesResult = await runGenerateScript('generate-node-trades-csv.ts', 'node_trades', nodeTradesDir);
  results.push(nodeTradesResult);
  
  if (!nodeTradesResult.success) {
    console.error(`\n❌ node_trades generation failed: ${nodeTradesResult.error}`);
    console.error('Stopping before node_fills_by_block generation.');
    process.exit(1);
  }
  
  // Run node_fills_by_block generation
  const nodeFillsResult = await runGenerateScript('generate-node-fills-by-block-csv.ts', 'node_fills_by_block', nodeFillsDir);
  results.push(nodeFillsResult);
  
  if (!nodeFillsResult.success) {
    console.error(`\n❌ node_fills_by_block generation failed: ${nodeFillsResult.error}`);
    process.exit(1);
  }
  
  // Final summary
  const totalDuration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ All CSV Generation Complete!');
  console.log('='.repeat(70));
  
  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${result.source.padEnd(25)} ${formatDuration(result.duration)}`);
  }
  
  console.log(`\n⏱️  Total time: ${formatDuration(totalDuration)}`);
  
  // Show final tracking file state
  if (fs.existsSync(trackingFile)) {
    try {
      const finalId = parseInt(fs.readFileSync(trackingFile, 'utf-8').trim());
      if (!isNaN(finalId) && finalId > 0) {
        console.log(`📌 Final trade ID: ${finalId.toLocaleString()}`);
        console.log(`   Next run will resume from ID ${(finalId + 1).toLocaleString()}`);
      }
    } catch (error) {
      // Ignore
    }
  }
  
  console.log('\n💡 Next Steps:');
  console.log('='.repeat(70));
  console.log('Import the generated CSVs to your database:');
  console.log('');
  if (baseDir !== './hl-data') {
    console.log(`  npm run import:all ${baseDir} -- --staging-only`);
  } else {
    console.log('  npm run import:all -- --staging-only');
  }
  console.log('');
  console.log('This will load data to staging tables for inspection before production migration.');
  console.log('='.repeat(70));
}

// Handle interruption gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Generation interrupted by user.');
  process.exit(1);
});

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

