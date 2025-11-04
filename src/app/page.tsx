export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px' }}>
      <h1>🚀 HL TWAP API</h1>
      <p>Trade data API with Supabase and S3 integration.</p>
      
      <h2>📊 Available Endpoints:</h2>
      
      <div style={{ marginBottom: '2rem' }}>
        <h3>GET /api/health</h3>
        <p>Health check endpoint</p>
        <code style={{ background: '#f4f4f4', padding: '0.5rem', display: 'block', borderRadius: '4px' }}>
          curl https://your-app.railway.app/api/health
        </code>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>GET /api/trades</h3>
        <p>Retrieve trade data with optional filters</p>
        <p><strong>Query Parameters:</strong></p>
        <ul>
          <li><code>coin</code> (optional) - Filter by coin symbol (e.g., BTC, ETH)</li>
          <li><code>side</code> (optional) - Filter by side: A or B</li>
          <li><code>user</code> (optional) - Filter by user address</li>
          <li><code>limit</code> (optional, default: 100) - Number of records</li>
          <li><code>offset</code> (optional, default: 0) - Pagination offset</li>
        </ul>
        <code style={{ background: '#f4f4f4', padding: '0.5rem', display: 'block', borderRadius: '4px' }}>
          curl &quot;https://your-app.railway.app/api/trades?coin=BTC&limit=50&quot;
        </code>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>POST /api/trades</h3>
        <p>Insert new trade data</p>
        <p><strong>Required fields:</strong> coin, side, time, px, sz, hash, side_info</p>
        <code style={{ background: '#f4f4f4', padding: '0.5rem', display: 'block', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
          {`curl -X POST https://your-app.railway.app/api/trades \\
  -H "Content-Type: application/json" \\
  -d '{
    "coin": "BTC",
    "side": "A",
    "time": "2025-03-22T23:00:00.000Z",
    "px": "83917.0",
    "sz": "0.5",
    "hash": "0x123...",
    "side_info": [...]
  }'`}
        </code>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>GET /api/trades/stats</h3>
        <p>Get aggregated statistics by coin</p>
        <p><strong>Query Parameters:</strong></p>
        <ul>
          <li><code>coin</code> (optional) - Filter by specific coin</li>
          <li><code>hours</code> (optional, default: 24) - Time range in hours</li>
        </ul>
        <code style={{ background: '#f4f4f4', padding: '0.5rem', display: 'block', borderRadius: '4px' }}>
          curl &quot;https://your-app.railway.app/api/trades/stats?hours=24&quot;
        </code>
      </div>

      <h2>⚙️ Cron Job:</h2>
      <p>Automatically sync trade data from S3 to Supabase:</p>
      <code style={{ background: '#f4f4f4', padding: '0.5rem', display: 'block', borderRadius: '4px' }}>
        npm run cron
      </code>

      <h2>📚 Documentation:</h2>
      <ul>
        <li>Full README: <code>README.md</code></li>
        <li>Quick Start: <code>QUICKSTART.md</code></li>
        <li>Database Schema: <code>supabase-trades-schema.sql</code></li>
      </ul>
    </main>
  )
}

