from pathlib import Path

path = Path('src/pages/Landing.js')
text = path.read_text(encoding='utf-8')
lines = text.splitlines(keepends=True)
start_line = 232
end_line = 900
new_block = '''  const hmCrops = (heatmap?.crops || []).slice(0, 5);
  const hmRegions = (heatmap?.regions || []).slice(0, 6);

  const spotlightCrops = [
    { id: 'maize', emoji: '🌽', name: 'Maize', price: '1,020', change: '+12%', trend: 'up', label: 'Most active', color: '#F2A00C' },
    { id: 'rice', emoji: '🌾', name: 'Rice', price: '2,100', change: '+5%', trend: 'up', label: 'Harvest peak', color: '#1A4D2E' },
    { id: 'beans', emoji: '🫘', name: 'Beans', price: '830', change: '-3%', trend: 'down', label: 'Trading soft', color: '#D4442A' },
    { id: 'sorghum', emoji: '🌱', name: 'Sorghum', price: '940', change: '+8%', trend: 'up', label: 'Strong demand', color: '#1A4D2E' },
  ];

  const liveMarketRows = recentPrices.slice(0, 6);

  return (
    <div>
      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy fade-up" style={{ animationDelay: '0s' }}>
            <span className="hero-eyebrow"><Sparkles size={14} /> Live Agricultural Intelligence</span>
            <h1 className="hero-title">SMART CROP PRICES<br />REAL-TIME MARKET INTEL</h1>
            <p className="hero-subtitle">
              Live prices from 50+ regions across Tanzania, surfaced for farmers, traders, and agents who need instant clarity.
            </p>
            <div className="hero-actions">
              <Link to="/prices" className="hero-action-primary">View Prices</Link>
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className="hero-action-secondary">Get Started</Link>
            </div>
          </div>

          <div className="hero-visual fade-up" style={{ animationDelay: '0.15s' }}>
            <div className="hero-visual-panel">
              <div className="hero-visual-glow" />
              <div className="hero-float-node" style={{ top: '12%', left: '10%' }}>
                <div className="float-icon">🌽</div>
              </div>
              <div className="hero-float-node" style={{ top: '24%', right: '12%' }}>
                <div className="float-icon">🍅</div>
              </div>
              <div className="hero-float-node" style={{ bottom: '14%', left: '14%' }}>
                <div className="float-icon">🌾</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      <section className="featured-crops">
        <div className="featured-grid">
          {spotlightCrops.map((crop, index) => (
            <div key={crop.id} className="crop-card fade-up" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="crop-card-circle" style={{ background: crop.color }}>
                <span>{crop.emoji}</span>
              </div>
              <div className="crop-card-name">{crop.name}</div>
              <div className="crop-card-price">{crop.price} TZS</div>
              <div className={`crop-card-trend ${crop.trend === 'down' ? 'down' : ''}`}>
                {crop.trend === 'up' ? '▲' : '▼'} {crop.change}
              </div>
              <div style={{ marginTop: '0.85rem', color: 'rgba(17, 17, 17, 0.68)', fontSize: '0.9rem' }}>
                {crop.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="live-market">
        <div className="live-market-inner">
          <div className="live-market-header">
            <div className="live-market-title">Live Market Pulse</div>
            <p className="live-market-description">
              Fresh price moves from active Tanzanian markets, updated in real time so you can act fast.
            </p>
          </div>
          <div className="live-market-list">
            {liveMarketRows.length > 0 ? liveMarketRows.map((p, index) => {
              const dir = getPriceDirection(p);
              return (
                <div
                  key={`${p.id || index}-${p.market_name || p.region_name}`}
                  className={`live-market-row ${dir === 'down' ? 'down' : ''} ${dir !== 'stable' ? 'price-pulse' : ''}`}>
                  <div className="market-crop">{p.crop_name}</div>
                  <div className="market-location">{p.region_name || p.market_name}</div>
                  <div className={`market-price ${dir === 'down' ? 'down' : ''}`}>{formatTZS(p.price)} TZS</div>
                  <div className={`market-trend ${dir === 'down' ? 'down' : ''}`}>
                    {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→'} {dir === 'up' ? '+7%' : dir === 'down' ? '-4%' : '0%'}
                  </div>
                </div>
              );
            }) : (
              <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                No live market prices available right now.
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      <section className="ai-insights">
        <div className="ai-grid">
          <div className="ai-highlight-card">
            <h3 className="ai-note-title">Historical Maize Price Index</h3>
            <div className="chart-container" style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={CHART_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--husk-faint)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--husk-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--husk-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[600, 800]}
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--field)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: 'var(--husk)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="var(--sprout)"
                    strokeWidth={2}
                    dot={{ r: 4, stroke: 'var(--sprout)', strokeWidth: 1, fill: 'var(--soil-black)' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <div className="ai-note-card">
              <h4 className="ai-note-title">Maize Trend Update</h4>
              <p className="ai-note-copy">
                Prices are trending upward in Mbeya with a strong crop demand signal. Agents report a 12% gain in supply-constrained districts.
              </p>
            </div>
            <div className="ai-note-card">
              <h4 className="ai-note-title">Price Stabilization Signals</h4>
              <p className="ai-note-copy">
                Rice has stabilized in Dar es Salaam as harvest volumes rise, creating a calm window for traders to lock in long-term contracts.
              </p>
            </div>
            <div className="ai-note-card">
              <h4 className="ai-note-title">Demand Shift Alert</h4>
              <p className="ai-note-copy">
                Millet momentum is building in Dodoma, and agents are flagging a local demand boost that could influence central market pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      <section className="bottom-cta">
        <div className="bottom-cta-panel">
          <h2 className="bottom-cta-title">START USING SMART CROP TODAY</h2>
          <p className="bottom-cta-copy">
            Join farmers, traders, and agents using Smart Crops to make faster decisions with market intelligence they can trust.
          </p>
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="bottom-cta-button">
            Sign Up Free
          </Link>
        </div>
      </section>

      <footer className="app-footer" style={{ fontFamily: 'var(--font-body)' }}>
        Smart Crops Market Price Tracker &copy; 2026 &middot; Mbeya University of Science and Technology
      </footer>
    </div>
  );
}
'''
lines = lines[:start_line-1] + [new_block] + lines[end_line:]
path.write_text(''.join(lines), encoding='utf-8')
print('Landing.js rewritten successfully')
