import { useState, useEffect } from 'react';
import { priceAPI } from '../services/api';
import { cachedAPI } from '../services/DataCache';
import { useDataWithFallback } from '../services/DataContext';
import { PriceTable, LoadingSpinner, PageCard } from '../components/Shared';
import { useAuth } from '../services/AuthContext';
import { TrendingUp, Search, BarChart2, Map, Table, ArrowDownRight, ArrowRight, ArrowUpRight, Trash2, X } from 'lucide-react';
import MarketMap from '../components/MarketMap';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

export default function MarketPrices() {
  const { isAdmin } = useAuth();
  const { crops, regions, markets: contextMarkets } = useDataWithFallback();

  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ crop: '', region: '', market: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [chartData, setChartData] = useState([]);
  const [segments, setSegments] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'map'

  useEffect(() => {
    if (filters.region) {
      cachedAPI.markets(filters.region).then(data => setMarkets(data)).catch(console.error);
    } else {
      setMarkets([]);
    }
  }, [filters.region]);

  useEffect(() => {
    if (filters.crop) {
      priceAPI.segments(filters.crop)
        .then(res => setSegments(res.data))
        .catch(() => setSegments(null));
    } else {
      setSegments(null);
    }
  }, [filters.crop]);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.crop) params.crop = filters.crop;
    if (filters.region) params.region = filters.region;
    if (filters.market) params.market = filters.market;

    priceAPI.list(params)
      .then(res => {
        setPrices(res.data);
        buildChartData(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const buildChartData = (data) => {
    const grouped = {};
    data.forEach(p => {
      const key = p.price_date;
      if (!grouped[key]) grouped[key] = { date: key, prices: {} };
      grouped[key].prices[p.crop_name] = p.price;
    });
    const chart = Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map(item => {
        const row = { date: item.date };
        Object.entries(item.prices).forEach(([crop, price]) => {
          row[crop] = price;
        });
        return row;
      });
    setChartData(chart);
  };

  const handleDelete = (id) => {
    setDeleting(true);
    priceAPI.delete(id)
      .then(() => {
        setPrices(prev => prev.filter(p => p.id !== id));
        setDeleteId(null);
      })
      .catch(err => {
        console.error('Delete failed:', err);
        alert('Failed to delete price entry. ' + (err.response?.data?.error || ''));
      })
      .finally(() => setDeleting(false));
  };

  const filteredPrices = searchTerm
    ? prices.filter(p =>
        (p.crop_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.market_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.region_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : prices;

  const allCropNames = [...new Set(chartData.flatMap(d => Object.keys(d).filter(k => k !== 'date')))];
  const chartColors = ['#00d4aa', '#4ade80', '#059669', '#f59e0b', '#3b82f6', '#ef4444', '#a855f7'];

  // Determine view level: 'region' (default), 'market' (region selected), or 'detail' (market selected)
  const viewLevel = filters.market ? 'detail' : filters.region ? 'market' : 'region';

  // Extract stats from segments response
  const segStats = segments?.statistics;
  const segData = segments?.segments;
  const overallAvg = segStats?.average;
  const totalCount = segStats?.count;

  const categoryBadgeStyle = (category) => {
    const base = {
      display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
    };
    switch (category) {
      case 'low': return { ...base, background: 'rgba(16,185,129,0.15)', color: '#10b981' };
      case 'high': return { ...base, background: 'rgba(239,68,68,0.15)', color: '#ef4444' };
      case 'medium': default: return { ...base, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    }
  };

  const segmentLabel = (key) => {
    switch (key) {
      case 'low': return { text: 'LOW', icon: <ArrowDownRight size={16} />, color: '#10b981' };
      case 'medium': return { text: 'MEDIUM', icon: <ArrowRight size={16} />, color: '#f59e0b' };
      case 'high': return { text: 'HIGH', icon: <ArrowUpRight size={16} />, color: '#ef4444' };
      default: return { text: key.toUpperCase(), icon: null, color: '#888' };
    }
  };

  const segmentDescription = (key) => {
    if (!segStats) return '';
    const lowT = segStats.low_threshold;
    const highT = segStats.high_threshold;
    switch (key) {
      case 'low': return `Below ${Math.round(lowT).toLocaleString()} TZS (< 85% of mean)`;
      case 'medium': return `${Math.round(lowT).toLocaleString()} – ${Math.round(highT).toLocaleString()} TZS`;
      case 'high': return `Above ${Math.round(highT).toLocaleString()} TZS (> 115% of mean)`;
      default: return '';
    }
  };

  const segAvg = (entries) => {
    if (!entries || entries.length === 0) return null;
    const sum = entries.reduce((s, e) => s + e.price, 0);
    return Math.round(sum / entries.length);
  };

  const segMarkets = (entries) => {
    if (!entries) return [];
    return [...new Set(entries.map(e => e.market_name))];
  };

  const pricesWithCategory = filteredPrices.map(p => {
    if (p.price_category) return p;
    if (overallAvg) {
      if (p.price < overallAvg * 0.85) return { ...p, price_category: 'low' };
      if (p.price > overallAvg * 1.15) return { ...p, price_category: 'high' };
      return { ...p, price_category: 'medium' };
    }
    return p;
  });

  // Region-level aggregation: group prices by region and show avg/count
  const regionSummary = viewLevel === 'region' ? (() => {
    const grouped = {};
    pricesWithCategory.forEach(p => {
      const region = p.region_name || 'Unknown';
      if (!grouped[region]) grouped[region] = { region, prices: [], crops: new Set() };
      grouped[region].prices.push(p.price);
      grouped[region].crops.add(p.crop_name);
    });
    return Object.values(grouped)
      .map(g => ({
        region: g.region,
        avg_price: Math.round(g.prices.reduce((a, b) => a + b, 0) / g.prices.length),
        count: g.prices.length,
        crop_count: g.crops.size,
        min_price: Math.min(...g.prices),
        max_price: Math.max(...g.prices),
      }))
      .sort((a, b) => b.count - a.count);
  })() : [];

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><TrendingUp size={28} /> Market Prices</h1>
          <p>Browse and filter real-time crop prices across Tanzania</p>
        </div>
      </div>

      <div className="filters-bar fade-in">
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-control"
            placeholder="Search crops, markets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <select className="form-control" value={filters.crop}
          onChange={(e) => setFilters({ ...filters, crop: e.target.value })}>
          <option value="">All Crops</option>
          {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-control" value={filters.region}
          onChange={(e) => setFilters({ ...filters, region: e.target.value, market: '' })}>
          <option value="">All Regions</option>
          {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {markets.length > 0 && (
          <select className="form-control" value={filters.market}
            onChange={(e) => setFilters({ ...filters, market: e.target.value })}>
            <option value="">All Markets</option>
            {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap' }}>
          {filteredPrices.length} entries
        </span>
      </div>

      {/* View level indicator */}
      <div className="fade-in" style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        fontSize: '0.78rem', color: 'var(--text-muted)',
      }}>
        <span>Viewing:</span>
        <span className="badge" style={{
          background: viewLevel === 'region' ? 'var(--accent-glow)' : 'var(--bg-glass-light)',
          color: viewLevel === 'region' ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: viewLevel === 'region' ? 600 : 400,
        }}>Region</span>
        <span style={{ color: 'var(--text-faint)' }}>&rarr;</span>
        <span className="badge" style={{
          background: viewLevel === 'market' ? 'var(--accent-glow)' : 'var(--bg-glass-light)',
          color: viewLevel === 'market' ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: viewLevel === 'market' ? 600 : 400,
        }}>Market</span>
        <span style={{ color: 'var(--text-faint)' }}>&rarr;</span>
        <span className="badge" style={{
          background: viewLevel === 'detail' ? 'var(--accent-glow)' : 'var(--bg-glass-light)',
          color: viewLevel === 'detail' ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: viewLevel === 'detail' ? 600 : 400,
        }}>Detail</span>
        {viewLevel !== 'region' && (
          <button
            onClick={() => setFilters({ crop: filters.crop, region: '', market: '' })}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <X size={12} /> Reset to region view
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setViewMode('table')}
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Table size={14} /> Table
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`btn btn-sm ${viewMode === 'map' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Map size={14} /> Map
          </button>
        </div>
      </div>

      {/* Price Segments */}
      {segments && segData && (
        <div className="fade-in" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
              Price Segments
            </h3>
            {segments.crop && (
              <span className="badge badge-info">{segments.crop}</span>
            )}
            {overallAvg != null && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Avg: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(overallAvg).toLocaleString()} TZS</strong>
                {totalCount != null && <> &middot; {totalCount} entries</>}
              </span>
            )}
          </div>
          <div className="grid-3">
            {['low', 'medium', 'high'].map((key) => {
              const seg = segData[key];
              if (!seg) return null;
              const { text, icon, color } = segmentLabel(key);
              const entries = seg.entries || [];
              const avg = segAvg(entries);
              const mkts = segMarkets(entries);
              return (
                <div key={key} className="glass-card fade-in" style={{
                  padding: '20px 22px',
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {icon} {text}
                    </span>
                    <span className="badge" style={{
                      background: `${color}22`, color, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 9999,
                    }}>
                      {seg.count} entries
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {segmentDescription(key)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {avg != null ? `${avg.toLocaleString()}` : '—'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>avg TZS</span>
                  </div>
                  {mkts.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {mkts.slice(0, 3).map((m, i) => (
                        <span key={i} className="badge badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>{m}</span>
                      ))}
                      {mkts.length > 3 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                          +{mkts.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <PageCard title="Price Trends" icon={<BarChart2 size={18} />} style={{ marginBottom: 24 }}>
          <div className="chart-container" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4a6b52' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4a6b52' }} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,26,16,0.95)',
                    border: '1px solid rgba(0,212,170,0.2)',
                    borderRadius: 8, fontSize: '0.8rem',
                  }}
                  labelStyle={{ color: '#e8f5e9' }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                {allCropNames.slice(0, 5).map((crop, i) => (
                  <Line key={crop} type="monotone" dataKey={crop}
                    stroke={chartColors[i % chartColors.length]}
                    strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PageCard>
      )}

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div style={{ marginBottom: 24 }}>
          <MarketMap
            markets={viewLevel === 'region' ? contextMarkets : (markets.length > 0 ? markets : contextMarkets)}
            prices={prices}
            height="420px"
            onMarketSelect={(market) => {
              const regionObj = regions.find(r => r.name === market.region_name);
              if (regionObj) setFilters({ ...filters, region: String(regionObj.id), market: String(market.id) });
            }}
          />
        </div>
      )}

      {/* REGION VIEW: Summary table grouped by region */}
      {viewLevel === 'region' && viewMode === 'table' && regionSummary.length > 0 && (
        <PageCard title="Prices by Region" icon={<TrendingUp size={18} />} style={{ marginBottom: 24 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Entries</th>
                  <th>Crops</th>
                  <th>Avg Price (TZS)</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {regionSummary.map((r) => (
                  <tr key={r.region} style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const regionObj = regions.find(reg => reg.name === r.region);
                      if (regionObj) setFilters({ ...filters, region: String(regionObj.id), market: '' });
                    }}
                  >
                    <td><strong>{r.region}</strong></td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.count}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.crop_count}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {r.avg_price.toLocaleString('en-TZ')}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                      {r.min_price.toLocaleString('en-TZ')}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
                      {r.max_price.toLocaleString('en-TZ')}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 500 }}>
                        View markets &rarr;
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      {/* MARKET / DETAIL VIEW: Full price data table */}
      {viewLevel !== 'region' && (
        <PageCard title="Price Data" icon={<TrendingUp size={18} />}>
          {loading ? <LoadingSpinner /> : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Crop</th>
                    {viewLevel === 'detail' && <th>Market</th>}
                    {viewLevel === 'market' && <th>Market</th>}
                    <th>Region</th>
                    <th>Price (TZS)</th>
                    <th>Date</th>
                    <th>Category</th>
                    {isAdmin && <th style={{ width: 60 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {pricesWithCategory.map((p, i) => (
                    <tr key={p.id || i}>
                      <td><strong>{p.crop_name}</strong></td>
                      <td>{p.market_name}</td>
                      <td><span className="badge badge-neutral">{p.region_name}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {p.price != null ? Number(p.price).toLocaleString('en-TZ') : '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.price_date}</td>
                      <td>
                        <span style={categoryBadgeStyle(p.price_category)}>
                          {p.price_category || '—'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          {deleteId === p.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => handleDelete(p.id)}
                                disabled={deleting}
                                style={{
                                  background: 'var(--danger)', border: 'none', color: '#fff',
                                  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                  fontSize: '0.7rem', fontWeight: 600,
                                }}
                              >
                                {deleting ? '...' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setDeleteId(null)}
                                style={{
                                  background: 'var(--bg-glass-light)', border: '1px solid var(--border)',
                                  color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 4,
                                  cursor: 'pointer', fontSize: '0.7rem',
                                }}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteId(p.id)}
                              title="Delete entry"
                              style={{
                                background: 'none', border: 'none', color: 'var(--text-faint)',
                                cursor: 'pointer', padding: 4, borderRadius: 4,
                                transition: 'color 0.2s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-faint)'}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      )}
    </div>
  );
}
