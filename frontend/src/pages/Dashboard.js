import { useState, useEffect } from 'react';
import { dashboardAPI, priceAPI, forecastAPI, recommendAPI, anomalyAPI, reviewAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import { StatCard, PriceTable, LoadingSpinner, PageCard } from '../components/Shared';
import WeatherWidget from '../components/WeatherWidget';
import PriceAlertManager from '../components/PriceAlertManager';
import { useAuth } from '../services/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend, LineChart, Line,
  AreaChart, Area,
} from 'recharts';
import {
  BarChart3, MapPin, TrendingUp, AlertTriangle, Wheat, ClipboardCheck,
  ArrowUpRight, Sprout, ShoppingCart, LineChart as LineChartIcon,
  Target, FileBarChart, Store, ShieldAlert, Send, Timer, UserCheck,
  Database, Shield, Zap, Clock, Sparkles, TrendingDown, RefreshCw,
  ArrowDownRight, Activity, Eye, Lightbulb, DollarSign, ArrowRight,
  CloudSun,
} from 'lucide-react';

const CHART_COLORS = ['#5FB67D', '#D9A441', '#C75C4D', '#8FAF97', '#B8935A', '#7AADA8', '#A8C5A0'];

const CHART_TOOLTIP_STYLE = {
  background: '#16261D',
  border: '1px solid rgba(242,239,230,0.1)',
  borderRadius: 8,
  fontSize: '0.8rem',
  fontFamily: 'IBM Plex Mono, monospace',
  color: '#F2EFE6',
};

/* ------------------------------------------------------------------ */
/*  Small reusable sub-components                                      */
/* ------------------------------------------------------------------ */

function RecommendationCard({ rec, icon, accentColor }) {
  const confidence = rec.confidence ?? rec.score ?? null;
  const confLevel = confidence != null
    ? confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low'
    : null;
  const recType = rec.type || rec.priority || 'info';
  const alertClass = recType === 'alert' || recType === 'urgent' || rec.priority === 'high'
    ? 'urgent'
    : recType === 'best_market' || recType === 'opportunity' || recType === 'sell'
      ? 'opportunity'
      : 'info';

  const alertLabel = alertClass === 'urgent'
    ? 'Price Alert'
    : alertClass === 'opportunity'
      ? 'Opportunity'
      : 'Insight';
  const alertIconClass = alertClass === 'urgent'
    ? 'alert-danger'
    : alertClass === 'opportunity'
      ? 'alert-success'
      : 'alert-info';

  const actionText = rec.action || rec.suggestion || (
    alertClass === 'urgent' ? 'Review price trend' :
      alertClass === 'opportunity' ? (rec.market_name ? `Consider selling in ${rec.market_name}` : 'View best markets') :
        null
  );

  return (
    <div className={`rec-card ${alertClass} fade-in`}>
      {/* Alert badge */}
      <div className={`rec-alert ${alertIconClass}`}>
        {alertClass === 'urgent' ? <AlertTriangle size={11} /> :
          alertClass === 'opportunity' ? <TrendingUp size={11} /> :
            <Lightbulb size={11} />}
        {alertLabel}
        {confLevel && (
          <span className={`confidence-badge confidence-${confLevel}`} style={{ marginLeft: 6 }}>
            {Math.round(confidence)}%
          </span>
        )}
      </div>

      {/* Title + description */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {icon}
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>
          {rec.crop_name || rec.crop || rec.title || rec.type || 'Recommendation'}
        </strong>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {rec.message || rec.description || rec.detail || 'No details available.'}
      </p>

      {/* Market / score badges */}
      {(rec.market_name || rec.market || rec.buy_market || rec.score != null) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {(rec.market_name || rec.market || rec.buy_market) && (
            <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
              <MapPin size={10} /> {rec.market_name || rec.market || rec.buy_market}
            </span>
          )}
          {rec.score != null && confLevel == null && (
            <span style={{ fontSize: '0.72rem', color: accentColor || 'var(--accent)' }}>
              Score: {Number(rec.score).toFixed(1)}
            </span>
          )}
        </div>
      )}

      {/* Action suggestion */}
      {actionText && (
        <div className="rec-action">
          <ArrowRight size={12} />
          {actionText}
        </div>
      )}
    </div>
  );
}

