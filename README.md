# Hyperliquid TWAP Service

Access and sort through all Hyperliquid TWAP transactions via API or web interface.

Live version at https://twaptracker.xyz/

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `env.example` to `.env` and fill in your values:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
POSTGRES_PASSWORD=your-database-password-here

# AWS Configuration (for S3 requester-pays bucket access)
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
```

**Note:** AWS credentials are required because the `hl-mainnet-node-data` bucket is a requester-pays bucket.

### 3. Create Database Tables

Run the following sql to create the neccesary tables.

```sql
-- Trades table
CREATE TABLE trades (
  id BIGSERIAL PRIMARY KEY,
  coin TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('A', 'B')),
  time TIMESTAMPTZ NOT NULL,
  px NUMERIC NOT NULL,
  sz NUMERIC NOT NULL,
  hash TEXT NOT NULL,
  trade_dir_override TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participants table (normalized)
CREATE TABLE trade_participants (
  id BIGSERIAL PRIMARY KEY,
  trade_id BIGINT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  start_pos NUMERIC NOT NULL,
  oid BIGINT NOT NULL,
  twap_id BIGINT,
  cloid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trades_coin ON trades(coin);
CREATE INDEX idx_trades_time ON trades(time DESC);
CREATE INDEX idx_participants_twap_id ON trade_participants(twap_id) WHERE twap_id IS NOT NULL;
CREATE INDEX idx_participants_trade_id ON trade_participants(trade_id);
```

### 4. Download All Historical Data

There are 2 main buckets of historical data that the Hyperliquid team makes available

`s3://hl-mainnet-node-data/node_trades` contains all historical trades from 03/22/2025 - 06/21/2025

`s3://hl-mainnet-node-data/node_fills_by_block` contains trades from 07/27/2025 - Present

Prerequisites:
1) Install the AWS CLI (`apt-get install -y awscli`)
2) Run `aws configure` and enter in your personal AWS AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY (these can be in the Security Credentials section of the AWS Console)
3) Install lz4 (`apt-get install -y lz4`)

You need to do this because while these s3 buckets are public. They are setup so the requester must pay for network bandwidth.

Start the download by running
`scripts/download-historical-data.sh`

This script will download both datasets and decompress the .lz4 files. Total disk size is 372gb so it may take awhile.

Note: You may see logs like `Failed ./hourly/20250525/._9.lz4` you can safely ignore these

### 5. Clean & Prep Data

The data we downloaded contains ALL Hyperliquid trades. We want to parse the data, pull out trades where atleast one side of the trade is a TWAP trade and write these trades to a csv for efficient insertion into the database later.

The 2 data sets contain different schemas so we have 2 separate scripts to parse them but one script that wraps them both for 1 easy command to parse all the data into a single unified schema.

`npm run generate:all`

Optional params to specificy filepath
`npm run generate:all /Volumes/A/hl-data`

The output of this parsing is 2 CSV files per day each correspending to a database table. These files are located in the same dir that the data lives in.

### 6. COPY CSV Data to Postgres

Now we need to batch COPY this data into the postgres db. We do this by connecting directly to the postgres instance. Once fully inserted the data takes up approx 60gb.

`npm run import:all`

Optional params to specify directory path and upload to staging table (trades_staging & trade_participants_staging)
`npm run import:all /Volumes/A/hl-data -- --staging-only`

Resume from a specific date (useful if import fails partway through):
`npm run import:all /Volumes/A/hl-data -- --staging-only --start-date=20251006`

### 7. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## API Endpoints

Full API documentation available at https://twaptracker.xyz/docs

**Core Endpoints:**
- `GET /api/trades` - Search trades with filters (twap_id, coin, user, side, time range). Supports pagination.
- `GET /api/twap/:id` - Get all trades and statistics for a specific TWAP ID
- `GET /api/trades/summary` - Get TWAP order summary for a wallet address with aggregate stats
- `GET /api/trades/stats` - Aggregated trade statistics by coin over time
- `GET /api/health` - Health check endpoint

**Examples:**
```bash
# Get trades for a specific TWAP
GET /api/trades?twap_id=568722&limit=50&offset=0

# Get wallet TWAP summary
GET /api/trades/summary?user=0xabc...

# Get TWAP details with statistics
GET /api/twap/568722
```

## Scripts

### Development
- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Data Management

**Daily Sync (Automated)**
- `npm run cron` - Download & import yesterday's TWAP trades from S3
- `npm run cron -- --dry-run` - Test mode (writes preview JSON, no database insert)

**Historical Data Import**
- `npm run generate:all <data_dir>` - Generate CSVs from historical data (both formats)
- `npm run import:all <data_dir> -- --staging-only` - Import CSVs to staging tables
- `npm run import:all <data_dir> -- --staging-only --start-date=YYYYMMDD` - Import from specific date forward
- `npm run import:all <data_dir> -- --migrate-only` - Migrate staging to production

**Example workflow:**
```bash
# 1. Generate CSVs from downloaded data
npm run generate:all /path/to/hl-data

# 2. Import to staging for review
npm run import:all /path/to/hl-data -- --staging-only

# 3. If import fails, resume from specific date
npm run import:all /path/to/hl-data -- --staging-only --start-date=20251006

# 4. Migrate to production after verification
npm run import:all /path/to/hl-data -- --migrate-only
```

## Database Schema

**trades** - Core trade information  
**trade_participants** - Participant details with `twap_id` (2 rows per trade_id representing each side of the trade. A min of 1 side of the trade will have a twap_id)

## Deploy to Railway

1. Push to GitHub
2. Connect repo in Railway dashboard
3. Add environment variables (from `env.example`)
4. Deploy

Railway will automatically detect `next.config.js` and deploy.

## License

MIT
