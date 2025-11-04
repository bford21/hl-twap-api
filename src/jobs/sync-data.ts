#!/usr/bin/env tsx

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { listS3Objects, getS3Object } from '../lib/s3';

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

async function syncDataFromS3() {
  console.log('Starting S3 to Supabase sync...');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // List all objects in the S3 bucket (or with a specific prefix)
    const prefix = process.env.S3_DATA_PREFIX || 'twap-data/';
    console.log(`Listing S3 objects with prefix: ${prefix}`);
    
    const objects = await listS3Objects(prefix);
    console.log(`Found ${objects.length} objects in S3`);

    if (objects.length === 0) {
      console.log('No objects found. Exiting.');
      return;
    }

    let totalRecordsProcessed = 0;
    let totalRecordsInserted = 0;
    let errors = 0;

    // Process each file
    for (const obj of objects) {
      if (!obj.Key) continue;

      console.log(`\nProcessing: ${obj.Key}`);

      try {
        // Get the file content
        const content = await getS3Object(obj.Key);
        
        // Parse JSONL (JSON Lines) - each line is a separate trade
        let records: TradeRecord[] = [];
        
        try {
          // Split by newlines and parse each line
          const lines = content.trim().split('\n');
          records = lines
            .filter(line => line.trim().length > 0)
            .map(line => JSON.parse(line));
          
          console.log(`  Parsed ${records.length} trade records`);
        } catch (parseError) {
          console.error(`Error parsing JSON from ${obj.Key}:`, parseError);
          errors++;
          continue;
        }

        totalRecordsProcessed += records.length;

        // Insert records into Supabase (normalized schema)
        for (const record of records) {
          try {
            // Insert trade first
            const { data: tradeData, error: tradeError } = await supabase
              .from('trades')
              .insert({
                coin: record.coin,
                side: record.side,
                time: record.time,
                px: parseFloat(record.px),
                sz: parseFloat(record.sz),
                hash: record.hash,
                trade_dir_override: record.trade_dir_override,
              })
              .select()
              .single();

            if (tradeError || !tradeData) {
              console.error(`  Error inserting trade:`, tradeError?.message);
              errors++;
              continue;
            }

            // Insert participants
            const participantRecords = record.side_info.map(si => ({
              trade_id: tradeData.id,
              user_address: si.user,
              start_pos: parseFloat(si.start_pos),
              oid: si.oid,
              twap_id: si.twap_id,
              cloid: si.cloid,
            }));

            const { error: participantError } = await supabase
              .from('trade_participants')
              .insert(participantRecords);

            if (participantError) {
              console.error(`  Error inserting participants for trade ${tradeData.id}:`, participantError.message);
              // Rollback trade
              await supabase.from('trades').delete().eq('id', tradeData.id);
              errors++;
            } else {
              totalRecordsInserted++;
            }
          } catch (error) {
            console.error(`  Error processing record:`, error);
            errors++;
          }
        }

        console.log(`✓ Completed processing ${obj.Key}`);
      } catch (error) {
        console.error(`Error processing ${obj.Key}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Sync completed!');
    console.log(`Total records processed: ${totalRecordsProcessed}`);
    console.log(`Total records inserted: ${totalRecordsInserted}`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Fatal error during sync:', error);
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

