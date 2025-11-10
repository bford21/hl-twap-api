'use client';

import { useState, useEffect } from 'react';

interface LeaderboardEntry {
  rank: number;
  user_address: string;
  total_volume: number;
  total_trades: number;
  unique_twaps: number;
  last_updated: string;
}

interface LeaderboardData {
  data: LeaderboardEntry[];
  count: number;
  last_updated: string | null;
}

interface LeaderboardProps {
  onUserClick?: (userAddress: string) => void;
}

export default function Leaderboard({ onUserClick }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/leaderboard?limit=10');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leaderboard');
      }

      setLeaderboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLeaderboard(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '2rem 1.5rem'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0',
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#333'
          }}>
            🏆 Top Traders By Volume
          </h2>
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            color: '#999'
          }}>
            Loading leaderboard...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '2rem 1.5rem'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0',
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#333'
          }}>
            🏆 Top Traders By Volume
          </h2>
          <div style={{
            background: '#fee',
            border: '1px solid #fcc',
            padding: '1rem',
            borderRadius: '6px',
            color: '#c00',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!leaderboard || leaderboard.data.length === 0) {
    return (
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '2rem 1.5rem'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0',
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#333'
          }}>
            🏆 Top Traders By Volume
          </h2>
          <p style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: '#666'
          }}>
            No leaderboard data available yet. Please run the initial setup script.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1200px',
      width: '100%',
      margin: '0 auto',
      padding: '2rem 1.5rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e5e5e5'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h2 style={{ 
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🏆 Top Traders By Volume
          </h2>
          {leaderboard.last_updated && (
            <span style={{ 
              fontSize: '0.75rem',
              color: '#999',
              fontFamily: 'monospace'
            }}>
              Updated: {new Date(leaderboard.last_updated).toLocaleString()}
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.9rem',
            tableLayout: 'fixed'
          }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '42%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
              }}>
                <th style={{ 
                  padding: '1rem 0.5rem', 
                  textAlign: 'center',
                  fontWeight: '600',
                  borderTopLeftRadius: '8px'
                }}>
                  Rank
                </th>
                <th style={{ 
                  padding: '1rem 0.5rem', 
                  textAlign: 'left',
                  fontWeight: '600'
                }}>
                  Trader
                </th>
                <th style={{ 
                  padding: '1rem 0.5rem', 
                  textAlign: 'right',
                  fontWeight: '600'
                }}>
                  Total Volume
                </th>
                <th style={{ 
                  padding: '1rem 0.5rem', 
                  textAlign: 'right',
                  fontWeight: '600'
                }}>
                  Trades
                </th>
                <th style={{ 
                  padding: '1rem 0.5rem', 
                  textAlign: 'right',
                  fontWeight: '600',
                  borderTopRightRadius: '8px'
                }}>
                  TWAPs
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.data.map((entry, index) => (
                <tr 
                  key={entry.user_address}
                  onClick={() => onUserClick?.(entry.user_address)}
                  style={{
                    borderBottom: index < leaderboard.data.length - 1 ? '1px solid #f0f0f0' : 'none',
                    transition: 'background-color 0.2s',
                    cursor: onUserClick ? 'pointer' : 'default'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{ 
                    padding: '1rem 0.5rem', 
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: '1.1rem'
                  }}>
                    {entry.rank === 1 && <span style={{ fontSize: '1.5rem' }}>🥇</span>}
                    {entry.rank === 2 && <span style={{ fontSize: '1.5rem' }}>🥈</span>}
                    {entry.rank === 3 && <span style={{ fontSize: '1.5rem' }}>🥉</span>}
                    {entry.rank > 3 && (
                      <span style={{ 
                        color: '#667eea',
                        fontFamily: 'monospace'
                      }}>
                        #{entry.rank}
                      </span>
                    )}
                  </td>
                  <td style={{ 
                    padding: '1rem 0.5rem',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    wordBreak: 'break-all'
                  }}>
                    <span 
                      style={{
                        background: '#f5f5f5',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        color: '#555',
                        fontWeight: '500',
                        display: 'inline-block'
                      }}
                    >
                      {entry.user_address}
                    </span>
                  </td>
                  <td style={{ 
                    padding: '1rem 0.5rem', 
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    color: '#667eea',
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap'
                  }}>
                    ${parseFloat(entry.total_volume.toString()).toLocaleString(undefined, { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}
                  </td>
                  <td style={{ 
                    padding: '1rem 0.5rem', 
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    color: '#666',
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap'
                  }}>
                    {entry.total_trades.toLocaleString()}
                  </td>
                  <td style={{ 
                    padding: '1rem 0.5rem', 
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    color: '#666',
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap'
                  }}>
                    {entry.unique_twaps.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

