'use client';

import { useState, useEffect } from 'react';

interface Trade {
  id: number;
  coin: string;
  side: string;
  time: string;
  px: number;
  sz: number;
  hash: string;
  participants?: Array<{
    user_address: string;
    twap_id: number | null;
    oid: number;
  }>;
}

interface SearchResults {
  data: Trade[];
  count: number;
}

interface CoverageInfo {
  earliest_trade: string | null;
  latest_trade: string | null;
  total_trades: number;
  twap_trades: number;
  unique_twaps: number;
  last_updated: string;
}

export default function Home() {
  const [filters, setFilters] = useState({
    twap_id: '',
    coin: '',
    user: '',
    side: '',
    start_time: '',
    end_time: '',
    limit: '50',
  });

  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coverage, setCoverage] = useState<CoverageInfo | null>(null);

  // Fetch coverage info on mount and every 30 seconds
  useEffect(() => {
    const fetchCoverage = async () => {
      try {
        const response = await fetch('/api/coverage');
        const data = await response.json();
        if (response.ok) {
          setCoverage(data);
        }
      } catch (err) {
        console.error('Failed to fetch coverage:', err);
      }
    };

    fetchCoverage();
    const interval = setInterval(fetchCoverage, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });

      const response = await fetch(`/api/trades?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch trades');
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({
      twap_id: '',
      coin: '',
      user: '',
      side: '',
      start_time: '',
      end_time: '',
      limit: '50',
    });
    setResults(null);
    setError('');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Hyperliquid TWAP Trade Search</h1>
          <p style={{ color: '#666', marginBottom: 0 }}>Search and filter hyperliquid twap trades</p>
        </div>
        
        {/* Data Coverage Info */}
        {coverage && (
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white',
            padding: '1rem 1.5rem', 
            borderRadius: '8px',
            minWidth: '280px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.9, marginBottom: '0.5rem', fontWeight: '600', letterSpacing: '0.5px' }}>
              DATA COVERAGE
            </div>
            {coverage.earliest_trade && coverage.latest_trade ? (
              <>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  <strong>{new Date(coverage.earliest_trade).toLocaleDateString()}</strong>
                  {' → '}
                  <strong>{new Date(coverage.latest_trade).toLocaleDateString()}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '0.5rem' }}>
                  {coverage.total_trades.toLocaleString()} trades
                </div>
              </>
            ) : (
              <div style={{ fontSize: '0.9rem' }}>No data yet</div>
            )}
          </div>
        )}
      </div>

      {/* Search Form */}
      <div style={{ 
        background: '#f9f9f9', 
        padding: '1.5rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              TWAP ID
            </label>
            <input
              type="text"
              value={filters.twap_id}
              onChange={(e) => setFilters({ ...filters, twap_id: e.target.value })}
              placeholder="568722"
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              Coin
            </label>
            <input
              type="text"
              value={filters.coin}
              onChange={(e) => setFilters({ ...filters, coin: e.target.value.toUpperCase() })}
              placeholder="BTC"
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              Side
            </label>
            <select
              value={filters.side}
              onChange={(e) => setFilters({ ...filters, side: e.target.value })}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            >
              <option value="">All</option>
              <option value="A">Ask (A)</option>
              <option value="B">Bid (B)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              Limit
            </label>
            <input
              type="number"
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: e.target.value })}
              min="1"
              max="1000"
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              User Address
            </label>
            <input
              type="text"
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
              placeholder="0xabc..."
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              Start Time
            </label>
            <input
              type="datetime-local"
              value={filters.start_time}
              onChange={(e) => setFilters({ ...filters, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              End Time
            </label>
            <input
              type="datetime-local"
              value={filters.end_time}
              onChange={(e) => setFilters({ ...filters, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '0.95rem'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              background: loading ? '#ccc' : '#000',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#333';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#000';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '0.75rem 2rem',
              background: 'white',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
              e.currentTarget.style.borderColor = '#bbb';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#ddd';
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ 
          background: '#fee', 
          border: '1px solid #fcc', 
          padding: '1rem', 
          borderRadius: '4px', 
          marginBottom: '1rem',
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <h2 style={{ marginBottom: '1rem' }}>
            Results <span style={{ color: '#666', fontWeight: 'normal', fontSize: '1rem' }}>({results.count} trades found)</span>
          </h2>

          {results.data.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No trades found matching your criteria</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Coin</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Side</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Size</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Value</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>TWAP IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.map((trade) => (
                    <tr key={trade.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.75rem' }}>
                        {new Date(trade.time).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: '600' }}>{trade.coin}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '3px',
                          background: trade.side === 'A' ? '#fee' : '#efe',
                          color: trade.side === 'A' ? '#c00' : '#0c0',
                          fontSize: '0.85rem',
                          fontWeight: '500'
                        }}>
                          {trade.side}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {trade.px.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {trade.sz.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ${(trade.px * trade.sz).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {trade.participants && trade.participants.length > 0 ? (
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {Array.from(new Set(trade.participants.map(p => p.twap_id).filter(id => id !== null))).map((twapId) => (
                              <span 
                                key={twapId} 
                                style={{ 
                                  padding: '0.15rem 0.4rem', 
                                  background: '#e8f4f8', 
                                  border: '1px solid #b8d4e8',
                                  borderRadius: '3px',
                                  fontSize: '0.8rem',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {twapId}
                              </span>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* API Documentation */}
      <div style={{ marginTop: '4rem', paddingTop: '3rem', borderTop: '2px solid #e0e0e0' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.75rem' }}>📚 API Documentation</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
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
            Retrieve trade data with optional filters and pagination.
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>twap_id</code> - Filter by TWAP strategy ID</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>coin</code> - Filter by coin symbol (e.g., BTC, ETH)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>user</code> - Filter by user address</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>side</code> - Filter by side: A (ask) or B (bid)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>start_time</code> - Filter trades after this time (ISO 8601)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>end_time</code> - Filter trades before this time (ISO 8601)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>limit</code> - Number of results (default: 100, max: 1000)</div>
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
{`curl "https://your-app.railway.app/api/trades?twap_id=568722&limit=50"

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
      "participants": [...]
    }
  ],
  "count": 150,
  "limit": 50,
  "offset": 0
}`}
            </pre>
          </div>
        </div>

        {/* GET /api/twap */}
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
            <code style={{ fontSize: '1.1rem', fontWeight: '600' }}>/api/twap</code>
          </div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            List all unique TWAP strategy IDs in the database.
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
{`curl "https://your-app.railway.app/api/twap"

