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
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch coverage info on mount and every 30 seconds
  useEffect(() => {
    const fetchCoverage = async () => {
      try {
        const response = await fetch('/api/coverage');
        const data = await response.json();
        if (response.ok && data) {
          console.log('Coverage data:', data);
          setCoverage(data);
        } else {
          console.error('Coverage API error:', data);
        }
      } catch (err) {
        console.error('Failed to fetch coverage:', err);
      } finally {
        setCoverageLoading(false);
      }
    };

    fetchCoverage();
    const interval = setInterval(fetchCoverage, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async (page: number = 1) => {
    setLoading(true);
    setError('');

    try {
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
      setCurrentPage(page);
      
      // Scroll to top of results
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setCurrentPage(1);
    setShowAdvanced(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      minHeight: results ? 'auto' : '100%',
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
        @media (max-width: 768px) {
          .header-section {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .header-actions {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .data-coverage-card {
            min-width: 150px !important;
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
          .data-coverage-card {
            width: 100% !important;
            min-width: unset !important;
          }
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
        <div className="header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: results ? '2rem' : '0', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img 
            src="/hl.png" 
            alt="Hyperliquid Logo" 
            style={{ 
              width: '50px', 
              height: '50px',
              objectFit: 'contain'
            }} 
          />
          <div>
            <h1 style={{ marginBottom: '0.5rem' }}>Hyperliquid TWAP Explorer</h1>
            <p style={{ color: '#666', marginBottom: 0 }}>Search historical Hyperliquid TWAP trades</p>
          </div>
        </div>
        
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Data Coverage Card */}
          <div className="data-coverage-card" style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white',
            padding: '0.875rem 1.25rem', 
            borderRadius: '8px',
            minWidth: '200px',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
          }}>
            <div style={{ fontSize: '0.7rem', opacity: 0.9, marginBottom: '0.5rem', fontWeight: '600', letterSpacing: '0.5px' }}>
              DATA COVERAGE
            </div>
            {coverageLoading ? (
              <>
                <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.3)', height: '1rem', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '0.5rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.3)', height: '0.8rem', borderRadius: '4px', width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                </div>
              </>
            ) : coverage ? (
              <>
                {coverage.earliest_trade && coverage.latest_trade ? (
                  <>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <strong>{new Date(coverage.earliest_trade).toLocaleDateString()}</strong>
                      {' → '}
                      <strong>{new Date(coverage.latest_trade).toLocaleDateString()}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.95, marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '0.5rem' }}>
                      <strong>{coverage.total_trades?.toLocaleString() || 0}</strong> trades
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.85rem' }}>
                    {coverage.total_trades > 0 ? `${coverage.total_trades.toLocaleString()} trades` : 'No data yet'}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.85rem' }}>Loading...</div>
            )}
          </div>

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
        flex: results ? 0 : 1,
        display: 'flex',
        alignItems: results ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: results ? '0' : '2rem 1.5rem'
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

      {/* Results */}
      {results && (
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '0 1.5rem 2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>
              Results <span style={{ color: '#666', fontWeight: 'normal', fontSize: '1rem' }}>({results.count} total)</span>
            </h2>
            {results.data.length > 0 && (
              <div style={{ color: '#666', fontSize: '0.9rem' }}>
                Showing {((currentPage - 1) * parseInt(filters.limit)) + 1} - {Math.min(currentPage * parseInt(filters.limit), results.count)} of {results.count}
              </div>
            )}
          </div>

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
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>User Addresses</th>
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
                      <td style={{ padding: '0.75rem', textAlign: 'left' }}>
                        {trade.participants && trade.participants.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {Array.from(new Set(trade.participants.map(p => p.user_address))).map((address) => (
                              <code 
                                key={address} 
                                style={{ 
                                  fontSize: '0.75rem',
                                  background: '#f5f5f5',
                                  padding: '0.2rem 0.4rem',
                                  borderRadius: '3px',
                                  color: '#555',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '180px',
                                  display: 'block'
                                }}
                                title={address}
                              >
                                {address.slice(0, 6)}...{address.slice(-4)}
                              </code>
                            ))}
                          </div>
                        ) : '-'}
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

          {/* Pagination Controls */}
          {results.data.length > 0 && (
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
                onClick={() => handleSearch(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: currentPage === 1 || loading ? '#e5e5e5' : '#000',
                  color: currentPage === 1 || loading ? '#999' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === 1 || loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                ← Previous
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#666', fontSize: '0.9rem' }}>
                  Page {currentPage} of {Math.ceil(results.count / parseInt(filters.limit))}
                </span>
                {Math.ceil(results.count / parseInt(filters.limit)) > 1 && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {Array.from({ length: Math.min(5, Math.ceil(results.count / parseInt(filters.limit))) }, (_, i) => {
                      const totalPages = Math.ceil(results.count / parseInt(filters.limit));
                      let pageNum;
                      
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handleSearch(pageNum)}
                          disabled={loading}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: currentPage === pageNum ? '#667eea' : 'white',
                            color: currentPage === pageNum ? 'white' : '#333',
                            border: currentPage === pageNum ? 'none' : '1px solid #ddd',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: currentPage === pageNum ? '600' : '400',
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
                onClick={() => handleSearch(currentPage + 1)}
                disabled={currentPage >= Math.ceil(results.count / parseInt(filters.limit)) || loading}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: currentPage >= Math.ceil(results.count / parseInt(filters.limit)) || loading ? '#e5e5e5' : '#000',
                  color: currentPage >= Math.ceil(results.count / parseInt(filters.limit)) || loading ? '#999' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage >= Math.ceil(results.count / parseInt(filters.limit)) || loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
