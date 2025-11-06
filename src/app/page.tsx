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

interface TwapSummary {
  twap_id: number;
  address: string;
  coin: string;
  side: string;
  trade_count: number;
  total_volume: number;
  avg_price: number;
}

interface TwapSummaryResults {
  data: TwapSummary[];
  count: number;
  stats: {
    unique_twaps: number;
    total_trades: number;
    total_volume: number;
  };
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
  const [twapSummaries, setTwapSummaries] = useState<TwapSummaryResults | null>(null);
  const [selectedTwapId, setSelectedTwapId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [twapDetailPage, setTwapDetailPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearch = async (page: number = 1) => {
    setLoading(true);
    setError('');

    try {
      // Check if this is a wallet address search (user field filled, but no TWAP ID)
      const isWalletSearch = filters.user && !filters.twap_id && !showAdvanced;
      
      if (isWalletSearch) {
        // Fetch TWAP summaries for this wallet
        const response = await fetch(`/api/trades/summary?user=${encodeURIComponent(filters.user)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch TWAP summaries');
        }

        setTwapSummaries(data);
        setResults(null);
        setSelectedTwapId(null);
      } else {
        // Regular trade search
        const params = new URLSearchParams();
        
        // Calculate offset based on page and limit
        const limit = parseInt(filters.limit);
        const offset = (page - 1) * limit;
        
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            params.append(key, value);
          }
        });
        
        // Add offset for pagination
        params.set('offset', offset.toString());

        const response = await fetch(`/api/trades?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch trades');
        }

        setResults(data);
        setTwapSummaries(null);
        setCurrentPage(page);
      }
      
      // Scroll to top of results
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults(null);
      setTwapSummaries(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTwapClick = async (twapId: number, page: number = 1) => {
    setLoading(true);
    setError('');
    setSelectedTwapId(twapId);

    try {
      const limit = 50;
      const offset = (page - 1) * limit;
      const response = await fetch(`/api/trades?twap_id=${twapId}&limit=${limit}&offset=${offset}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch trades');
      }

      setResults(data);
      setTwapDetailPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSummary = () => {
    setSelectedTwapId(null);
    setResults(null);
    setTwapDetailPage(1);
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
    setTwapSummaries(null);
    setSelectedTwapId(null);
    setError('');
    setCurrentPage(1);
    setTwapDetailPage(1);
    setShowAdvanced(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      minHeight: (results || twapSummaries) ? 'auto' : '100%',
      flex: 1
    }}>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { 
            opacity: 0;
            transform: translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .clickable-row {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .clickable-row:hover {
          background-color: #f5f5f5 !important;
        }
        @media (max-width: 768px) {
          .header-section {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          h1 {
            font-size: 1.5rem !important;
          }
          h2 {
            font-size: 1.25rem !important;
          }
          table {
            font-size: 0.8rem !important;
          }
          table th, table td {
            padding: 0.5rem !important;
          }
        }
        @media (max-width: 480px) {
          .search-buttons {
            flex-direction: column !important;
            width: 100% !important;
          }
          .search-buttons button {
            width: 100% !important;
          }
        }
      `}</style>
      
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.5rem' }}>
        {/* Header */}
        <div className="header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (results || twapSummaries) ? '2rem' : '0', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          <div>
            <h1 style={{ marginBottom: '0.5rem' }}>Hyperliquid TWAP Explorer</h1>
            <p style={{ color: '#666', marginBottom: 0 }}>Search historical Hyperliquid TWAP trades</p>
          </div>
        </div>
        
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <a 
            href="/docs"
            style={{
              padding: '0.75rem 1.5rem',
              background: '#667eea',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: '500',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#5568d3';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#667eea';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            📚 API Docs
          </a>
        </div>
      </div>
      </div>

      {/* Search Form - Centered Vertically and Horizontally */}
      <div style={{ 
        flex: (results || twapSummaries) ? 0 : 1,
        display: 'flex',
        alignItems: (results || twapSummaries) ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: (results || twapSummaries) ? '0' : '2rem 1.5rem'
      }}>
        <div style={{ 
          maxWidth: '700px', 
          width: '100%',
          padding: '0 1rem'
        }}>
        {/* Main Search Input */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '1rem', 
            fontSize: '1.2rem', 
            fontWeight: '600',
            color: '#333',
            textAlign: 'center'
          }}>
            Search by Wallet Address
          </label>
          <input
            type="text"
            value={filters.user}
            onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSearch(1);
              }
            }}
            placeholder="Enter wallet address"
            style={{ 
              width: '100%', 
              padding: '1rem 1.25rem',
              border: '2px solid #ddd',
              borderRadius: '8px',
              fontSize: '1.05rem',
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.2s',
              background: 'white'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
          />
        </div>

        {/* Advanced Options Toggle */}
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              padding: '0.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ 
              display: 'inline-block',
              transition: 'transform 0.2s',
              transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
              fontSize: '0.75rem'
            }}>
              ▶
            </span>
            Advanced Options
          </button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div style={{ 
            marginBottom: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e5e5'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  TWAP ID
                </label>
                <input
                  type="text"
                  value={filters.twap_id}
                  onChange={(e) => setFilters({ ...filters, twap_id: e.target.value })}
                  placeholder="568722"
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  Coin
                </label>
                <input
                  type="text"
                  value={filters.coin}
                  onChange={(e) => setFilters({ ...filters, coin: e.target.value.toUpperCase() })}
                  placeholder="BTC"
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  Side
                </label>
                <select
                  value={filters.side}
                  onChange={(e) => setFilters({ ...filters, side: e.target.value })}
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px',
                    backgroundColor: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">All</option>
                  <option value="A">Ask (A)</option>
                  <option value="B">Bid (B)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  Limit
                </label>
                <input
                  type="number"
                  value={filters.limit}
                  onChange={(e) => setFilters({ ...filters, limit: e.target.value })}
                  min="1"
                  max="100"
                  title="Results per page (large values may take longer)"
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  value={filters.start_time}
                  onChange={(e) => setFilters({ ...filters, start_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={filters.end_time}
                  onChange={(e) => setFilters({ ...filters, end_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  style={{ 
                    width: '100%', 
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    height: '42px'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="search-buttons" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => handleSearch(1)}
            disabled={loading}
            style={{
              padding: '0.875rem 2.5rem',
              background: loading ? '#ccc' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1.05rem',
              fontWeight: '600',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '0.875rem 2rem',
              background: 'white',
              color: '#666',
              border: '2px solid #ddd',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.05rem',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#bbb';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#ddd';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Reset
          </button>
        </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ 
          background: '#fee', 
          border: '1px solid #fcc', 
          padding: '1rem', 
          borderRadius: '4px', 
          margin: '0 1.5rem 1rem',
          color: '#c00',
          maxWidth: '1200px',
          width: '100%',
          boxSizing: 'border-box',
          alignSelf: 'center'
        }}>
          {error}
        </div>
      )}

      {/* Wallet Stats Table */}
      {twapSummaries && !selectedTwapId && (
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '0 1.5rem 2rem'
        }}>
          {/* Warning Box */}
          <div style={{
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginTop: '2rem',
            marginBottom: '2rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <span style={{ color: '#856404', fontWeight: '500', fontSize: '0.95rem' }}>
              Data may be incomplete — please treat this tool as experimental
            </span>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, marginBottom: '1rem' }}>Wallet Stats</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>Unique TWAPs</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Trades</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Volume</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '1rem', fontWeight: '600' }}>
                      {twapSummaries.stats.unique_twaps.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem' }}>
                      {twapSummaries.stats.total_trades.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', fontWeight: '600' }}>
                      ${twapSummaries.stats.total_volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>
              TWAP Orders <span style={{ color: '#666', fontWeight: 'normal', fontSize: '1rem' }}>({twapSummaries.count} total)</span>
            </h2>
            <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>Click on a row to view detailed trades</p>
          </div>

          {twapSummaries.data.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No TWAP orders found for this wallet</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>TWAP ID</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>Address</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>Side</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>Coin</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Trades</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Volume</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Avg Price</th>
                  </tr>
                </thead>
                <tbody>
                  {twapSummaries.data.map((summary) => (
                    <tr 
                      key={summary.twap_id} 
                      className="clickable-row"
                      onClick={() => handleTwapClick(summary.twap_id)}
                      style={{ borderBottom: '1px solid #eee' }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontWeight: '600' }}>
                        {summary.twap_id}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span 
                          style={{ 
                            fontSize: '0.85rem',
                            background: '#f5f5f5',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '3px',
                            color: '#555',
                            fontFamily: 'monospace',
                          }}
                          title={summary.address}
                        >
                          {summary.address.slice(0, 6)}...{summary.address.slice(-4)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{summary.side}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600' }}>{summary.coin}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {summary.trade_count}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                        ${summary.total_volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ${summary.avg_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results && selectedTwapId && (
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '0 1.5rem 2rem'
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={handleBackToSummary}
              style={{
                padding: '0.5rem 1rem',
                background: 'white',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                marginBottom: '1rem',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#667eea';
                e.currentTarget.style.color = 'white';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.color = '#667eea';
              }}
            >
              ← Back to TWAP Orders
            </button>
          </div>

          {/* Warning Box */}
          <div style={{
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginTop: '2rem',
            marginBottom: '2rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <span style={{ color: '#856404', fontWeight: '500', fontSize: '0.95rem' }}>
              Data may be incomplete — please treat this tool as experimental
            </span>
          </div>
        </div>
      )}

      {results && (
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '0 1.5rem 2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>
              {selectedTwapId ? `TWAP ${selectedTwapId} Trades` : 'Results'} <span style={{ color: '#666', fontWeight: 'normal', fontSize: '1rem' }}>({results.count.toLocaleString()} total)</span>
            </h2>
            {results.data.length > 0 && (
              <div style={{ color: '#666', fontSize: '0.9rem' }}>
                {selectedTwapId ? (
                  // When viewing specific TWAP, show paginated results
                  `Showing ${((twapDetailPage - 1) * 50) + 1} - ${Math.min(twapDetailPage * 50, results.count)} of ${results.count.toLocaleString()}`
                ) : (
                  // Regular paginated results
                  `Showing ${((currentPage - 1) * parseInt(filters.limit)) + 1} - ${Math.min(currentPage * parseInt(filters.limit), results.count)} of ${results.count}`
                )}
              </div>
            )}
          </div>

          {results.data.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No trades found matching your criteria</p>
          ) : (
            <>
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
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>User Addresses</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>TWAP IDs</th>
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
                          {trade.side === 'A' ? 'Sell' : 'Buy'}
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
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>
                        {trade.participants && trade.participants.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                            {Array.from(new Set(trade.participants.map(p => p.user_address))).map((address) => (
                              <span 
                                key={address} 
                                style={{ 
                                  fontSize: '0.75rem',
                                  background: '#f5f5f5',
                                  padding: '0.2rem 0.4rem',
                                  borderRadius: '3px',
                                  color: '#555',
                                  fontFamily: 'monospace',
                                  width: 'fit-content'
                                }}
                                title={address}
                              >
                                {address.slice(0, 6)}...{address.slice(-4)}
                              </span>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontFamily: 'monospace' }}>
                        {trade.participants && trade.participants.length > 0 ? (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {Array.from(new Set(trade.participants.map(p => p.twap_id).filter(id => id !== null))).map((twapId) => (
                              <span key={twapId}>
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
            </>
          )}

          {/* Pagination Controls */}
          {results.data.length > 0 && (() => {
            const page = selectedTwapId ? twapDetailPage : currentPage;
            const limit = selectedTwapId ? 50 : parseInt(filters.limit);
            const totalPages = Math.ceil(results.count / limit);
            const handlePageChange = selectedTwapId 
              ? (p: number) => handleTwapClick(selectedTwapId, p)
              : (p: number) => handleSearch(p);

            return (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginTop: '2rem',
                padding: '1rem',
                background: '#f9f9f9',
                borderRadius: '8px',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || loading}
                  style={{
                    padding: '0.5rem 1.5rem',
                    background: page === 1 || loading ? '#e5e5e5' : '#000',
                    color: page === 1 || loading ? '#999' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: page === 1 || loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}
                >
                  ← Previous
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#666', fontSize: '0.9rem' }}>
                    Page {page} of {totalPages}
                  </span>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            disabled={loading}
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: page === pageNum ? '#667eea' : 'white',
                              color: page === pageNum ? 'white' : '#333',
                              border: page === pageNum ? 'none' : '1px solid #ddd',
                              borderRadius: '4px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: page === pageNum ? '600' : '400',
                              minWidth: '2rem'
                            }}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || loading}
                  style={{
                    padding: '0.5rem 1.5rem',
                    background: page >= totalPages || loading ? '#e5e5e5' : '#000',
                    color: page >= totalPages || loading ? '#999' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}
                >
                  Next →
                </button>
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
