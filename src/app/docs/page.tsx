'use client';

export default function ApiDocs() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <a 
            href="/" 
            style={{ 
              display: 'flex', 
              cursor: 'pointer',
              borderRadius: '8px',
              padding: '4px',
              transition: 'box-shadow 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <img 
              src="/hl.png" 
              alt="Hyperliquid Logo" 
              style={{ 
                width: '50px', 
                height: '50px',
                objectFit: 'contain'
              }} 
            />
          </a>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h1 style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}>API Documentation</h1>
            <p style={{ color: '#666', marginBottom: 0, fontSize: 'clamp(0.875rem, 2vw, 1rem)' }}>Access Hyperliquid TWAP trade data programmatically</p>
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <a 
            href="/"
            style={{
              color: '#667eea',
              textDecoration: 'none',
              fontSize: '0.95rem',
              fontWeight: '500'
            }}
          >
            ← Back to Search
          </a>
        </div>
      </div>

      {/* API Documentation */}
      <div>
        <p style={{ color: '#666', marginBottom: '2rem', fontSize: '1.05rem' }}>
          Access trade data programmatically through our RESTful API endpoints.
        </p>

        {/* GET /api/trades */}
        <div style={{ 
          marginBottom: '2.5rem',
          background: '#fafafa',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ 
              background: '#10b981', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              GET
            </span>
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/trades</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Retrieve trade data with optional filters and pagination. Supports fetching all trades for a TWAP ID beyond the 1000 row limit via pagination.
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>twap_id</code> - Filter by TWAP strategy ID</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>coin</code> - Filter by coin symbol (e.g., BTC, ETH)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>user</code> - Filter by user address</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>side</code> - Filter by side: A (ask/sell) or B (bid/buy)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>start_time</code> - Filter trades after this time (ISO 8601)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>end_time</code> - Filter trades before this time (ISO 8601)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>limit</code> - Number of results per page (default: 50, max: 1000)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>offset</code> - Pagination offset (default: 0)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>include_participants</code> - Include participant details (default: true)</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Example:</strong>
            <pre style={{ 
              background: '#1e293b', 
              color: '#e2e8f0', 
              padding: '1rem', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.85rem',
              lineHeight: '1.5'
            }}>
{`curl "https://twaptracker.xyz/api/trades?twap_id=568722&limit=50&offset=0"

# Response
{
  "data": [
    {
      "id": 123,
      "coin": "BTC",
      "side": "A",
      "time": "2025-03-22T10:30:00.000Z",
      "px": 83917.0,
      "sz": 0.5,
      "hash": "0x123...",
      "participants": [
        {
          "user_address": "0xabc...",
          "twap_id": 568722,
          "oid": 12345
        }
      ]
    }
  ],
  "count": 5234,
  "limit": 50,
  "offset": 0
}`}
            </pre>
          </div>
        </div>

        {/* GET /api/twap/:id */}
        <div style={{ 
          marginBottom: '2.5rem',
          background: '#fafafa',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ 
              background: '#10b981', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              GET
            </span>
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/twap/:id</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Get all trades and statistics for a specific TWAP ID with pagination support.
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>limit</code> - Number of results per page (default: 100, max: 100)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>offset</code> - Pagination offset (default: 0)</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Example:</strong>
            <pre style={{ 
              background: '#1e293b', 
              color: '#e2e8f0', 
              padding: '1rem', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.85rem',
              lineHeight: '1.5'
            }}>
{`curl "https://twaptracker.xyz/api/twap/568722?limit=50&offset=0"

# Response
{
  "twap_id": 568722,
  "trades": [...],
  "count": 45,
  "total_participants": 90,
  "limit": 50,
  "offset": 0,
  "statistics": {
    "user_addresses": ["0xabc..."],
    "trade_count": 45,
    "unique_coins": 1,
    "coins": ["BTC"],
    "total_volume": 125.5,
    "total_value": 10543252.50,
    "avg_price": 83917.0,
    "min_price": 83500.0,
    "max_price": 84200.0,
    "first_trade_time": "2025-03-22T10:00:00.000Z",
    "last_trade_time": "2025-03-22T15:30:00.000Z",
    "duration_seconds": 19800
  }
}`}
            </pre>
          </div>
        </div>

        {/* GET /api/trades/summary */}
        <div style={{ 
          marginBottom: '2.5rem',
          background: '#fafafa',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ 
              background: '#10b981', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              GET
            </span>
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/trades/summary</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Get a summary of all unique TWAP orders for a wallet address, including aggregate statistics.
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>user</code> - User wallet address (required)</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Example:</strong>
            <pre style={{ 
              background: '#1e293b', 
              color: '#e2e8f0', 
              padding: '1rem', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.85rem',
              lineHeight: '1.5'
            }}>
{`curl "https://twaptracker.xyz/api/trades/summary?user=0xabc123..."

# Response
{
  "data": [
    {
      "twap_id": 568722,
      "address": "0xabc123...",
      "coin": "BTC",
      "side": "Buy",
      "trade_count": 45,
      "total_volume": 10543252.5067,
      "avg_price": 83917.2456
    }
  ],
  "count": 12,
  "stats": {
    "unique_twaps": 12,
    "total_trades": 543,
    "total_volume": 125432156.7890
  }
}`}
            </pre>
          </div>
        </div>

        {/* GET /api/trades/stats */}
        <div style={{ 
          marginBottom: '2.5rem',
          background: '#fafafa',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ 
              background: '#10b981', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              GET
            </span>
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/trades/stats</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Get aggregated trade statistics by coin with time-based filtering.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>coin</code> - Filter by specific coin (optional)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>hours</code> - Time range in hours (default: 24)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>limit</code> - Number of results per page (default: 100, max: 100)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>offset</code> - Pagination offset (default: 0)</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Example:</strong>
            <pre style={{ 
              background: '#1e293b', 
              color: '#e2e8f0', 
              padding: '1rem', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.85rem',
              lineHeight: '1.5'
            }}>
{`curl "https://twaptracker.xyz/api/trades/stats?hours=24&limit=10"

# Response
{
  "data": [
    {
      "coin": "BTC",
      "trade_count": 1234,
      "min_price": 83500.0,
      "max_price": 84200.0,
      "avg_price": 83917.0,
      "total_volume": 567.89,
      "first_trade": "2025-11-05T10:00:00.000Z",
      "last_trade": "2025-11-06T09:59:59.000Z"
    }
  ],
  "count": 15,
  "limit": 10,
  "offset": 0,
  "time_range_hours": 24,
  "generated_at": "2025-11-06T10:00:00.000Z"
}`}
            </pre>
          </div>
        </div>

        {/* GET /api/coverage */}
        <div style={{ 
          marginBottom: '2.5rem',
          background: '#fafafa',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ 
              background: '#10b981', 
              color: 'white', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              GET
            </span>
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/coverage</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Get information about data coverage and availability.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Example:</strong>
            <pre style={{ 
              background: '#1e293b', 
              color: '#e2e8f0', 
              padding: '1rem', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.85rem',
              lineHeight: '1.5'
            }}>
{`curl "https://twaptracker.xyz/api/coverage"

# Response
{
  "earliest_trade": "2025-03-22T00:00:00.000Z",
  "latest_trade": "2025-05-25T23:59:59.000Z",
  "total_trades": 1234567,
  "twap_trades": 45678,
  "unique_twaps": 2345,
  "last_updated": "2025-11-04T12:34:56.789Z"
}`}
            </pre>
          </div>
        </div>

        {/* Rate Limits & Authentication */}
        <div style={{ 
          background: '#fff3cd',
          border: '1px solid #ffc107',
          padding: '1.5rem',
          borderRadius: '8px',
          marginTop: '2rem'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>⚡ Rate Limits & Notes</h3>
          <ul style={{ marginBottom: 0, paddingLeft: '1.5rem', lineHeight: '1.8' }}>
            <li>All endpoints return JSON responses</li>
            <li>Timestamps are in ISO 8601 format (UTC)</li>
            <li>Most endpoints support pagination with a maximum of 100 records per request</li>
            <li><code>/api/trades</code> supports up to 1000 records per request for larger batches</li>
            <li>Use pagination (limit + offset) to fetch data beyond the per-page limits</li>
            <li>No authentication required for read operations</li>
            <li>CORS enabled for browser requests</li>
            <li>Data coverage: Historical TWAP trades from Hyperliquid</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