function ForecastCard({ forecast, color }) {
  const predictions = forecast?.predictions || forecast?.forecast || [];
  const trend = forecast?.trend || forecast?.direction || 'stable';
  const trendColor =
    trend === 'up' || trend === 'increasing'
      ? '#4ade80'
      : trend === 'down' || trend === 'decreasing'
        ? '#ef4444'
        : '#f59e0b';
  const trendIcon =
    trend === 'up' || trend === 'increasing'
      ? '▲'
      : trend === 'down' || trend === 'decreasing'
        ? '▼'
        : '●';

  return (
    <div className="glass-card fade-in" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wheat size={16} style={{ color }} />
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {forecast?.crop || 'Crop'}
          </strong>
        </div>
        <span style={{ color: trendColor, fontSize: '0.85rem', fontWeight: 600 }}>
          {trendIcon} {trend}
        </span>
      </div>

      {forecast?.current_price != null && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Current: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {Number(forecast.current_price).toLocaleString('en-TZ')} TZS
          </span>
        </div>
      )}

      {predictions.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-secondary)' }}>7-Day Outlook:</div>
          {predictions.slice(0, 7).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{p.date || p.day || `Day ${i + 1}`}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {Number(p.price || p.value || 0).toLocaleString('en-TZ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {predictions.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
          No forecast data available.
        </div>
      )}
    </div>
  );
}

function AnomalyRow({ anomaly }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid rgba(0,212,170,0.06)',
        fontSize: '0.82rem',
      }}
    >
      <div>
        <strong style={{ color: 'var(--text-primary)' }}>
          {anomaly.crop_name || anomaly.crop || 'Unknown'}
        </strong>
        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
          {anomaly.market_name || anomaly.market || ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {anomaly.anomaly_score != null && (
          <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {Number(anomaly.anomaly_score).toFixed(2)}
          </span>
        )}
        <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
          <AlertTriangle size={10} /> Anomaly
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared chart components                                            */
/* ------------------------------------------------------------------ */

function AvgPriceBarChart({ data }) {
  return (
    <PageCard title="Average Crop Prices (TZS)" icon={<TrendingUp size={18} />}>
      <div className="chart-container" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#4a6b52' }}
              angle={-25}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 12, fill: '#4a6b52' }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#e8f5e9' }} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PageCard>
  );
}

