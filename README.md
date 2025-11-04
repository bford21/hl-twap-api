# Hyperliquid TWAP Service

Access and sort through all Hyperliquid TWAP transactions via API or web interface

## Features

- 🔍 **Query trades by TWAP ID** - Fast indexed queries on TWAP strategies
- 🖥️ **Web Search Interface** - Simple UI homepage for graphical queries
- 📊 **RESTful API** - Get trades, filter by coin/user/TWAP
- 🗄️ **Normalized database** - Supabase with optimized schema
- ☁️ **S3 integration** - Automated data sync from AWS S3
- 🚂 **Railway ready** - One-click deployment

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket
S3_DATA_PREFIX=twap-data/
```

### 3. Create Database Tables

Run this in Supabase SQL Editor:

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

### 4. Import Data

```bash
# Dry run (preview only)
npm run import:twap -- --dry-run

# Import for real (only trades with TWAP IDs)
npm run import:twap
```

### 5. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## API Endpoints

### Get Trades
```bash
GET /api/trades?twap_id=568722
GET /api/trades?coin=BTC&limit=100
GET /api/trades?user=0xabc...
GET /api/trades?start_time=2025-03-22T00:00:00Z&end_time=2025-03-22T23:59:59Z
GET /api/trades?twap_id=568722&start_time=2025-03-22T10:00:00Z
```

### Get TWAP Details
```bash
GET /api/twap/568722
```

### List All TWAPs
```bash
GET /api/twap
```

### Health Check
```bash
GET /api/health
```

## Scripts

- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run start` - Production server
- `npm run import:twap` - Import trades with TWAP IDs
- `npm run cron` - Sync data from S3 to Supabase

## Database Schema

**trades** - Core trade information  
**trade_participants** - Participant details with `twap_id`

Normalized design enables 10-100x faster queries on `twap_id` compared to JSONB.

## Deploy to Railway

1. Push to GitHub
2. Connect repo in Railway dashboard
3. Add environment variables
4. Deploy

Railway will automatically detect `next.config.js` and deploy.

## Query Examples

```sql
-- Get all trades for a TWAP
SELECT t.* FROM trades t
JOIN trade_participants p ON t.id = p.trade_id
WHERE p.twap_id = 568722;

-- TWAP statistics
SELECT 
  p.twap_id,
  COUNT(*) as trades,
  SUM(t.sz * t.px) as volume
FROM trades t
JOIN trade_participants p ON t.id = p.trade_id
WHERE p.twap_id IS NOT NULL
GROUP BY p.twap_id;
```

## License

MIT