# Response
{
  "data": [568722, 568733, 568744, ...],
  "count": 1234
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
            Get detailed statistics and information for a specific TWAP strategy.
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
{`curl "https://your-app.railway.app/api/twap/568722"

# Response
{
  "twap_id": 568722,
  "total_trades": 45,
  "total_volume": 125.5,
  "coins": ["BTC", "ETH"],
  "users": ["0xabc...", "0xdef..."],
  "first_trade": "2025-03-22T10:00:00.000Z",
  "last_trade": "2025-03-22T15:30:00.000Z"
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
            Get aggregated trade statistics by coin.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Query Parameters:</strong>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>coin</code> - Filter by specific coin (optional)</div>
              <div><code style={{ background: '#fff', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>hours</code> - Time range in hours (default: 24)</div>
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
{`curl "https://your-app.railway.app/api/trades/stats?hours=24"

# Response
{
  "stats": [
    {
      "coin": "BTC",
      "total_trades": 1234,
      "total_volume": 567.89,
      "avg_price": 83917.0,
      "min_price": 83500.0,
      "max_price": 84200.0
    }
  ]
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
{`curl "https://your-app.railway.app/api/coverage"

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
            <li>Maximum limit per request: 1000 records</li>
            <li>No authentication required for read operations</li>
            <li>CORS enabled for browser requests</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
