import { useState, useEffect } from 'react';
import { forecastAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import { LoadingSpinner, PageCard, StatCard } from '../components/Shared';
import {
  LineChart as LineChartIcon, TrendingUp, TrendingDown, Target,
  Calendar, CheckCircle, Info, BarChart3, Activity,
} from 'lucide-react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area, AreaChart,
} from 'recharts';

const ACTION_CONFIG = {
  sell_now: { icon: <TrendingDown size={28} />, color: '#ef4444', label: 'Sell Now', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  hold: { icon: <Target size={28} />, color: '#f59e0b', label: 'Hold', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  wait: { icon: <TrendingUp size={28} />, color: '#00d4aa', label: 'Wait for Better Prices', bg: 'rgba(0,212,170,0.12)', border: 'rgba(0,212,170,0.3)' },
};

const METHOD_COLORS = {
  arima: '#3b82f6', exponential_smoothing: '#8b5cf6', linear: '#f59e0b',
};

function getConfidenceLevel(val) {
  if (val == null) return 'low';
  if (val >= 0.7) return 'high';
  if (val >= 0.3) return 'medium';
  return 'low';
}
const CONFIDENCE_COLORS = { high: '#00d4aa', medium: '#f59e0b', low: '#ef4444' };

function formatTZS(v) {
  if (v == null) return '—';
  return `TZS ${Number(v).toLocaleString()}`;
}

export default function Forecasting() {
  const { crops, markets, loading: dataLoading } = useDataWithFallback();
  const [selectedCrop, setSelectedCrop] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('');
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedCrop) { setForecast(null); return; }
    setLoading(true);
    const req = selectedMarket
      ? forecastAPI.cropMarket(selectedCrop, selectedMarket)
      : forecastAPI.crop(selectedCrop);
    req.then(res => setForecast(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCrop, selectedMarket]);

  if (dataLoading) return <LoadingSpinner message="Loading crops..." />;

  const predictions = forecast?.predictions;
  const trend = forecast?.trend;
  const confidenceVal = forecast?.confidence;
  const confidenceLevel = getConfidenceLevel(confidenceVal);
  const seasonalTrend = forecast?.seasonal_trend;
  const action = forecast?.action;
  const actionReason = forecast?.action_reason;
  const pctChange7d = forecast?.pct_change_7d;
  const stats = forecast?.stats;
  const momentum = forecast?.momentum || {};
  const timeline = forecast?.timeline;
  const forecastTimeline = forecast?.forecast_timeline || [];
  const method = forecast?.method;
  const methodLabel = forecast?.method_label;
  const actionCfg = ACTION_CONFIG[action] || ACTION_CONFIG.hold;
  const currentPrice = forecast?.current_price || 0;

  const combinedChart = [
    ...(timeline || []).map(([date, price]) => ({ date, price, forecast: null, lower: null, upper: null })),
    ...forecastTimeline.map(f => ({ date: f.date, price: null, forecast: f.price, lower: f.lower, upper: f.upper })),
  ];

  const getChangePct = (predVal) => {
    if (!predVal || !currentPrice) return null;
    return ((predVal - currentPrice) / currentPrice * 100).toFixed(1);
  };

  const momentumEntries = Object.entries(momentum);

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><LineChartIcon size={28} style={{ color: 'var(--accent)' }} /> Crop Forecasting</h1>
          <p>ML-powered price predictions and trend analysis</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '16px 20px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
            Select a Crop
          </label>
          <select value={selectedCrop} onChange={e => { setSelectedCrop(e.target.value); setSelectedMarket(''); }} className="form-control">
            <option value="">-- Choose a crop --</option>
            {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {selectedCrop && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
              Filter by Market <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span>
            </label>
            <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)} className="form-control">
              <option value="">-- All Markets (average) --</option>
              {(markets || []).sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedCrop && !loading && (
        <div className="glass-card fade-in" style={{ textAlign: 'center', padding: 48 }}>
          <BarChart3 size={48} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Select a crop above to view price forecasts and trend analysis.
          </p>
        </div>
      )}

      {loading && <LoadingSpinner message="Generating forecast..." />}

      {forecast && !loading && (
        <>
          {/* Stat Cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <StatCard
              label="Current Price"
              value={formatTZS(currentPrice)}
              icon={<BarChart3 size={20} />}
              color="#00d4aa"
            />
            <StatCard
              label="7-Day Prediction"
              value={predictions?.['7_days'] ? formatTZS(predictions['7_days']) : '—'}
              change={pctChange7d != null ? parseFloat(pctChange7d) : undefined}
              icon={<TrendingUp size={20} />}
              color="#3b82f6"
            />
            <StatCard
              label="Confidence"
              value={confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)}
              icon={<CheckCircle size={20} />}
              color={CONFIDENCE_COLORS[confidenceLevel]}
            />
            <StatCard
              label="Trend"
              value={trend ? trend.charAt(0).toUpperCase() + trend.slice(1) : '—'}
              icon={trend === 'up' ? <TrendingUp size={20} /> : trend === 'down' ? <TrendingDown size={20} /> : <Target size={20} />}
              color={trend === 'up' ? '#00d4aa' : trend === 'down' ? '#ef4444' : '#f59e0b'}
            />
          </div>

          {/* Model Method Badge + Volatility + Momentum */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            {methodLabel && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                background: `${METHOD_COLORS[method] || '#6b7280'}18`,
                color: METHOD_COLORS[method] || '#6b7280',
                border: `1px solid ${METHOD_COLORS[method] || '#6b7280'}30`,
              }}>
                <BarChart3 size={12} /> {methodLabel}
              </div>
            )}
            {stats?.volatility != null && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
                border: '1px solid rgba(139,92,246,0.3)',
              }}>
                <Activity size={12} /> Volatility: {stats.volatility}%
              </div>
            )}
            {momentumEntries.map(([period, val]) => (
              <div key={period} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 16, fontSize: '0.72rem', fontWeight: 600,
                background: val >= 0 ? 'rgba(0,212,170,0.12)' : 'rgba(239,68,68,0.12)',
                color: val >= 0 ? '#00d4aa' : '#ef4444',
              }}>
                {val >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {period}: {val >= 0 ? '+' : ''}{val}%
              </div>
            ))}
          </div>

          {/* Combined Historical + Forecast Chart */}
          <PageCard title={`${forecast.crop}${forecast.market ? ` @ ${forecast.market}` : ''} — Price Trend & Forecast`} icon={<TrendingUp size={18} />}>
            <div className="chart-container" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combinedChart} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00d4aa" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#4a6b52' }}
                    tickFormatter={v => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(10,26,16,0.95)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, fontSize: '0.8rem' }}
                    labelStyle={{ color: '#e8f5e9' }}
                    formatter={(val, name) => {
                      if (name === 'price') return [`${Number(val).toLocaleString()} TZS`, 'Actual Price'];
                      if (name === 'forecast') return [`${Number(val).toLocaleString()} TZS`, 'Forecast'];
                      if (name === 'upper') return [`${Number(val).toLocaleString()} TZS`, 'Upper Band'];
                      if (name === 'lower') return [`${Number(val).toLocaleString()} TZS`, 'Lower Band'];
                      return [val, name];
                    }}
                    labelFormatter={v => `Date: ${v}`}
                  />
                  <Area type="monotone" dataKey="upper" fill="rgba(245,158,11,0.08)" stroke="none" />
                  <Area type="monotone" dataKey="lower" fill="transparent" stroke="none" />
                  <Area type="monotone" dataKey="price" stroke="#00d4aa" strokeWidth={2} fill="none" dot={false} connectNulls={false} name="price" />
                  <Area type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" fill="none" dot={false} connectNulls={false} name="forecast" />
                  {predictions?.['30_days'] && (
                    <ReferenceLine y={predictions['30_days']} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} label={{ value: `30d: ${Number(predictions['30_days']).toLocaleString()} TZS`, position: 'right', fill: '#f59e0b', fontSize: 11 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 2, background: '#00d4aa', display: 'inline-block' }} /> Historical</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 2, background: '#f59e0b', borderTop: '2px dashed #f59e0b', display: 'inline-block' }} /> Forecast</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 8, background: 'rgba(245,158,11,0.15)', display: 'inline-block', borderRadius: 2 }} /> Confidence Band</span>
            </div>
          </PageCard>

          {/* Prediction Cards + Daily Forecast Table */}
          <div className="grid-2" style={{ marginTop: 24, marginBottom: 24, gap: 24 }}>
            {/* Prediction Summary Cards */}
            <div>
              <div className="grid-3" style={{ gap: 16 }}>
                {[
                  { key: '7_days', label: '7-Day Forecast' },
                  { key: '14_days', label: '14-Day Forecast' },
                  { key: '30_days', label: '30-Day Forecast' },
                ].map(({ key, label }) => {
                  const predVal = predictions?.[key];
                  if (predVal == null) return null;
                  const changePct = getChangePct(predVal);
                  const isPositive = changePct >= 0;
                  return (
                    <div key={key} className="glass-card fade-in" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                        <Calendar size={14} style={{ color: 'var(--text-faint)' }} />
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: 6 }}>
                        {Number(predVal).toLocaleString()} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TZS</span>
                      </div>
                      {changePct != null && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: isPositive ? 'rgba(0,212,170,0.12)' : 'rgba(239,68,68,0.12)', color: isPositive ? '#00d4aa' : '#ef4444' }}>
                          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {isPositive ? '+' : ''}{changePct}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recommendation Card */}
              <div className="glass-card fade-in" style={{ marginTop: 16, padding: 20, background: actionCfg.bg, border: `1px solid ${actionCfg.border}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ color: actionCfg.color, padding: 10, borderRadius: 10, background: `${actionCfg.color}15`, flexShrink: 0 }}>
                    {actionCfg.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 2px 0', fontSize: '1rem', color: actionCfg.color, fontWeight: 700 }}>{actionCfg.label}</h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{actionReason || 'No specific recommendation available.'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Forecast Table */}
            {forecastTimeline.length > 0 && (
              <div className="glass-card fade-in" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} style={{ color: 'var(--accent)' }} /> Daily Forecast — Next {Math.min(forecastTimeline.length, 14)} Days
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Predicted</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Range</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastTimeline.slice(0, 14).map((day, i) => {
                        const change = currentPrice > 0 ? ((day.price - currentPrice) / currentPrice * 100) : 0;
                        return (
                          <tr key={day.date} style={{ borderBottom: '1px solid var(--border)', opacity: i >= 7 ? 0.6 : 1 }}>
                            <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                              {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {Number(day.price).toLocaleString()}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              {Number(day.lower).toLocaleString()} – {Number(day.upper).toLocaleString()}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: change >= 0 ? '#00d4aa' : '#ef4444' }}>
                              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 8, fontSize: '0.65rem', color: 'var(--text-faint)', textAlign: 'center' }}>
                  90% confidence interval shown · {forecastTimeline.slice(0, 7).length}-day week highlighted
                </div>
              </div>
            )}
          </div>

          {/* Seasonal Trend */}
          {seasonalTrend && seasonalTrend !== 'none' && (
            <PageCard title="Seasonal Pattern" icon={<Calendar size={18} />}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}><Info size={20} /></div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Seasonal trend: <strong>{seasonalTrend}</strong>
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>This crop shows recurring seasonal price variations.</span>
                </div>
              </div>
            </PageCard>
          )}

          {/* Model Stats */}
          <div className="grid-4" style={{ marginTop: 24 }}>
            <div className="glass-card fade-in" style={{ padding: 16, textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Points</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>{stats?.data_points ?? '—'}</div>
            </div>
            <div className="glass-card fade-in" style={{ padding: 16, textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>R-Squared</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>{confidenceVal != null ? confidenceVal.toFixed(3) : '—'}</div>
            </div>
            <div className="glass-card fade-in" style={{ padding: 16, textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Slope</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>{forecast?.trend_slope != null ? Number(forecast.trend_slope).toFixed(2) : '—'}</div>
            </div>
            <div className="glass-card fade-in" style={{ padding: 16, textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Volatility</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>{stats?.volatility != null ? `${stats.volatility}%` : '—'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
