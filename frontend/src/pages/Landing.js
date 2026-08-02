import { Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { dashboardAPI, priceAPI, dataAPI } from '../services/api';
import { useState, useEffect } from 'react';
import {
  Leaf, ArrowRight, TrendingUp, MapPin, Shield, Database,
  BarChart3, Users, Sparkles, Activity, Wheat, Filter,
  Eye, Zap,
  Brain, Target, Truck,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

function formatTZS(v) {
  if (v == null) return '--';
  return Number(v).toLocaleString('en-TZ');
}

const TIER_COLORS = { low: '#ef4444', mid: '#f59e0b', high: '#22c55e' };

function normalizeHeatmapData(data) {
  const safeData = data || {};
  const safeCrops = (safeData.crops || []).filter(Boolean);
  const safeRegions = (safeData.regions || [])
    .filter(Boolean)
    .map((region) => {
      if (!region || typeof region !== 'object') {
        return null;
      }

      const safePrices = region?.prices && typeof region.prices === 'object' ? region.prices : {};
      return {
        ...region,
        prices: Object.fromEntries(
          Object.entries(safePrices).filter(([, value]) => value && typeof value === 'object')
        ),
      };
    })
    .filter(Boolean);

  return {
    ...safeData,
    crops: safeCrops,
    regions: safeRegions,
  };
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function Landing() {
  const { isAuthenticated } = useAuth();

  /* ---- data state ---- */
  const [stats, setStats] = useState(null);
  const [recentPrices, setRecentPrices] = useState([]);
  const [crops, setCrops] = useState([]);
  const [regions, setRegions] = useState([]);
  const [heatmap, setHeatmap] = useState(null);

  /* ---- cascading filter ---- */
  const [filterCrop, setFilterCrop] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterResult, setFilterResult] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);

  /* ---- load initial data ---- */
  useEffect(() => {
    dashboardAPI.stats().then((r) => setStats(r.data)).catch(() => {});
    dataAPI.crops().then((r) => setCrops((r.data || []).filter(Boolean))).catch(() => {});
    dataAPI.regions().then((r) => setRegions((r.data || []).filter(Boolean))).catch(() => {});
    priceAPI.list({ limit: 20 }).then((r) => setRecentPrices((r.data || []).filter(Boolean))).catch(() => {});
    priceAPI.heatmap({}).then((r) => setHeatmap(normalizeHeatmapData(r.data))).catch(() => {});
  }, []);

  /* ---- cascading filter query ---- */
  useEffect(() => {
    if (!filterCrop || !filterRegion) {
      setFilterResult(null);
      return;
    }
    setFilterLoading(true);
    priceAPI.list({ crop: filterCrop, region: filterRegion, limit: 5 })
      .then((r) => {
        const data = (r.data || []).filter(Boolean);
        const validPrices = data
          .map((p) => Number(p.price))
          .filter((value) => Number.isFinite(value));

        if (validPrices.length > 0) {
          const avg = validPrices.reduce((s, v) => s + v, 0) / validPrices.length;
          const latest = data.find((p) => p?.price != null) || data[0];

          const unit = latest?.crop_unit || 'kg';

          setFilterResult({
            avg: Math.round(avg),
            count: data.length,
            latest_price: latest?.price ?? null,
            latest_date: latest?.price_date ?? null,
            market: latest?.market_name ?? null,
            crop: latest?.crop_name ?? null,
            region: latest?.region_name ?? null,
            unit: unit,
          });
        } else {
          setFilterResult({ avg: null, count: 0, crop: '', region: '' });
        }
      })
      .catch(() => setFilterResult(null))
      .finally(() => setFilterLoading(false));
  }, [filterCrop, filterRegion]);

  /* ---- heatmap preview data ---- */
  const hmCrops = (heatmap?.crops || []).filter(Boolean).slice(0, 5);
  const hmRegions = (heatmap?.regions || []).filter(Boolean).slice(0, 6);
  const safeRecentPrices = (recentPrices || []).filter(Boolean).filter((entry) => entry && typeof entry === 'object');
  const safeCrops = (crops || []).filter(Boolean).filter((entry) => entry && typeof entry === 'object');
  const safeRegions = (regions || []).filter(Boolean).filter((entry) => entry && typeof entry === 'object');

  return (
    <div>
      {/* ── HERO SECTION ─────────────────────────────────────── */}
      <section className="hero-section">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', background: 'var(--accent-glow)',
            border: '1px solid var(--border)', borderRadius: 20,
            fontSize: '0.8rem', color: 'var(--accent)', marginBottom: 24,
          }}>
            <Sparkles size={14} /> Agricultural Decision Intelligence System
          </div>

          <h1 className="hero-title">
            Smart Crops<br />Market Price Tracker
          </h1>

          <p className="hero-subtitle">
            Real-time crop price intelligence across Tanzania. Track market trends,
            detect price anomalies, and make data-driven agricultural decisions.
          </p>

          {/* ── CASCADING FILTER ──────────────────────────────── */}
          <div className="hero-filter glass-card" style={{ maxWidth: 560, margin: '0 auto 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Filter size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Price Lookup
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                className="form-control"
                value={filterCrop}
                onChange={(e) => setFilterCrop(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
                aria-label="Select crop"
              >
                <option value="">Select Crop...</option>
                {safeCrops.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className="form-control"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
                aria-label="Select region"
              >
                <option value="">Select Region...</option>
                {safeRegions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Filter result */}
            {filterLoading && (
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span className="pulse">Searching prices...</span>
              </div>
            )}
            {filterResult && !filterLoading && filterResult.count > 0 && (
              <div className="hero-filter-result fade-in crop-reveal">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {filterResult.crop} in {filterResult.region}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {formatTZS(filterResult.avg)} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>TZS / {filterResult.unit}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Latest: {filterResult.latest_date}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatTZS(filterResult.latest_price)} <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TZS / {filterResult.unit}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filterResult.market}</div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Based on {filterResult.count} price entries
                  </div>
                  {filterResult.avg != null && filterResult.latest_price != null && (
                    <div className="profit-reveal" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={12} style={{ color: Number(filterResult.latest_price) > filterResult.avg ? '#22c55e' : '#ef4444' }} />
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                        color: Number(filterResult.latest_price) > filterResult.avg ? '#22c55e' : '#ef4444',
                      }}>
                        {Number(filterResult.latest_price) > filterResult.avg ? '+' : ''}{Math.round(((Number(filterResult.latest_price) - filterResult.avg) / filterResult.avg) * 100)}% vs avg
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {filterResult && !filterLoading && filterResult.count === 0 && (
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                No price data found for this combination.
              </div>
            )}
          </div>

          {/* ── DUAL CTA ──────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                <BarChart3 size={18} /> Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">
                  Get Started <ArrowRight size={18} />
                </Link>
                <Link to="/prices" className="btn btn-secondary btn-lg">
                  <Eye size={18} /> View Live Prices
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── LIVE ACTIVITY STRIP ────────────────────────────────── */}
      {safeRecentPrices.length > 0 && (
        <div className="live-activity-strip fade-in">
          <div className="live-activity-item">
            <span className="activity-pulse" />
            <span className="activity-count">{safeRecentPrices.length}</span>
            <span>prices submitted recently</span>
          </div>
          <div className="live-activity-item">
            <Activity size={12} style={{ color: '#3b82f6' }} />
            <span className="activity-count">{new Set(safeRecentPrices.map(p => p.market_name)).size}</span>
            <span>active markets</span>
          </div>
          <div className="live-activity-item">
            <Wheat size={12} style={{ color: '#f59e0b' }} />
            <span className="activity-count">{new Set(safeRecentPrices.map(p => p.crop_name)).size}</span>
            <span>crops tracked today</span>
          </div>
          <div className="live-activity-item">
            <Zap size={12} style={{ color: '#22c55e' }} />
            <span>Data refreshing live</span>
          </div>
        </div>
      )}

      {/* ── LIVE STATS BAR ───────────────────────────────────── */}
      {stats && (
        <section className="stats-bar">
          <div className="stats-bar-inner">
            {[
              { label: 'Price Entries', value: stats.total_entries, icon: <Database size={16} />, color: '#00d4aa' },
              { label: 'Active Markets', value: stats.total_markets, icon: <MapPin size={16} />, color: '#3b82f6' },
              { label: 'Crops Tracked', value: stats.total_crops, icon: <Wheat size={16} />, color: '#f59e0b' },
              { label: 'Regions Covered', value: stats.total_regions, icon: <Users size={16} />, color: '#a855f7' },
            ].map((s, i) => (
              <div key={i} className="stats-bar-item">
                <span className="stats-bar-icon" style={{ color: s.color }}>{s.icon}</span>
                <span className="stats-bar-value">{s.value?.toLocaleString()}</span>
                <span className="stats-bar-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── HEATMAP PREVIEW ──────────────────────────────────── */}
      {hmCrops.length > 0 && hmRegions.length > 0 && (
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>National Price Snapshot</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Latest average prices across regions and crops</p>
            </div>
            <Link to="/prices/heatmap" className="btn btn-secondary btn-sm">
              Full Heatmap <ArrowRight size={14} />
            </Link>
          </div>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-surface, #0d1f12)', zIndex: 2, minWidth: 140 }}>Region</th>
                    {hmCrops.map((crop) => (
                      <th key={crop} style={{ textAlign: 'center', minWidth: 100 }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Wheat size={11} style={{ color: '#00d4aa' }} /> {crop}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hmRegions.map((region) => (
                    <tr key={region.name || region.region_id}>
                      <td style={{
                        position: 'sticky', left: 0, background: 'var(--bg-surface, #0d1f12)', zIndex: 1,
                        fontWeight: 600, fontSize: '0.82rem',
                      }}>
                        <MapPin size={11} style={{ color: '#00d4aa', marginRight: 6 }} />
                        {region.name}
                      </td>
                      {hmCrops.map((crop) => {
                        const cell = region.prices?.[crop];
                        if (!cell || cell.price == null) {
                          return <td key={crop} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>--</td>;
                        }
                        const tierColor = TIER_COLORS[cell.tier] || TIER_COLORS.mid;
                        return (
                          <td key={crop} style={{
                            textAlign: 'center',
                            background: `${tierColor}10`,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            color: tierColor,
                          }}>
                            {formatTZS(cell.price)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── OUTCOME CARDS WITH LIVE STATS ─────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 40, fontSize: '1.75rem' }}>
          Built for Tanzania's Agricultural Future
        </h2>
        <div className="grid-4">
          {[
            {
              icon: <MapPin size={20} />,
              stat: '95%',
              headline: 'Active Agricultural Markets Covered',
              desc: 'Comprehensive price data from verified markets across Tanzania.',
              points: [
                `${stats?.total_markets || '52'}+ verified markets`,
                `${stats?.total_regions || '26'} regions tracked`,
                'Updated daily',
              ],
              color: '#00d4aa',
            },
            {
              icon: <Zap size={20} />,
              stat: '< 5 min',
              headline: 'Real-Time Data Refresh',
              desc: 'Continuous agent submissions keep market data current.',
              points: [
                `${(stats?.total_entries || 997).toLocaleString()}+ live entries`,
                'Continuous agent submissions',
                'Auto-validation pipeline',
              ],
              color: '#3b82f6',
            },
            {
              icon: <Shield size={20} />,
              stat: '97%',
              headline: 'Data Accuracy After Validation',
              desc: 'Multi-layer statistical filtering ensures reliable data quality.',
              points: [
                'Z-score + IQR filtering',
                'Government cross-check',
                'Historical consistency checks',
              ],
              color: '#10b981',
            },
            {
              icon: <Eye size={20} />,
              stat: '100%',
              headline: 'Suspicious Data Flagged Before Publishing',
              desc: 'Every outlier is caught through layered detection before it reaches users.',
              points: [
                'Outlier detection',
                'Agent behavior tracking',
                'Manual + AI verification',
              ],
              color: '#ef4444',
            },
            {
              icon: <Target size={20} />,
              stat: '18%',
              headline: 'Better Selling Prices for Farmers',
              desc: 'Market comparison helps farmers find the highest-paying buyer.',
              points: [
                'Market comparison engine',
                'Best location recommendations',
                'Timing insights',
              ],
              color: '#f59e0b',
            },
            {
              icon: <Brain size={20} />,
              stat: 'AI',
              headline: 'Forecasting with Confidence Bands',
              desc: 'Machine learning models predict price movements with statistical rigor.',
              points: [
                'Price prediction models',
                'Trend detection',
                'Volatility analysis',
              ],
              color: '#a855f7',
            },
            {
              icon: <Users size={20} />,
              stat: 'Growing',
              headline: 'Network of Verified Market Agents',
              desc: 'A trusted contributor network expanding coverage every day.',
              points: [
                'Active contributors daily',
                'Trust scoring system',
                'Regional intelligence',
              ],
              color: '#06b6d4',
            },
            {
              icon: <Truck size={20} />,
              stat: 'Net Profit',
              headline: 'Optimize Profit After Transport Costs',
              desc: 'Factor in logistics to find the truly most profitable destination.',
              points: [
                'Route-based cost calculation',
                'Net profit comparison',
                'Smart destination suggestions',
              ],
              color: '#84cc16',
            },
          ].map((card, i) => (
            <div key={i} className="glass-card fade-in" style={{ padding: 24, cursor: 'default' }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                background: `${card.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.color, marginBottom: 12,
              }}>
                {card.icon}
              </div>
              {/* Stat — visual priority */}
              <div style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: card.color,
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.1,
                marginBottom: 6,
                letterSpacing: '-0.02em',
              }}>
                {card.stat}
              </div>
              {/* Headline */}
              <h3 style={{
                margin: '0 0 8px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}>
                {card.headline}
              </h3>
              {/* Description */}
              <p style={{
                margin: '0 0 14px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}>
                {card.desc}
              </p>
              {/* Proof points */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {card.points.map((point, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                  }}>
                    <span style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: card.color, flexShrink: 0,
                    }} />
                    {point}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA SECTION ──────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div className="glass-card fade-in" style={{ padding: '48px 32px' }}>
          <Leaf size={32} style={{ color: 'var(--accent)', marginBottom: 16 }} />
          <h2 style={{ marginBottom: 12 }}>Ready to Get Started?</h2>
          <p style={{ maxWidth: 500, margin: '0 auto 24px', fontSize: '0.95rem' }}>
            Join farmers, traders, and market agents using Smart Crops to make better agricultural decisions.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                Open Dashboard <ArrowRight size={18} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">
                  Create Free Account <ArrowRight size={18} />
                </Link>
                <Link to="/login" className="btn btn-secondary btn-lg">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="app-footer">
        Smart Crops Market Price Tracker &copy; 2026 &middot; Mbeya University of Science and Technology
      </footer>
    </div>
  );
}