function DistributionPieChart({ data }) {
  return (
    <PageCard title="Data Distribution by Crop" icon={<Database size={18} />}>
      <div className="chart-container" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={95}
              innerRadius={50}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </PageCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Command Center helpers                                             */
/* ------------------------------------------------------------------ */

function getGreeting(user, role) {
  const hour = new Date().getHours();
  const name = user?.first_name || user?.username || 'User';
  const prefix = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const roleLabel = role ? ` ${role.charAt(0).toUpperCase() + role.slice(1)}` : '';
  return { greeting: `${prefix}, ${name}`, roleLabel };
}

function buildKeyInsight(stats, recentPrices) {
  if (!stats?.avg_prices || stats.avg_prices.length === 0) return null;
  const topCrop = stats.avg_prices[0];
  const todayEntries = stats.today_count ?? recentPrices.filter(
    (p) => (p.price_date || '').startsWith(new Date().toISOString().slice(0, 10))
  ).length;
  const anomalyCount = stats.total_anomalies ?? 0;

  if (anomalyCount > 3) {
    return {
      type: 'alert',
      icon: <AlertTriangle size={18} />,
      title: `${anomalyCount} Anomalies Detected Today`,
      text: `Unusual price movements detected across multiple markets. Review flagged entries for accuracy.`,
      action: '/reviews',
      actionLabel: 'Review Now',
    };
  }
  if (topCrop) {
    return {
      type: 'opportunity',
      icon: <Lightbulb size={18} />,
      title: `${topCrop.crop} — Avg TZS ${Number(topCrop.avg_price).toLocaleString()}/kg`,
      text: `Based on ${topCrop.count ?? stats.total_entries ?? 0} price entries across ${stats.total_markets ?? 0} markets. ${todayEntries} new submissions today.`,
      action: '/prices',
      actionLabel: 'View Prices',
    };
  }
  return null;
}

function KeyInsightBanner({ insight }) {
  if (!insight) return null;
  return (
    <div className={`insight-banner fade-in-up ${insight.type === 'alert' ? '' : ''}`}>
      <div className="insight-icon" style={insight.type === 'alert' ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' } : {}}>
        {insight.icon}
      </div>
      <div className="insight-content">
        <div className="insight-title">{insight.title}</div>
        <div className="insight-text">{insight.text}</div>
      </div>
      <div className="insight-action">
        <a href={insight.action} className="btn btn-secondary btn-sm">
          {insight.actionLabel} <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

function TrendIndicator({ value, label }) {
  if (value == null) return null;
  const num = Number(value);
  const isUp = num > 0;
  const isZero = num === 0;
  return (
    <span className={`trend-indicator ${isZero ? 'trend-stable' : isUp ? 'trend-up' : 'trend-down'}`}>
      {isZero ? '●' : isUp ? '↑' : '↓'} {isZero ? '0' : `${Math.abs(num).toFixed(1)}%`}
      {label && <span style={{ fontSize: '0.68rem', fontWeight: 400, marginLeft: 2 }}>{label}</span>}
    </span>
  );
}

function LastUpdated({ recentPrices }) {
  const latest = recentPrices?.[0];
  const date = latest?.price_date || latest?.created_at;
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diffMin = Math.round((now - d) / 60000);
  const isStale = diffMin > 60;
  const label = diffMin < 1 ? 'Just now' : diffMin < 60 ? `${diffMin}m ago` : `${Math.round(diffMin / 60)}h ago`;
  return (
    <span className="last-updated">
      <span className={`refresh-dot ${isStale ? 'stale' : ''}`} />
      Last updated {label}
    </span>
  );
}



/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const { user, role, isAdmin, isAgent, isTrader, isFarmer } = useAuth();
  const { crops: cropsList, markets, regions: regionsList } = useDataWithFallback();

  /* ---- common state ---- */
  const [stats, setStats] = useState(null);
  const [recentPrices, setRecentPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---- weather state ---- */
  const [weatherRegion, setWeatherRegion] = useState(user?.region || '');

  /* ---- role-specific state ---- */
  const [recommendations, setRecommendations] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceFilters, setPriceFilters] = useState({ crop: '', market: '', region: '' });

  /* ---- initial data load ---- */
  useEffect(() => {
    const tasks = [
      dashboardAPI.stats(),
      priceAPI.list({ limit: 50 }),
    ];

    const needsRecommendations = isFarmer || isTrader || isAgent;
    const needsAnomalies = isAgent || isAdmin;
    const needsReviews = isAgent;

    if (needsRecommendations) tasks.push(recommendAPI.list());
    if (needsAnomalies) tasks.push(anomalyAPI.list());
    if (needsReviews) tasks.push(reviewAPI.list());

    Promise.all(tasks)
      .then((results) => {
        let idx = 0;
        setStats(results[idx++].data);
        setRecentPrices(results[idx++].data || []);

        if (needsRecommendations) {
          const recResult = results[idx++].data;
          setRecommendations(Array.isArray(recResult) ? recResult : recResult?.recommendations || []);
        }
        if (needsAnomalies) setAnomalies(results[idx++].data || []);
        if (needsReviews) setReviews(results[idx++].data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  /* ---- farmer: price history for main crops line chart ---- */
  useEffect(() => {
    if (!isFarmer || loading) return;
    const mainCrops = parseMainCrops(user?.main_crops);
    if (mainCrops.length > 0) {
      priceAPI
        .list({ limit: 200 })
        .then((res) => setPriceHistory(res.data || []))
        .catch(console.error);
    }
  }, [isFarmer, user, loading]);

  /* ---- trader: forecasts for first 4 crops ---- */
  useEffect(() => {
    if (!isTrader || !stats?.avg_prices || loading) return;
    const crops = stats.avg_prices.slice(0, 4);
    Promise.all(
      crops.map((c) => {
        const cropId = c.crop_id || c.id || (cropsList.find(
          (cl) => cl.name?.toLowerCase() === (c.crop || '').toLowerCase()
        ) || {}).id;
        if (!cropId) return Promise.resolve({ crop: c.crop, predictions: [] });
        return forecastAPI
          .crop(cropId)
          .then((r) => ({ crop: c.crop, ...r.data }))
          .catch(() => ({ crop: c.crop, predictions: [] }));
      })
    )
      .then(setForecasts)
      .catch(console.error);
  }, [isTrader, stats, loading, cropsList]);

  /* ---- loading guard ---- */
  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  /* ---- derived chart data ---- */
  const avgPriceData = (stats?.avg_prices || []).map((item, i) => ({
    name: item.crop,
    avg: item.avg_price,
    min: item.min_price,
    max: item.max_price,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const cropDistribution = (stats?.avg_prices || []).map((item, i) => ({
    name: item.crop,
    value: item.count,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  /* ---- farmer line chart data ---- */
  const farmerMainCrops = parseMainCrops(user?.main_crops);
  const farmerLineData = buildFarmerLineData(priceHistory, farmerMainCrops);

  /* ---- pending review count (agent) ---- */
  const pendingReviews = reviews.filter(
    (r) => r.status === 'pending' || r.status === 'flagged' || r.review_status === 'pending'
  ).length;

  /* ---- derived ---- */
  const { greeting, roleLabel } = getGreeting(user, role);
  const keyInsight = buildKeyInsight(stats, recentPrices);

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="page">
      {/* ── COMMAND CENTER HEADER ── */}
      <div className="command-center-header fade-in">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="greeting">{greeting}</div>
            <div className="greeting-sub">
              {roleLabel
                ? `${roleLabel} Intelligence Dashboard — here's what's happening in Tanzania's markets today.`
                : "Real-time overview of Tanzania's crop market data"}
            </div>
            <LastUpdated recentPrices={recentPrices} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live Data</span>
          </div>
        </div>
      </div>

      {/* ── KEY INSIGHT BANNER ── */}
      <KeyInsightBanner insight={keyInsight} />

      {/* ── STAT CARDS ── */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="Total Entries"
          value={stats?.total_entries || 0}
          icon={<FileBarChart size={20} />}
          color="#00d4aa"
        />
        <StatCard
          label="Active Markets"
          value={stats?.total_markets || 0}
          icon={<Store size={20} />}
          color="#3b82f6"
        />
        <StatCard
          label="Crops Tracked"
          value={stats?.total_crops || 0}
          icon={<Wheat size={20} />}
          color="#f59e0b"
        />
        <StatCard
          label="Anomalies"
          value={stats?.total_anomalies || 0}
          icon={<ShieldAlert size={20} />}
          color="#ef4444"
        />
      </div>

      {/* ── WEATHER + ALERTS ROW ── */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="glass-card fade-in" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudSun size={18} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Weather</h3>
            </div>
            <select
              className="form-control"
              value={weatherRegion}
              onChange={(e) => setWeatherRegion(e.target.value)}
              style={{ width: 180, fontSize: '0.78rem', padding: '4px 8px' }}
            >
              <option value="">Select region...</option>
              {regionsList.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <WeatherWidget region={weatherRegion} compact={true} />
        </div>
        <div className="glass-card fade-in" style={{ padding: 20 }}>
          <PriceAlertManager crops={cropsList} markets={markets} compact={true} />
        </div>
      </div>

      {/* ============================================================== */}
      {/*  ROLE-SPECIFIC SECTIONS                                        */}
      {/* ============================================================== */}

      {isFarmer && (
        <FarmerSections
          recommendations={recommendations}
          farmerMainCrops={farmerMainCrops}
          farmerLineData={farmerLineData}
          avgPriceData={avgPriceData}
          recentPrices={recentPrices}
        />
      )}

      {isTrader && (
        <TraderSections
          recommendations={recommendations}
          avgPriceData={avgPriceData}
          cropDistribution={cropDistribution}
          forecasts={forecasts}
        />
      )}

      {isAgent && (
        <AgentSections
          recommendations={recommendations}
          anomalies={anomalies}
          pendingReviews={pendingReviews}
          avgPriceData={avgPriceData}
          cropDistribution={cropDistribution}
        />
      )}

      {(isAdmin || (!isFarmer && !isTrader && !isAgent)) && (
        <AdminSections
          avgPriceData={avgPriceData}
          cropDistribution={cropDistribution}
          anomalies={anomalies}
        />
      )}

      {/* ---- recent price entries with filters (common) ---- */}
      <PageCard
        title="Recent Price Entries"
        icon={<TrendingUp size={18} />}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="filter-select"
              value={priceFilters.crop}
              onChange={(e) => setPriceFilters((f) => ({ ...f, crop: e.target.value }))}
              aria-label="Filter by crop"
            >
              <option value="">All Crops</option>
              {[...new Set(recentPrices.map((p) => p.crop_name).filter(Boolean))].sort().map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={priceFilters.market}
              onChange={(e) => setPriceFilters((f) => ({ ...f, market: e.target.value }))}
              aria-label="Filter by market"
            >
              <option value="">All Markets</option>
              {[...new Set(recentPrices.map((p) => p.market_name).filter(Boolean))].sort().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={priceFilters.region}
              onChange={(e) => setPriceFilters((f) => ({ ...f, region: e.target.value }))}
              aria-label="Filter by region"
            >
              <option value="">All Regions</option>
              {[...new Set(recentPrices.map((p) => p.region_name).filter(Boolean))].sort().map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <a href="/prices" className="btn btn-secondary btn-sm">
              View All <ArrowUpRight size={14} />
            </a>
          </div>
        }
      >
        <PriceTable
          prices={recentPrices.filter((p) =>
            (!priceFilters.crop || p.crop_name === priceFilters.crop) &&
            (!priceFilters.market || p.market_name === priceFilters.market) &&
            (!priceFilters.region || p.region_name === priceFilters.region)
          )}
          showStatus
          showAdminDelete={isAdmin}
          onDelete={(id) => {
            if (window.confirm('Are you sure you want to remove this price entry?')) {
              priceAPI.delete(id).then(() => {
                setRecentPrices((prev) => prev.filter((p) => p.id !== id));
                // Refresh stats after deletion
                dashboardAPI.stats().then((r) => setStats(r.data)).catch(() => { });
              }).catch((err) => {
                const msg = err.response?.data?.error || 'Failed to delete entry. Please try again.';
                alert(msg);
                console.error('Delete failed:', err);
              });
            }
          }}
        />
      </PageCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FARMER                                                             */
/* ------------------------------------------------------------------ */

function FarmerSections({ recommendations, farmerMainCrops, farmerLineData, avgPriceData, recentPrices }) {
  const top3 = (recommendations || []).slice(0, 3);

  /* best markets: extract unique markets from recommendations that mention a market */
  const bestMarkets = (recommendations || []).filter(
    (r) => r.market_name || r.market || r.type === 'best_market' || r.type === 'market'
  ).slice(0, 4);

  return (
    <>
      {/* Your Recommendations */}
      {top3.length > 0 && (
        <PageCard title="Your Recommendations" icon={<Sprout size={18} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {top3.map((rec, i) => (
              <RecommendationCard
                key={rec.id || i}
                rec={rec}
                icon={<Sprout size={16} style={{ color: CHART_COLORS[i] }} />}
                accentColor={CHART_COLORS[i]}
              />
            ))}
          </div>
        </PageCard>
      )}

      {/* Price Trends for Your Crops */}
      <div style={{ marginBottom: 24 }}>
        {farmerMainCrops.length > 0 && farmerLineData.length > 0 ? (
          <PageCard title="Price Trends for Your Crops" icon={<LineChartIcon size={18} />}>
            <div className="chart-container" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={farmerLineData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#4a6b52' }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#e8f5e9' }} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#81c784' }} />
                  {farmerMainCrops.map((crop, i) => (
                    <Line
                      key={crop}
                      type="monotone"
                      dataKey={crop}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </PageCard>
        ) : (
          <AvgPriceBarChart data={avgPriceData} />
        )}
      </div>

      {/* Best Markets */}
      {bestMarkets.length > 0 && (
        <PageCard title="Best Markets" icon={<Target size={18} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {bestMarkets.map((rec, i) => (
              <div
                key={rec.id || i}
                className="glass-card fade-in"
                style={{
                  padding: '16px 20px',
                  borderTop: `3px solid ${CHART_COLORS[i % CHART_COLORS.length]}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MapPin size={16} style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    {rec.market_name || rec.market || rec.title || 'Market'}
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {rec.message || rec.description || `Best price for ${rec.crop_name || rec.crop || 'your crop'}`}
                </p>
                {rec.price != null && (
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Price:{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4ade80' }}>
                      {Number(rec.price).toLocaleString('en-TZ')} TZS
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {/* Market Price Comparison (Profit Focus) */}
      {recentPrices && recentPrices.length > 5 && (
        <MarketProfitInsights prices={recentPrices} crops={farmerMainCrops} />
      )}
    </>
  );
}

function MarketProfitInsights({ prices, crops }) {
  // Group by crop and find best/worst markets
  const cropMap = {};
  prices.forEach((p) => {
    if (!p.crop_name || !p.market_name) return;
    if (!cropMap[p.crop_name]) cropMap[p.crop_name] = {};
    if (!cropMap[p.crop_name][p.market_name]) cropMap[p.crop_name][p.market_name] = [];
    cropMap[p.crop_name][p.market_name].push(Number(p.price));
  });

  const insights = Object.entries(cropMap).map(([crop, markets]) => {
    const marketAvgs = Object.entries(markets).map(([market, prices]) => ({
      market,
      avg: prices.reduce((s, v) => s + v, 0) / prices.length,
    }));
    if (marketAvgs.length < 2) return null;
    marketAvgs.sort((a, b) => b.avg - a.avg);
    const best = marketAvgs[0];
    const worst = marketAvgs[marketAvgs.length - 1];
    const spread = best.avg - worst.avg;
    const pctGain = worst.avg > 0 ? ((spread / worst.avg) * 100) : 0;
    return { crop, best, worst, spread, pctGain, marketCount: marketAvgs.length };
  }).filter(Boolean).slice(0, 4);

  if (insights.length === 0) return null;

  return (
    <PageCard title="Profit Opportunities" icon={<DollarSign size={18} />}
      style={{ marginBottom: 24 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {insights.map((insight, i) => (
          <div key={i} className={`profit-card fade-in stagger-${i + 1}`}>
            <div className="profit-header">
              <span className="profit-label">
                <Wheat size={12} style={{ marginRight: 4 }} /> {insight.crop}
              </span>
              <span className="profit-amount">+{insight.pctGain.toFixed(0)}%</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Sell in <strong style={{ color: '#22c55e' }}>{insight.best.market}</strong> instead of {insight.worst.market}
            </div>
            <div className="profit-detail">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Best price</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#22c55e' }}>
                  {Math.round(insight.best.avg).toLocaleString()} TZS
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Lowest price</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#ef4444' }}>
                  {Math.round(insight.worst.avg).toLocaleString()} TZS
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(0,212,170,0.08)', paddingTop: 4, marginTop: 4 }}>
                <span>Potential gain</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                  +{Math.round(insight.spread).toLocaleString()} TZS/kg
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 12 }}>
        Based on recent price data across {insights.reduce((max, i) => Math.max(max, i.marketCount), 0)} markets.
        Prices vary by market — choose wisely to maximize your profit.
      </div>
    </PageCard>
  );
}

/* ------------------------------------------------------------------ */
/*  TRADER                                                             */
/* ------------------------------------------------------------------ */

function TraderSections({ recommendations, avgPriceData, cropDistribution, forecasts }) {
  const tradingRecs = (recommendations || []).slice(0, 6);

  return (
    <>
      {/* Market Opportunities */}
      {tradingRecs.length > 0 && (
        <PageCard title="Market Opportunities" icon={<ShoppingCart size={18} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {tradingRecs.map((rec, i) => (
              <RecommendationCard
                key={rec.id || i}
                rec={rec}
                icon={<ShoppingCart size={16} style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} />}
                accentColor={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </PageCard>
      )}

      {/* Charts: Bar + Pie */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <AvgPriceBarChart data={avgPriceData} />
        <DistributionPieChart data={cropDistribution} />
      </div>

      {/* Price Forecast Quick View */}
      {forecasts.length > 0 && (
        <PageCard title="Price Forecast Quick View" icon={<TrendingUp size={18} />}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {forecasts.map((f, i) => (
              <ForecastCard key={f.crop || i} forecast={f} color={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </div>
        </PageCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  AGENT                                                              */
/* ------------------------------------------------------------------ */

function AgentSections({ recommendations, anomalies, pendingReviews, avgPriceData, cropDistribution }) {
  const recentAnomalies = (anomalies || []).slice(0, 8);

  return (
    <>
      {/* Your Performance */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="Recommendations Made"
          value={(recommendations || []).length}
          icon={<Send size={20} />}
          color="#00d4aa"
        />
        <StatCard
          label="Anomalies Detected"
          value={(anomalies || []).length}
          icon={<ShieldAlert size={20} />}
          color="#ef4444"
        />
        <StatCard
          label="Pending Reviews"
          value={pendingReviews}
          icon={<Timer size={20} />}
          color="#f59e0b"
        />
        <StatCard
          label="Reviewed Items"
          value={(recommendations || []).filter(
            (r) => r.status === 'approved' || r.status === 'reviewed'
          ).length}
          icon={<UserCheck size={20} />}
          color="#3b82f6"
        />
      </div>

      {/* Review Queue + Anomalies row */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Review Queue */}
        <PageCard
          title="Review Queue"
          icon={<Shield size={18} />}
          action={
            <a href="/reviews" className="btn btn-secondary btn-sm">
              Open Reviews <ArrowUpRight size={14} />
            </a>
          }
        >
          {pendingReviews > 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  color: '#f59e0b',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {pendingReviews}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '8px 0 0' }}>
                items awaiting your review
              </p>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>All caught up! No pending reviews.</p>
            </div>
          )}
        </PageCard>

        {/* Recent Anomalies */}
        <PageCard
          title="Recent Anomalies"
          icon={<AlertTriangle size={18} />}
          action={
            <a href="/anomalies" className="btn btn-secondary btn-sm">
              View All <ArrowUpRight size={14} />
            </a>
          }
        >
          {recentAnomalies.length > 0 ? (
            <div>
              {recentAnomalies.map((a, i) => (
                <AnomalyRow key={a.id || i} anomaly={a} />
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>No anomalies detected.</p>
            </div>
          )}
        </PageCard>
      </div>

      {/* Charts: Bar + Pie */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <AvgPriceBarChart data={avgPriceData} />
        <DistributionPieChart data={cropDistribution} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ADMIN (default)                                                    */
/* ------------------------------------------------------------------ */

function AdminSections({ avgPriceData, cropDistribution, anomalies }) {
  const recentAnomalies = (anomalies || []).slice(0, 5);
  const totalAnomalies = (anomalies || []).length;

  return (
    <>
      {/* Quick Management Actions */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <a href="/anomalies" className="glass-card stat-card fade-in" style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
            <ShieldAlert size={20} />
          </div>
          <span className="stat-label">Anomaly Management</span>
          <span className="stat-value" style={{ color: '#ef4444' }}>{totalAnomalies}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {totalAnomalies > 0 ? `${totalAnomalies} require attention →` : 'No active anomalies'}
          </span>
        </a>
        <a href="/reviews" className="glass-card stat-card fade-in" style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            <ClipboardCheck size={20} />
          </div>
          <span className="stat-label">Review Queue</span>
          <span className="stat-value" style={{ color: '#f59e0b' }}>View</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Approve or reject submissions →
          </span>
        </a>
        <a href="/agents" className="glass-card stat-card fade-in" style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <UserCheck size={20} />
          </div>
          <span className="stat-label">Agent Approval</span>
          <span className="stat-value" style={{ color: '#3b82f6' }}>Manage</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Approve or suspend agents →
          </span>
        </a>
      </div>

      {/* Charts: Bar + Pie */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <AvgPriceBarChart data={avgPriceData} />
        <DistributionPieChart data={cropDistribution} />
      </div>

      {/* Anomaly Overview — always visible for admin */}
      <PageCard
        title="Anomaly Overview"
        icon={<AlertTriangle size={18} />}
        action={
          <a href="/anomalies" className="btn btn-secondary btn-sm">
            Manage Anomalies <ArrowUpRight size={14} />
          </a>
        }
        style={{ marginBottom: 24 }}
      >
        {recentAnomalies.length > 0 ? (
          <div>
            {recentAnomalies.map((a, i) => (
              <AnomalyRow key={a.id || i} anomaly={a} />
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <p style={{ color: 'var(--text-muted)' }}>No anomalies detected. All prices look normal.</p>
          </div>
        )}
      </PageCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseMainCrops(mainCrops) {
  if (!mainCrops) return [];
  if (Array.isArray(mainCrops)) return mainCrops.filter(Boolean);
  if (typeof mainCrops === 'string') {
    return mainCrops
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildFarmerLineData(priceHistory, farmerMainCrops) {
  if (!priceHistory || priceHistory.length === 0 || farmerMainCrops.length === 0) return [];

  const lowerCrops = farmerMainCrops.map((c) => c.toLowerCase());

  const grouped = {};
  priceHistory.forEach((p) => {
    const cropName = p.crop_name || '';
    if (!lowerCrops.includes(cropName.toLowerCase())) return;
    const date = p.price_date;
    if (!date) return;
    if (!grouped[date]) grouped[date] = { date };
    grouped[date][cropName] = Number(p.price);
  });

  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}