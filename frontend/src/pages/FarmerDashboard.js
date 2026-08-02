import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { farmerAPI, forecastAPI, recommendAPI, priceAPI, cooperativeAPI } from '../services/api';
import { cachedAPI } from '../services/DataCache';
import { useAuth } from '../services/AuthContext';
import { StatCard, LoadingSpinner, PageCard } from '../components/Shared';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area,
} from 'recharts';
import {
  Sprout, MapPin, TrendingUp, TrendingDown, Truck, Clock, Target,
  BarChart3, Wheat, ArrowUpRight, ArrowDownRight, DollarSign,
  Navigation, Package, Gauge, AlertTriangle, CheckCircle, XCircle,
  Minus, Activity, Route, ArrowRight, AlertCircle, CloudSun,
} from 'lucide-react';
import { useDataWithFallback } from '../services/DataContext';
import TanzaniaTransportMap from '../components/TanzaniaTransportMap';
import WeatherWidget from '../components/WeatherWidget';
import PriceAlertManager from '../components/PriceAlertManager';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ['#00d4aa', '#4ade80', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(10,26,16,0.95)',
  border: '1px solid rgba(0,212,170,0.2)',
  borderRadius: 8,
  fontSize: '0.8rem',
};

const SIGNAL_COLORS = {
  sell_now: '#ef4444',
  wait: '#f59e0b',
  hold: '#22c55e',
};

const SIGNAL_LABELS = {
  sell_now: 'SELL NOW',
  wait: 'WAIT',
  hold: 'HOLD',
};

const VEHICLE_OPTIONS = [
  { value: 'lorry', label: 'Lorry (5-10 tons)' },
  { value: 'pickup', label: 'Pickup (1-2 tons)' },
  { value: 'motorbike', label: 'Motorbike (50-100 kg)' },
];

const FARMER_TABS = [
  { key: 'overview', label: 'Overview', to: '/farmer/dashboard' },
  { key: 'best-market', label: 'Best Market', to: '/farmer/best-market' },
  { key: 'farm', label: 'Farm Profile', to: '/farmer/farm' },
  { key: 'timing', label: 'Sell Timing', to: '/farmer/timing' },
  { key: 'cooperative', label: 'Cooperative', to: '/farmer/cooperative' },
  { key: 'analytics', label: 'Analytics', to: '/farmer/analytics' },
  { key: 'transport', label: 'Transport', to: '/farmer/transport' },
];

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
  return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

function formatTZS(value) {
  if (value == null) return '--';
  return Number(value).toLocaleString('en-TZ');
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Score Gauge (SVG arc)                                              */
/* ------------------------------------------------------------------ */

const ScoreGauge = memo(function ScoreGauge({ score, size = 180 }) {
  const clamped = Math.max(0, Math.min(100, score || 0));
  const radius = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -210;
  const endAngle = 30;
  const totalArc = endAngle - startAngle; // 240 degrees
  const sweepAngle = startAngle + (totalArc * clamped) / 100;

  const toRad = (deg) => (deg * Math.PI) / 180;

  const arcPath = (from, to) => {
    const x1 = cx + radius * Math.cos(toRad(from));
    const y1 = cy + radius * Math.sin(toRad(from));
    const x2 = cx + radius * Math.cos(toRad(to));
    const y2 = cy + radius * Math.sin(toRad(to));
    const largeArc = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const needleX = cx + (radius - 8) * Math.cos(toRad(sweepAngle));
  const needleY = cy + (radius - 8) * Math.sin(toRad(sweepAngle));

  let gaugeColor = '#22c55e';
  if (clamped < 35) gaugeColor = '#ef4444';
  else if (clamped < 65) gaugeColor = '#f59e0b';

  return (
    <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
      {/* Background arc */}
      <path
        d={arcPath(startAngle, endAngle)}
        fill="none"
        stroke="rgba(0,212,170,0.1)"
        strokeWidth={12}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={arcPath(startAngle, sweepAngle)}
        fill="none"
        stroke={gaugeColor}
        strokeWidth={12}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${gaugeColor}40)` }}
      />
      {/* Needle dot */}
      <circle cx={needleX} cy={needleY} r={6} fill={gaugeColor} />
      {/* Score text */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="var(--text-primary)"
        fontSize="28"
        fontWeight="800"
        fontFamily="var(--font-mono)"
      >
        {clamped}
      </text>
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="11"
        fontWeight="600"
      >
        / 100
      </text>
    </svg>
  );
});

/* ------------------------------------------------------------------ */
/*  Recommendation Card                                                */
/* ------------------------------------------------------------------ */

const RecommendationCard = memo(function RecommendationCard({ rec, icon, accentColor }) {
  return (
    <div
      className="glass-card fade-in"
      style={{
        padding: '16px 20px',
        borderLeft: `3px solid ${accentColor || 'var(--accent)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {icon}
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          {rec.crop_name || rec.crop || rec.title || rec.type || 'Recommendation'}
        </strong>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {rec.message || rec.description || rec.detail || 'No details available.'}
      </p>
      {(rec.market_name || rec.market || rec.score) && (
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {(rec.market_name || rec.market) && (
            <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
              <MapPin size={10} /> {rec.market_name || rec.market}
            </span>
          )}
          {rec.score != null && (
            <span style={{ fontSize: '0.72rem', color: accentColor || 'var(--accent)' }}>
              Score: {Number(rec.score).toFixed(1)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function FarmerDashboard({ tab }) {
  const { user } = useAuth();
  const { crops, regions: allRegions, markets: allMarkets } = useDataWithFallback();
  const [weatherRegion, setWeatherRegion] = useState(user?.region || '');
  const farmerMainCrops = useMemo(() => parseMainCrops(user?.main_crops), [user?.main_crops]);

  /* ---- shared state ---- */
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);

  /* ---- best-market state ---- */
  const [bestMarketCrop, setBestMarketCrop] = useState('');
  const [bestMarketData, setBestMarketData] = useState(null);
  const [bestMarketLoading, setBestMarketLoading] = useState(false);

  /* ---- sell-timing state ---- */
  const [timingCrop, setTimingCrop] = useState('');
  const [timingData, setTimingData] = useState(null);
  const [timingLoading, setTimingLoading] = useState(false);

  /* ---- transport state ---- */
  const [transportOrigin, setTransportOrigin] = useState('');
  const [transportDest, setTransportDest] = useState('');
  const [transportVehicle, setTransportVehicle] = useState('truck');
  const [transportQty, setTransportQty] = useState('');
  const [transportWeight, setTransportWeight] = useState(1000);
  const [transportResult, setTransportResult] = useState(null);
  const [transportLoading, setTransportLoading] = useState(false);
  const [transportError, setTransportError] = useState('');

  /* ---- analytics state ---- */
  const [analyticsCrop, setAnalyticsCrop] = useState('');
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [cropPrices, setCropPrices] = useState({});
  /* ---- cooperative state (real API) ---- */
  const [coopNameInput, setCoopNameInput] = useState('');
  const [coopJoinLoading, setCoopJoinLoading] = useState(false);
  const [myCoops, setMyCoops] = useState([]);
  const [nearbyCoops, setNearbyCoops] = useState([]);
  const [coopLoading, setCoopLoading] = useState(false);
  const [coopError, setCoopError] = useState(null);
  const [coopCreateForm, setCoopCreateForm] = useState({ name: '', region: '', description: '' });

  /* ---- initial data load (recommendations only; crops/markets/regions come from DataContext) ---- */
  useEffect(() => {
    const tasks = [
      recommendAPI.list().then((r) => {
          const d = r.data;
          return Array.isArray(d) ? d : (d?.recommendations || []);
        }),
    ];

    Promise.all(tasks)
      .then(([recsData]) => {
        setRecommendations(recsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- set default crop selectors when crops from context and user are available ---- */
  useEffect(() => {
    if (!crops || crops.length === 0) return;
    const mainCrops = parseMainCrops(user?.main_crops);
    if (mainCrops.length > 0) {
      const match = crops.find((c) =>
        mainCrops.some((mc) => mc.toLowerCase() === (c.name || '').toLowerCase())
      );
      const defaultCropId = match
        ? match.id || match.crop_id
        : crops[0]?.id || crops[0]?.crop_id || '';
      setBestMarketCrop(String(defaultCropId));
      setTimingCrop(String(defaultCropId));
      setAnalyticsCrop(String(defaultCropId));
    } else {
      const firstId = crops[0]?.id || crops[0]?.crop_id || '';
      setBestMarketCrop(String(firstId));
      setTimingCrop(String(firstId));
      setAnalyticsCrop(String(firstId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crops, user]);

  /* ---- load price history for overview & analytics ---- */
  useEffect(() => {
    if (loading || crops.length === 0) return;
    priceAPI.list({ limit: 200 })
      .then((r) => setPriceHistory(r.data || []))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, crops.length]);

  /* ---- fetch best market when crop changes ---- */
  useEffect(() => {
    if (!bestMarketCrop || tab !== 'best-market') return;
    setBestMarketLoading(true);
    farmerAPI
      .bestMarket({ crop: bestMarketCrop })
      .then((r) => setBestMarketData(r.data))
      .catch(() => setBestMarketData(null))
      .finally(() => setBestMarketLoading(false));
  }, [bestMarketCrop, tab]);

  /* ---- fetch sell timing when crop changes ---- */
  useEffect(() => {
    if (!timingCrop || tab !== 'timing') return;
    setTimingLoading(true);
    farmerAPI
      .sellAdvisor({ crop: timingCrop })
      .then((r) => setTimingData(r.data))
      .catch(() => setTimingData(null))
      .finally(() => setTimingLoading(false));
  }, [timingCrop, tab]);

  /* ---- fetch forecast when analytics crop changes ---- */
  useEffect(() => {
    if (!analyticsCrop || tab !== 'analytics') return;
    setForecastLoading(true);
    forecastAPI
      .crop(analyticsCrop)
      .then((r) => setForecastData(r.data))
      .catch(() => setForecastData(null))
      .finally(() => setForecastLoading(false));
  }, [analyticsCrop, tab]);

  /* ---- fetch crop prices for farm profile ---- */
  useEffect(() => {
    if (loading || crops.length === 0 || farmerMainCrops.length === 0) return;
    const prices = {};
    const tasks = farmerMainCrops.map((cropName) => {
      const cropObj = crops.find(
        (c) => (c.name || '').toLowerCase() === cropName.toLowerCase()
      );
      const cropId = cropObj?.id || cropObj?.crop_id;
      if (!cropId) return Promise.resolve();
      return priceAPI.list({ crop: cropId, limit: 5 })
        .then((r) => {
          prices[cropName] = r.data || [];
        })
        .catch(() => {});
    });
    Promise.all(tasks).then(() => setCropPrices(prices));
  }, [loading, crops, farmerMainCrops]);

  /* ---- load cooperatives when tab is active ---- */
  useEffect(() => {
    if (tab !== 'cooperative') return;
    setCoopLoading(true);
    setCoopError(null);
    Promise.all([
      cooperativeAPI.my().catch(() => []),
      cooperativeAPI.list({ region: user?.region }).catch(() => []),
    ])
      .then(([myRes, nearbyRes]) => {
        const myData = Array.isArray(myRes) ? myRes : (myRes?.data || myRes?.cooperatives || []);
        const nearbyData = Array.isArray(nearbyRes) ? nearbyRes : (nearbyRes?.data || nearbyRes?.cooperatives || []);
        setMyCoops(myData);
        setNearbyCoops(nearbyData);
      })
      .catch((err) => setCoopError(err?.message || 'Failed to load cooperatives.'))
      .finally(() => setCoopLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ---- quick sell-timing for overview (first crop) ---- */
  const [quickTiming, setQuickTiming] = useState(null);
  useEffect(() => {
    if (loading || tab != null) return;
    const mainCrops = parseMainCrops(user?.main_crops);
    let cropId = '';
    if (mainCrops.length > 0 && crops.length > 0) {
      const match = crops.find((c) =>
        mainCrops.some((mc) => mc.toLowerCase() === (c.name || '').toLowerCase())
      );
      cropId = match ? match.id || match.crop_id : crops[0]?.id || crops[0]?.crop_id || '';
    } else if (crops.length > 0) {
      cropId = crops[0]?.id || crops[0]?.crop_id || '';
    }
    if (cropId) {
      farmerAPI
        .sellAdvisor({ crop: cropId })
        .then((r) => setQuickTiming(r.data))
        .catch(() => {});
    }
  }, [loading, user, crops, tab]);

  /* ---- transport cost submit ---- */
  const handleTransportCalc = useCallback((e) => {
    e.preventDefault();
    if (!transportOrigin || !transportDest || !transportVehicle) return;
    setTransportLoading(true);
    setTransportError('');
    setTransportResult(null);
    farmerAPI
      .calculateTransport({
        from: transportOrigin,
        to: transportDest,
        weight: Number(transportWeight) || 1000,
        vehicle_type: transportVehicle,
      })
      .then((r) => setTransportResult(r.data))
      .catch((err) => setTransportError(err?.response?.data?.detail || err?.message || 'Failed to calculate transport cost.'))
      .finally(() => setTransportLoading(false));
  }, [transportOrigin, transportDest, transportVehicle, transportWeight]);

  /* ---- cooperative refresh helper ---- */
  const refreshCoops = useCallback(() => {
    return Promise.all([
      cooperativeAPI.my().catch(() => []),
      cooperativeAPI.list({ region: user?.region }).catch(() => []),
    ]).then(([myRes, nearbyRes]) => {
      const myData = Array.isArray(myRes) ? myRes : (myRes?.data || myRes?.cooperatives || []);
      const nearbyData = Array.isArray(nearbyRes) ? nearbyRes : (nearbyRes?.data || nearbyRes?.cooperatives || []);
      setMyCoops(myData);
      setNearbyCoops(nearbyData);
    });
  }, [user?.region]);

  /* ---- cooperative create handler ---- */
  const handleCreateCooperative = useCallback((e) => {
    e.preventDefault();
    if (!coopCreateForm.name.trim()) return;
    setCoopJoinLoading(true);
    setCoopError(null);
    cooperativeAPI.create({
      name: coopCreateForm.name.trim(),
      region: coopCreateForm.region.trim() || user?.region || '',
      description: coopCreateForm.description.trim(),
    })
      .then(() => {
        setCoopCreateForm({ name: '', region: '', description: '' });
        return refreshCoops();
      })
      .catch((err) => setCoopError(err?.message || 'Failed to create cooperative.'))
      .finally(() => setCoopJoinLoading(false));
  }, [coopCreateForm, user?.region, refreshCoops]);

  /* ---- cooperative join handler ---- */
  const handleJoinCoop = useCallback((coopId) => {
    setCoopError(null);
    cooperativeAPI.join(coopId)
      .then(() => refreshCoops())
      .catch((err) => setCoopError(err?.message || 'Failed to join cooperative.'));
  }, [refreshCoops]);

  /* ---- cooperative leave handler ---- */
  const handleLeaveCoop = useCallback((coopId) => {
    setCoopError(null);
    cooperativeAPI.leave(coopId)
      .then(() => refreshCoops())
      .catch((err) => setCoopError(err?.message || 'Failed to leave cooperative.'));
  }, [refreshCoops]);

  /* ---- legacy cooperative form handler (kept for backward compat) ---- */
  const handleJoinCooperative = useCallback((e) => {
    e.preventDefault();
    if (!coopNameInput.trim()) return;
    setCoopJoinLoading(true);
    setCoopError(null);
    cooperativeAPI.create({
      name: coopNameInput.trim(),
      region: user?.region || '',
      description: '',
    })
      .then(() => {
        setCoopNameInput('');
        return refreshCoops();
      })
      .catch((err) => setCoopError(err?.message || 'Failed to join/register cooperative.'))
      .finally(() => setCoopJoinLoading(false));
  }, [coopNameInput, user?.region, refreshCoops]);

  /* ---- derived data ---- */
  const farmerLineData = useMemo(() => buildFarmerLineData(priceHistory, farmerMainCrops), [priceHistory, farmerMainCrops]);
  const preferredMarkets = useMemo(() => parseMainCrops(user?.preferred_markets), [user?.preferred_markets]);
  const avgCropPrice = useMemo(() => {
    return Object.values(cropPrices).reduce((sum, prices) => {
      if (!prices || prices.length === 0) return sum;
      const avg = prices.reduce((s, p) => s + Number(p.price || 0), 0) / prices.length;
      return sum + avg;
    }, 0);
  }, [cropPrices]);
  const farmSize = useMemo(() => Number(user?.farm_size) || 0, [user?.farm_size]);
  const revenueEstimate = avgCropPrice > 0 && farmSize > 0
    ? Math.round(avgCropPrice * farmSize)
    : 0;

  /* ---- loading guard ---- */
  if (loading) return <LoadingSpinner message="Loading farmer dashboard..." />;

  const currentTab = tab || 'overview';

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="page">
      {/* ---- page header ---- */}
      <div className="page-header fade-in">
        <div>
          <h1>
            <Sprout size={28} /> Farmer Dashboard
          </h1>
          <p>
            {tab == null
              ? `Welcome back, ${user?.first_name || user?.username || 'Farmer'}! Here's your farm overview.`
              : tabLabel(tab)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live Data</span>
        </div>
      </div>

      <div className="tab-bar fade-in">
        {FARMER_TABS.map((item) => (
          <Link key={item.key} to={item.to} className={item.key === currentTab ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>

      {/* ---- render based on tab ---- */}
      {tab == null && renderOverview()}
      {tab === 'best-market' && renderBestMarket()}
      {tab === 'farm' && renderFarmProfile()}
      {tab === 'timing' && renderSellTiming()}
      {tab === 'cooperative' && renderCooperative()}
      {tab === 'analytics' && renderAnalytics()}
      {tab === 'transport' && renderTransport()}
    </div>
  );

  /* ============================================================== */
  /*  OVERVIEW                                                        */
  /* ============================================================== */

  function renderOverview() {
    const topRecs = (recommendations || []).slice(0, 4);
    const bestMarketRecs = (recommendations || []).filter(
      (r) => r.type === 'best_market' || r.type === 'market'
    ).slice(0, 3);
    const generalRecs = (recommendations || []).filter(
      (r) => r.type !== 'best_market' && r.type !== 'market'
    ).slice(0, 3);

    const signal = quickTiming?.signal || quickTiming?.recommendation || 'hold';
    const signalColor = SIGNAL_COLORS[signal] || SIGNAL_COLORS.hold;
    const signalScore = quickTiming?.score ?? quickTiming?.sell_score ?? null;

    return (
      <>
        {/* Stat cards row */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard
            label="Your Crops"
            value={farmerMainCrops.length || crops.length || 0}
            icon={<Wheat size={20} />}
            color="#00d4aa"
          />
          <StatCard
            label="Recommendations"
            value={recommendations.length}
            icon={<Target size={20} />}
            color="#3b82f6"
          />
          <StatCard
            label="Markets Available"
            value={allMarkets.length}
            icon={<MapPin size={20} />}
            color="#f59e0b"
          />
          <StatCard
            label="Sell Signal"
            value={SIGNAL_LABELS[signal] || 'HOLD'}
            icon={<Gauge size={20} />}
            color={signalColor}
          />
        </div>

        {/* Weather */}
        <div className="glass-card fade-in" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CloudSun size={18} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Weather in Your Region</h3>
            </div>
            <select
              className="form-control"
              value={weatherRegion}
              onChange={(e) => setWeatherRegion(e.target.value)}
              style={{ width: 180, fontSize: '0.78rem', padding: '4px 8px' }}
            >
              <option value="">Select region...</option>
              {allRegions.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <WeatherWidget region={weatherRegion} compact={true} />
        </div>

        {/* Price Alerts */}
        <div className="glass-card fade-in" style={{ padding: 20, marginBottom: 24 }}>
          <PriceAlertManager crops={crops} markets={allMarkets} compact={false} />
        </div>

        {/* Recommendations */}
        {topRecs.length > 0 && (
          <PageCard
            title="Your Recommendations"
            icon={<Sprout size={18} />}
            action={
              <a href="/recommendations" className="btn btn-secondary btn-sm">
                View All <ArrowUpRight size={14} />
              </a>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {topRecs.map((rec, i) => (
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

        <div style={{ height: 24 }} />

        {/* Quick sell-timing gauge + best markets */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Quick Sell Timing */}
          <PageCard title="Quick Sell Timing" icon={<Clock size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {signalScore != null ? (
                <>
                  <ScoreGauge score={signalScore} />
                  <div
                    style={{
                      padding: '8px 24px',
                      borderRadius: 20,
                      background: `${signalColor}18`,
                      border: `1px solid ${signalColor}40`,
                      color: signalColor,
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {SIGNAL_LABELS[signal] || 'HOLD'}
                  </div>
                  {quickTiming?.message && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
                      {quickTiming.message}
                    </p>
                  )}
                </>
              ) : (
                <div className="empty-state" style={{ padding: '30px 0' }}>
                  <p style={{ color: 'var(--text-muted)' }}>No timing data available yet.</p>
                </div>
              )}
            </div>
          </PageCard>

          {/* Best Markets Quick */}
          <PageCard title="Top Markets" icon={<Target size={18} />}>
            {bestMarketRecs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {bestMarketRecs.map((rec, i) => (
                  <div
                    key={rec.id || i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i < bestMarketRecs.length - 1 ? '1px solid rgba(0,212,170,0.06)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MapPin size={14} style={{ color: CHART_COLORS[i] }} />
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {rec.market_name || rec.market || rec.title || 'Market'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {rec.crop_name || rec.crop || ''}
                        </div>
                      </div>
                    </div>
                    {rec.price != null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4ade80', fontSize: '0.9rem' }}>
                        {formatTZS(rec.price)} TZS
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <p style={{ color: 'var(--text-muted)' }}>No market recommendations yet.</p>
              </div>
            )}
          </PageCard>
        </div>

        {/* General Tips */}
        {generalRecs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <PageCard title="Farming Tips & Insights" icon={<Activity size={18} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {generalRecs.map((rec, i) => (
                  <RecommendationCard
                    key={rec.id || i}
                    rec={rec}
                    icon={<Sprout size={16} style={{ color: CHART_COLORS[(i + 3) % CHART_COLORS.length] }} />}
                    accentColor={CHART_COLORS[(i + 3) % CHART_COLORS.length]}
                  />
                ))}
              </div>
            </PageCard>
          </div>
        )}

        {/* Price Trend Line Chart */}
        {farmerLineData.length > 0 && farmerMainCrops.length > 0 && (
          <PageCard title="Price Trends for Your Crops" icon={<TrendingUp size={18} />}>
            <div className="chart-container" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={farmerLineData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    {farmerMainCrops.map((crop, i) => (
                      <linearGradient key={crop} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4a6b52' }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#e8f5e9' }} />
                  {farmerMainCrops.map((crop, i) => (
                    <Area
                      key={crop}
                      type="monotone"
                      dataKey={crop}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={`url(#grad-${i})`}
                      strokeWidth={2}
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </PageCard>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  BEST MARKET                                                     */
  /* ============================================================== */

  function renderBestMarket() {
    const rankings = bestMarketData?.rankings || bestMarketData?.markets || bestMarketData || [];
    const rankingsArr = Array.isArray(rankings) ? rankings : [];
    const bestSell = rankingsArr.length > 0
      ? rankingsArr.reduce((a, b) => (b.net_price || b.netPrice || 0) > (a.net_price || a.netPrice || 0) ? b : a, rankingsArr[0])
      : null;
    const bestBuy = rankingsArr.length > 0
      ? rankingsArr.reduce((a, b) => (b.net_price || b.netPrice || 0) < (a.net_price || a.netPrice || 0) ? b : a, rankingsArr[0])
      : null;

    return (
      <>
        {/* Crop selector */}
        <div className="filters-bar" style={{ marginBottom: 24 }}>
          <span className="filter-label">Crop</span>
          <select
            className="form-control"
            value={bestMarketCrop}
            onChange={(e) => setBestMarketCrop(e.target.value)}
          >
            <option value="">Select a crop...</option>
            {crops.map((c) => (
              <option key={c.id || c.crop_id} value={c.id || c.crop_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {bestMarketLoading ? (
          <LoadingSpinner message="Finding best markets..." />
        ) : (
          <>
            {/* Best sell / best buy highlight cards */}
            {bestSell && bestBuy && rankingsArr.length > 1 && (
              <div className="grid-2" style={{ marginBottom: 24 }}>
                <div className="glass-card fade-in" style={{ padding: '20px 24px', borderTop: '3px solid #22c55e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <ArrowUpRight size={18} style={{ color: '#22c55e' }} />
                    <strong style={{ color: '#22c55e', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Best Sell Market
                    </strong>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {bestSell.market_name || bestSell.market || 'Market'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {bestSell.region_name || bestSell.region || ''}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>
                    {formatTZS(bestSell.net_price || bestSell.netPrice)} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>TZS net</span>
                  </div>
                </div>

                <div className="glass-card fade-in" style={{ padding: '20px 24px', borderTop: '3px solid #ef4444' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <ArrowDownRight size={18} style={{ color: '#ef4444' }} />
                    <strong style={{ color: '#ef4444', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Best Buy Market
                    </strong>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {bestBuy.market_name || bestBuy.market || 'Market'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {bestBuy.region_name || bestBuy.region || ''}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>
                    {formatTZS(bestBuy.net_price || bestBuy.netPrice)} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>TZS net</span>
                  </div>
                </div>
              </div>
            )}

            {/* Rankings table */}
            <PageCard title="Market Rankings" icon={<BarChart3 size={18} />}>
              {rankingsArr.length > 0 ? (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Market</th>
                        <th>Region</th>
                        <th>Gross Price (TZS)</th>
                        <th>Transport Cost (TZS)</th>
                        <th>Net Price (TZS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingsArr.map((row, i) => {
                        const netPrice = row.net_price || row.netPrice || 0;
                        const grossPrice = row.gross_price || row.grossPrice || row.price || 0;
                        const transport = row.transport_cost || row.transportCost || 0;
                        const isBestSell = bestSell && (row.market_name || row.market) === (bestSell.market_name || bestSell.market);
                        const isBestBuy = bestBuy && (row.market_name || row.market) === (bestBuy.market_name || bestBuy.market);

                        return (
                          <tr
                            key={row.id || row.market_name || row.market || i}
                            style={isBestSell ? { background: 'rgba(34,197,94,0.06)' } : isBestBuy ? { background: 'rgba(239,68,68,0.04)' } : {}}
                          >
                            <td>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: i === 0 ? 'rgba(34,197,94,0.15)' : 'var(--bg-surface)',
                                color: i === 0 ? '#22c55e' : 'var(--text-muted)',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                              }}>
                                {i + 1}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: 'var(--text-primary)' }}>
                                {row.market_name || row.market || 'Market'}
                              </strong>
                            </td>
                            <td>
                              <span className="badge badge-neutral">
                                {row.region_name || row.region || '--'}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>
                              {formatTZS(grossPrice)}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                              -{formatTZS(transport)}
                            </td>
                            <td>
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: netPrice >= grossPrice * 0.85 ? '#22c55e' : netPrice >= grossPrice * 0.7 ? '#f59e0b' : '#ef4444',
                              }}>
                                {formatTZS(netPrice)}
                              </span>
                              {isBestSell && (
                                <span className="badge badge-success" style={{ marginLeft: 8, fontSize: '0.65rem' }}>BEST SELL</span>
                              )}
                              {isBestBuy && (
                                <span className="badge badge-danger" style={{ marginLeft: 8, fontSize: '0.65rem' }}>BEST BUY</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📊</div>
                  <p>No market ranking data available for this crop.</p>
                </div>
              )}
            </PageCard>
          </>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  FARM PROFILE (real data)                                        */
  /* ============================================================== */

  function renderFarmProfile() {
    const accentColor = CHART_COLORS[0];
    const farmName = user?.first_name ? `${user.first_name}'s Shamba` : 'My Shamba';
    const region = user?.region || 'Region not set';
    const size = farmSize;
    const cropCount = farmerMainCrops.length;
    const activeMarkets = preferredMarkets.length || allMarkets.length || 0;

    // Build season crops from farmer's registered main_crops with real price data
    const seasonCrops = farmerMainCrops.map((cropName, i) => {
      const prices = cropPrices[cropName] || [];
      const latestPrice = prices.length > 0 ? prices[0] : null;
      return {
        name: cropName,
        status: latestPrice ? 'Active Season' : 'Registered',
        statusColor: latestPrice ? '#22c55e' : '#6b7280',
        latestPrice: latestPrice?.price || null,
        lastUpdated: latestPrice?.price_date || null,
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });

    return (
      <>
        {/* Farm Header Card */}
        <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px', borderLeft: '4px solid ' + accentColor }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ padding: 14, borderRadius: 14, background: 'rgba(0,212,170,0.12)' }}>
                <Sprout size={32} style={{ color: accentColor }} />
              </div>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.3rem', color: 'var(--text-primary)' }}>{farmName}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <MapPin size={14} style={{ color: accentColor }} />
                  <span>{region}{user?.district ? `, ${user.district}` : ''}</span>
                  {size > 0 && (
                    <>
                      <span style={{ margin: '0 4px', color: 'var(--text-faint)' }}>|</span>
                      <span>{size} acres</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '6px 14px' }}>
              <CheckCircle size={12} /> Registered Farm
            </span>
          </div>

          {/* Farm Size Progress */}
          {size > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Farm Size: {size} acres</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'rgba(0,212,170,0.1)', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, ' + accentColor + ', #4ade80)', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Stat Cards — computed from real data */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard
            label="Crops Grown"
            value={cropCount}
            icon={<Sprout size={20} />}
            color="#00d4aa"
          />
          <StatCard
            label="Farm Size"
            value={size > 0 ? `${size} acres` : 'N/A'}
            icon={<Wheat size={20} />}
            color="#22c55e"
          />
          <StatCard
            label="Revenue Estimate"
            value={revenueEstimate > 0 ? `TZS ${formatTZS(revenueEstimate)}` : 'N/A'}
            icon={<DollarSign size={20} />}
            color="#3b82f6"
          />
          <StatCard
            label="Active Markets"
            value={activeMarkets}
            icon={<MapPin size={20} />}
            color="#f59e0b"
          />
        </div>

        {/* Current Season Crops — based on farmer's real main_crops */}
        <PageCard title="Current Season Crops" icon={<Sprout size={18} />}>
          {seasonCrops.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 8 }}>
              {seasonCrops.map((crop, i) => (
                <div key={i} className="glass-card fade-in" style={{ padding: '18px 20px', borderLeft: '3px solid ' + crop.statusColor }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Wheat size={16} style={{ color: crop.color }} />
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{crop.name}</strong>
                    </div>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: crop.statusColor + '18',
                      color: crop.statusColor,
                      border: '1px solid ' + crop.statusColor + '30',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {crop.status}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Latest Price</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {crop.latestPrice != null ? `${formatTZS(crop.latestPrice)} TZS` : 'No data'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Last Updated</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {crop.lastUpdated ? formatDate(crop.lastUpdated) : '--'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🌱</div>
              <p>No crops registered. Update your profile to add your main crops.</p>
            </div>
          )}
        </PageCard>

        {/* Registered crops badges (from user profile) */}
        {farmerMainCrops.length > 0 && (
          <div className="glass-card fade-in" style={{ marginTop: 16, marginBottom: 24, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Your Registered Crops</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {farmerMainCrops.map((crop, i) => (
                <span key={i} className="badge badge-success" style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  <Wheat size={12} /> {crop}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Farm Details Summary */}
        <PageCard title="Farm Details" icon={<BarChart3 size={18} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            <div className="glass-card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Region</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{region}</div>
            </div>
            <div className="glass-card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Farm Size</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{size > 0 ? `${size} acres` : 'Not set'}</div>
            </div>
            <div className="glass-card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Preferred Markets</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{preferredMarkets.length > 0 ? preferredMarkets.join(', ') : 'Not set'}</div>
            </div>
            <div className="glass-card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Mobile Money</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.mobile_money_provider || 'Not set'}</div>
            </div>
            <div className="glass-card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cooperative</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.cooperative_name || 'Not registered'}</div>
            </div>
          </div>
        </PageCard>
      </>
    );
  }

  /* ============================================================== */
  /*  SELL TIMING ADVISOR                                             */
  /* ============================================================== */

  function renderSellTiming() {
    const signal = timingData?.signal || timingData?.recommendation || 'hold';
    const signalColor = SIGNAL_COLORS[signal] || SIGNAL_COLORS.hold;
    const signalLabel = SIGNAL_LABELS[signal] || 'HOLD';
    const score = timingData?.score ?? timingData?.sell_score ?? 0;
    const message = timingData?.message || timingData?.advice || '';

    const vs7d = timingData?.vs_7d_ma ?? timingData?.vs_7day_ma ?? timingData?.comparison_7d ?? null;
    const vs30d = timingData?.vs_30d_ma ?? timingData?.vs_30day_ma ?? timingData?.comparison_30d ?? null;
    const vsSeasonal = timingData?.vs_seasonal ?? timingData?.vs_seasonal_baseline ?? timingData?.seasonal_comparison ?? null;

    return (
      <>
        {/* Crop selector */}
        <div className="filters-bar" style={{ marginBottom: 24 }}>
          <span className="filter-label">Crop</span>
          <select
            className="form-control"
            value={timingCrop}
            onChange={(e) => setTimingCrop(e.target.value)}
          >
            <option value="">Select a crop...</option>
            {crops.map((c) => (
              <option key={c.id || c.crop_id} value={c.id || c.crop_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {timingLoading ? (
          <LoadingSpinner message="Analyzing sell timing..." />
        ) : (
          <>
            {/* Signal + Gauge row */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
              {/* Large signal display */}
              <div className="glass-card fade-in" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Market Signal
                </div>
                <div
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    color: signalColor,
                    letterSpacing: '0.04em',
                    textShadow: `0 0 30px ${signalColor}40`,
                    textAlign: 'center',
                  }}
                >
                  {signalLabel}
                </div>
                {message && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 360, margin: 0, lineHeight: 1.5 }}>
                    {message}
                  </p>
                )}
              </div>

              {/* Score gauge */}
              <div className="glass-card fade-in" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Sell Score
                </div>
                <ScoreGauge score={score} size={200} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {score < 35 ? 'Prices are unfavorable — consider waiting.' : score < 65 ? 'Prices are moderate — monitor closely.' : 'Prices are favorable — good time to sell.'}
                </div>
              </div>
            </div>

            {/* Comparison chips */}
            {(vs7d != null || vs30d != null || vsSeasonal != null) && (
              <PageCard title="Price Comparison" icon={<Activity size={18} />}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {vs7d != null && <ComparisonChip label="vs 7-day MA" value={vs7d} />}
                  {vs30d != null && <ComparisonChip label="vs 30-day MA" value={vs30d} />}
                  {vsSeasonal != null && <ComparisonChip label="vs Seasonal Baseline" value={vsSeasonal} />}
                </div>
              </PageCard>
            )}

            {/* How to Read Market Signals — explanation card */}
            <div className="glass-card fade-in" style={{ marginTop: 24, padding: '20px 24px', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <AlertTriangle size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>How to Read Market Signals</h3>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                The market signal tells you whether now is a good time to sell your crop based on current prices compared to recent trends and historical averages.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.85rem' }}>SELL NOW</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Prices are above the 30-day average and trending up. This is a strong signal to sell your harvest now while prices are favorable. Don't wait — prices may drop.
                  </p>
                </div>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
                    <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.85rem' }}>HOLD</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Prices are moderate — not great, not terrible. You can sell if you need cash now, but consider storing your crop and checking again in a few days for better prices.
                  </p>
                </div>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem' }}>WAIT</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Prices are below average and trending down. Avoid selling now if possible. Store your harvest safely and wait for prices to recover. Check the 7-day forecast for signs of improvement.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <TrendingUp size={14} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Sell Score (0–100):</strong> This combines the current price vs 7-day average, 30-day average, and seasonal baseline.
                    A score above 65 means favorable conditions. Below 35 means unfavorable. Use it alongside the signal for the best decision.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  COOPERATIVE (conditional + form)                                */
  /* ============================================================== */

  function renderCooperative() {
    const accentColor = CHART_COLORS[0];
    const hasCooperative = myCoops.length > 0 || !!user?.cooperative_name;

    const sharedResources = [
      { name: 'Maize Sheller (Diesel)', status: 'Available', nextAvailable: 'Now', cost: 'TZS 15,000/day', icon: <Package size={16} /> },
      { name: '10-Ton Lorry (Fuso)', status: 'In Use', nextAvailable: '25 Mar 2026', cost: 'TZS 180,000/trip', icon: <Truck size={16} /> },
      { name: 'Moisture Meter (Digital)', status: 'Available', nextAvailable: 'Now', cost: 'Free for members', icon: <Gauge size={16} /> },
      { name: 'Grading Sieves (Set of 4)', status: 'Available', nextAvailable: 'Now', cost: 'TZS 5,000/day', icon: <Target size={16} /> },
    ];

    /* Build a set of joined coop ids so we can filter them out of nearby list */
    const myCoopIds = new Set(myCoops.map((c) => c.id || c._id || c.coop_id));

    /* Nearby coops that the user has NOT already joined */
    const availableNearby = nearbyCoops.filter((c) => !myCoopIds.has(c.id || c._id || c.coop_id));

    if (coopLoading) return <LoadingSpinner message="Loading cooperatives..." />;

    return (
      <>
        {/* Error banner */}
        {coopError && (
          <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} style={{ color: '#ef4444' }} />
              <div>
                <strong style={{ color: '#ef4444', fontSize: '0.9rem' }}>Error</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{coopError}</p>
              </div>
            </div>
          </div>
        )}

        {/* ---- My Cooperatives ---- */}
        {myCoops.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 12 }}>
              <Sprout size={16} style={{ marginRight: 6, color: accentColor }} />
              Your Cooperatives
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {myCoops.map((coop, i) => (
                <div key={coop.id || coop._id || coop.coop_id || i} className="glass-card fade-in" style={{ padding: '18px 20px', borderLeft: '3px solid ' + accentColor }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: accentColor + '20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: accentColor,
                      }}>
                        {(coop.name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{coop.name}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          <MapPin size={10} /> {coop.region || coop.location || user?.region || 'Region not set'}
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                      <CheckCircle size={10} /> Joined
                    </span>
                  </div>
                  {coop.description && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                      {coop.description}
                    </p>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Members</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{coop.member_count ?? coop.members ?? '--'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Crops</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{coop.crops || farmerMainCrops.join(', ') || '--'}</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 10, fontSize: '0.75rem', width: '100%', borderColor: '#ef444460', color: '#ef4444' }}
                    onClick={() => handleLeaveCoop(coop.id || coop._id || coop.coop_id)}
                  >
                    <XCircle size={12} /> Leave Cooperative
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ---- No cooperative — prompt user ---- */
          <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>No Cooperative Joined</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  You haven't joined a cooperative yet. Cooperatives help you get better prices through collective bargaining and shared resources.
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
              Browse nearby cooperatives below to join one, or create a new one.
            </p>
          </div>
        )}

        {/* Stat Cards */}
        {hasCooperative && (
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <StatCard
              label="Your Cooperatives"
              value={myCoops.length || (user?.cooperative_name ? 1 : 0)}
              icon={<Sprout size={20} />}
              color="#00d4aa"
            />
            <StatCard
              label="Your Region"
              value={user?.region || 'N/A'}
              icon={<MapPin size={20} />}
              color="#3b82f6"
            />
            <StatCard
              label="Nearby Available"
              value={availableNearby.length}
              icon={<Wheat size={20} />}
              color="#22c55e"
            />
          </div>
        )}

        {/* Nearby Cooperatives (from API) */}
        <PageCard title="Nearby Cooperatives" icon={<Sprout size={18} />}>
          {availableNearby.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 8 }}>
              {availableNearby.map((coop, i) => (
                <div key={coop.id || coop._id || coop.coop_id || i} className="glass-card fade-in" style={{ padding: '18px 20px', borderLeft: '3px solid ' + CHART_COLORS[i % CHART_COLORS.length] }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: CHART_COLORS[i % CHART_COLORS.length] + '20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: CHART_COLORS[i % CHART_COLORS.length],
                      }}>
                        {(coop.name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{coop.name}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          <MapPin size={10} /> {coop.region || coop.location || 'Region not set'}
                        </div>
                      </div>
                    </div>
                  </div>
                  {coop.description && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
                      {coop.description}
                    </p>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Members</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{coop.member_count ?? coop.members ?? '--'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Crops</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{coop.crops || '--'}</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 10, fontSize: '0.75rem', width: '100%' }}
                    onClick={() => handleJoinCoop(coop.id || coop._id || coop.coop_id)}
                  >
                    <CheckCircle size={12} /> Join Cooperative
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>
                {coopLoading ? 'Loading cooperatives...' : 'No nearby cooperatives found in your region.'}
              </p>
            </div>
          )}
        </PageCard>

        {/* Create a New Cooperative Form */}
        <div style={{ marginTop: 24 }}>
          <PageCard title="Create a New Cooperative" icon={<Sprout size={18} />}>
            <form onSubmit={handleCreateCooperative}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    Cooperative Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={coopCreateForm.name}
                    onChange={(e) => setCoopCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Enter cooperative name..."
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    Region
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={coopCreateForm.region}
                    onChange={(e) => setCoopCreateForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder={user?.region || 'Enter region...'}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Description
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={coopCreateForm.description}
                  onChange={(e) => setCoopCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the cooperative..."
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={coopJoinLoading || !coopCreateForm.name.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {coopJoinLoading ? 'Creating...' : 'Create Cooperative'}
                <ArrowUpRight size={14} />
              </button>
            </form>
          </PageCard>
        </div>

        {/* Join / Register Cooperative Form (legacy) */}
        <div style={{ marginTop: 24 }}>
          <PageCard title={hasCooperative ? 'Quick Join by Name' : 'Quick Join / Register'} icon={<CheckCircle size={18} />}>
            <form onSubmit={handleJoinCooperative}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 250 }}>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                    Cooperative Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={coopNameInput}
                    onChange={(e) => setCoopNameInput(e.target.value)}
                    placeholder="Enter cooperative name to join or register..."
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={coopJoinLoading || !coopNameInput.trim()}
                  style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {coopJoinLoading ? 'Submitting...' : 'Join / Register'}
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                Enter the name of an existing cooperative to join, or a new name to register one.
              </p>
            </form>
          </PageCard>
        </div>

        {/* Shared Resources (demo — same for all cooperatives) */}
        <div style={{ marginTop: 24 }}>
          <PageCard title="Shared Resources (Demo)" icon={<Package size={18} />}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Status</th>
                    <th>Next Available</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedResources.map((res, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{res.icon}</span>
                          <strong>{res.name}</strong>
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: res.status === 'Available' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                          color: res.status === 'Available' ? '#22c55e' : '#f59e0b',
                          border: '1px solid ' + (res.status === 'Available' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'),
                        }}>
                          {res.status === 'Available' ? <CheckCircle size={10} style={{ marginRight: 4 }} /> : <Clock size={10} style={{ marginRight: 4 }} />}
                          {res.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {res.nextAvailable}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {res.cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.08)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: accentColor }}>Cooperative Benefit:</strong> Members receive a 12% price premium on average through collective bargaining and bulk selling. Shared equipment reduces individual costs by up to 40%.
            </div>
          </PageCard>
        </div>
      </>
    );
  }

  /* ============================================================== */
  /*  ANALYTICS (Price Trends)                                        */
  /* ============================================================== */

  function renderAnalytics() {
    const rawPred = forecastData?.predictions || forecastData?.forecast || {};
    const predictions = Array.isArray(rawPred)
      ? rawPred
      : typeof rawPred === 'object' && rawPred !== null
        ? Object.entries(rawPred).map(([key, value]) => ({
            date: key.replace(/_/g, ' '),
            price: Number(value),
          }))
        : [];
    const trend = forecastData?.trend || forecastData?.direction || 'stable';
    const currentPrice = forecastData?.current_price ?? forecastData?.price ?? null;

    const chartData = predictions.map((p, i) => ({
      date: p.date || p.day || `Day ${i + 1}`,
      price: Number(p.price || p.value || 0),
      ...(p.lower != null ? { lower: Number(p.lower) } : {}),
      ...(p.upper != null ? { upper: Number(p.upper) } : {}),
    }));

    return (
      <>
        {/* Crop selector */}
        <div className="filters-bar" style={{ marginBottom: 24 }}>
          <span className="filter-label">Crop</span>
          <select
            className="form-control"
            value={analyticsCrop}
            onChange={(e) => setAnalyticsCrop(e.target.value)}
          >
            <option value="">Select a crop...</option>
            {crops.map((c) => (
              <option key={c.id || c.crop_id} value={c.id || c.crop_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {forecastLoading ? (
          <LoadingSpinner message="Loading price analytics..." />
        ) : (
          <>
            {/* Stats row */}
            <div className="grid-3" style={{ marginBottom: 24 }}>
              <StatCard
                label="Current Price"
                value={currentPrice != null ? `${formatTZS(currentPrice)} TZS` : '--'}
                icon={<DollarSign size={20} />}
                color="#00d4aa"
              />
              <StatCard
                label="Trend"
                value={trend.charAt(0).toUpperCase() + trend.slice(1)}
                icon={trend === 'up' || trend === 'increasing' ? <TrendingUp size={20} /> : trend === 'down' || trend === 'decreasing' ? <TrendingDown size={20} /> : <Minus size={20} />}
                color={trend === 'up' || trend === 'increasing' ? '#22c55e' : trend === 'down' || trend === 'decreasing' ? '#ef4444' : '#f59e0b'}
              />
              <StatCard
                label="Forecast Points"
                value={predictions.length}
                icon={<Activity size={20} />}
                color="#3b82f6"
              />
            </div>

            {/* Price history chart */}
            {farmerLineData.length > 0 && farmerMainCrops.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <PageCard title="Historical Price Trends" icon={<TrendingUp size={18} />}>
                  <div className="chart-container" style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={farmerLineData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4a6b52' }} angle={-30} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#e8f5e9' }} />
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
              </div>
            )}

            {/* Forecast chart */}
            {chartData.length > 0 && (
              <PageCard title="Price Forecast" icon={<TrendingUp size={18} />}>
                <div className="chart-container" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4a6b52' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#e8f5e9' }} />
                      {chartData[0]?.upper != null && (
                        <Area
                          type="monotone"
                          dataKey="upper"
                          stroke="none"
                          fill="rgba(0,212,170,0.08)"
                          connectNulls
                        />
                      )}
                      {chartData[0]?.lower != null && (
                        <Area
                          type="monotone"
                          dataKey="lower"
                          stroke="none"
                          fill="var(--bg-primary)"
                          connectNulls
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#00d4aa"
                        fill="url(#forecastGrad)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#00d4aa' }}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PageCard>
            )}

            {/* Empty state */}
            {chartData.length === 0 && farmerLineData.length === 0 && (
              <PageCard title="Price Forecast" icon={<TrendingUp size={18} />}>
                <div className="empty-state">
                  <div className="empty-icon">📈</div>
                  <p>No forecast data available for this crop.</p>
                </div>
              </PageCard>
            )}
          </>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  TRANSPORT COST CALCULATOR (Advanced)                            */
  /* ============================================================== */

  function renderTransport() {
    const results = transportResult?.results || {};
    const routePath = transportResult?.route || [];
    const corridors = transportResult?.corridors || [];
    const distance = transportResult?.distance_km || 0;
    const roadCondition = transportResult?.road_condition || '';
    const trafficFactor = transportResult?.traffic_factor || 1;
    const weightScale = transportResult?.weight_scale || 1;
    const selectedMode = transportVehicle;
    const selected = results[selectedMode] || {};

    const MODE_COLORS = { truck: '#3b82f6', bus: '#22c55e', motorcycle: '#f59e0b', pickup: '#8b5cf6' };
    const MODE_ICONS = {
      truck: <Truck size={18} />,
      bus: <Package size={18} />,
      motorcycle: <Route size={18} />,
      pickup: <Navigation size={18} />,
    };

    return (
      <>
        {/* Page header */}
        <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px', borderLeft: '4px solid #00d4aa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(0,212,170,0.12)' }}>
              <Truck size={28} style={{ color: '#00d4aa' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Transport Cost Calculator</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Compare all transport modes with smart pricing across Tanzania's road network
              </p>
            </div>
          </div>
        </div>

        {/* Input form */}
        <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px' }}>
          <form onSubmit={handleTransportCalc}>
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} style={{ color: '#22c55e' }} /> Origin Region
                </label>
                <select className="form-control" value={transportOrigin} onChange={(e) => setTransportOrigin(e.target.value)} required>
                  <option value="">Select origin region...</option>
                  {allRegions.map((r, i) => (
                    <option key={r.id || r.region_id || i} value={r.name || r.region_name || r.id}>
                      {r.name || r.region_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Navigation size={14} style={{ color: '#ef4444' }} /> Destination Region
                </label>
                <select className="form-control" value={transportDest} onChange={(e) => setTransportDest(e.target.value)} required>
                  <option value="">Select destination region...</option>
                  {allRegions.map((r, i) => (
                    <option key={r.id || r.region_id || i} value={r.name || r.region_name || r.id}>
                      {r.name || r.region_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={14} style={{ color: '#f59e0b' }} /> Cargo Weight (kg)
                </label>
                <input type="number" className="form-control" value={transportWeight}
                  onChange={(e) => setTransportWeight(e.target.value === '' ? '' : Number(e.target.value))} step="100" />
              </div>
              <div />
            </div>

            {/* Vehicle highlight selector */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={14} style={{ color: '#3b82f6' }} /> Highlight Vehicle
              </label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,212,170,0.2)' }}>
                {[
                  { value: 'truck', label: 'Truck', icon: <Truck size={16} /> },
                  { value: 'bus', label: 'Bus', icon: <Package size={16} /> },
                  { value: 'pickup', label: 'Pickup', icon: <Navigation size={16} /> },
                  { value: 'motorcycle', label: 'Motorcycle', icon: <Route size={16} /> },
                ].map((v, i, arr) => (
                  <button key={v.value} type="button" onClick={() => setTransportVehicle(v.value)}
                    style={{
                      flex: 1, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      border: 'none', borderRight: i < arr.length - 1 ? '1px solid rgba(0,212,170,0.15)' : 'none',
                      background: transportVehicle === v.value ? 'rgba(0,212,170,0.15)' : 'transparent',
                      color: transportVehicle === v.value ? '#00d4aa' : 'var(--text-muted)',
                      fontWeight: transportVehicle === v.value ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s ease',
                    }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={transportLoading || !transportOrigin || !transportDest}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {transportLoading ? 'Calculating...' : 'Calculate Route'} <Route size={16} />
            </button>
          </form>
        </div>

        {/* Error */}
        {transportError && (
          <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={20} style={{ color: '#ef4444' }} />
              <div>
                <strong style={{ color: '#ef4444', fontSize: '0.9rem' }}>Error</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{transportError}</p>
              </div>
            </div>
          </div>
        )}

        {transportLoading && <LoadingSpinner message="Calculating transport route and costs..." />}

        {/* ────── RESULTS ────── */}
        {transportResult && !transportLoading && (
          <>
            {/* Route path with road condition badge */}
            {routePath.length > 0 && (
              <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <Route size={18} style={{ color: '#00d4aa' }} />
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Route Path</h3>
                  {roadCondition && (
                    <span style={{
                      marginLeft: 'auto', padding: '4px 14px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                      background: roadCondition === 'good' ? 'rgba(34,197,94,0.15)' : roadCondition === 'average' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: roadCondition === 'good' ? '#22c55e' : roadCondition === 'average' ? '#f59e0b' : '#ef4444',
                      border: `1px solid ${roadCondition === 'good' ? 'rgba(34,197,94,0.3)' : roadCondition === 'average' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}>
                      Road: {roadCondition.charAt(0).toUpperCase() + roadCondition.slice(1)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '16px 0' }}>
                  {routePath.map((region, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        padding: '6px 14px', borderRadius: 20,
                        background: i === 0 ? 'rgba(34,197,94,0.15)' : i === routePath.length - 1 ? 'rgba(239,68,68,0.15)' : 'rgba(0,212,170,0.08)',
                        border: `1px solid ${i === 0 ? 'rgba(34,197,94,0.3)' : i === routePath.length - 1 ? 'rgba(239,68,68,0.3)' : 'rgba(0,212,170,0.15)'}`,
                        color: i === 0 ? '#22c55e' : i === routePath.length - 1 ? '#ef4444' : 'var(--text-primary)',
                        fontSize: '0.82rem', fontWeight: i === 0 || i === routePath.length - 1 ? 700 : 500,
                      }}>
                        {i === 0 && <MapPin size={12} style={{ marginRight: 4 }} />}
                        {region}
                        {i === routePath.length - 1 && <Navigation size={12} style={{ marginLeft: 4 }} />}
                      </span>
                      {i < routePath.length - 1 && <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stats row — highlighted vehicle */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
              <StatCard label="Distance" value={distance ? `${distance} km` : '--'} icon={<Navigation size={20} />} color="#3b82f6" />
              <StatCard label={`Est. Time (${selected.display || selectedMode})`} value={selected.time || '--'} icon={<Clock size={20} />} color="#f59e0b" />
              <StatCard label={`Cost (${selected.display || selectedMode})`} value={selected.cost ? `${formatTZS(selected.cost)} TZS` : '--'} icon={<DollarSign size={20} />} color="#22c55e" />
              <StatCard label="Cost/kg" value={selected.cost && transportWeight ? `${formatTZS(Math.round(selected.cost / transportWeight))} TZS` : '--'} icon={<Package size={20} />} color="#06b6d4" />
            </div>

            {/* Route Map Visualization */}
            {transportOrigin && transportDest && (
              <div className="glass-card fade-in" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={16} style={{ color: '#00d4aa' }} />
                    <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Route Map</h3>
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {transportOrigin} → {transportDest}
                    </span>
                  </div>
                </div>
                <TanzaniaTransportMap
                  origin={transportOrigin}
                  destination={transportDest}
                  route={routePath}
                  distance_km={distance}
                  results={results}
                  selectedMode={selectedMode}
                  height="380px"
                />
              </div>
            )}

            {/* ══════ MULTI-MODE COMPARISON TABLE ══════ */}
            <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px', borderLeft: '4px solid #00d4aa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <BarChart3 size={18} style={{ color: '#00d4aa' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Transport Mode Comparison</h3>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {transportOrigin} → {transportDest} | {transportWeight} kg
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                  <thead>
                    <tr style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mode</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Est. Time</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Cost (TZS)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cost/kg</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', width: 110 }}>Best For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(results).map(([mode, data]) => {
                      const isSelected = mode === selectedMode;
                      const cpk = transportWeight ? Math.round(data.cost / transportWeight) : 0;
                      return (
                        <tr key={mode} style={{ background: isSelected ? 'rgba(0,212,170,0.08)' : 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '12px', borderRadius: '8px 0 0 8px', borderLeft: isSelected ? '3px solid #00d4aa' : '3px solid transparent' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ padding: 6, borderRadius: 8, background: `${MODE_COLORS[mode]}18`, color: MODE_COLORS[mode] }}>
                                {MODE_ICONS[mode]}
                              </span>
                              <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: '0.88rem', color: isSelected ? '#00d4aa' : 'var(--text-primary)' }}>
                                {data.display}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            <Clock size={14} style={{ marginRight: 4, color: 'var(--text-muted)', verticalAlign: 'middle' }} />
                            {data.time}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: isSelected ? '#00d4aa' : 'var(--text-primary)' }}>
                            {formatTZS(data.cost)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {formatTZS(cpk)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', borderRadius: '0 8px 8px 0' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                              background: `${MODE_COLORS[mode]}18`, color: MODE_COLORS[mode],
                            }}>
                              {mode === 'truck' ? 'Bulk cargo' : mode === 'bus' ? 'Fast & cheap' : mode === 'motorcycle' ? 'Small loads' : 'Versatile'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pricing factors */}
            <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <DollarSign size={18} style={{ color: '#00d4aa' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Pricing Factors Applied</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: corridors.length > 0 ? 16 : 0 }}>
                <div className="glass-card" style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Road Condition</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: roadCondition === 'good' ? '#22c55e' : roadCondition === 'average' ? '#f59e0b' : '#ef4444' }}>
                    {roadCondition ? roadCondition.charAt(0).toUpperCase() + roadCondition.slice(1) : '--'}
                  </div>
                </div>
                <div className="glass-card" style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Traffic Factor</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>
                    {trafficFactor ? `${(trafficFactor * 100).toFixed(0)}%` : '--'}
                  </div>
                </div>
                <div className="glass-card" style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Weight Scale</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#8b5cf6' }}>
                    {weightScale ? `${weightScale}x` : '--'}
                  </div>
                </div>
                <div className="glass-card" style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cargo Weight</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>
                    {transportWeight ? `${Number(transportWeight).toLocaleString()} kg` : '--'}
                  </div>
                </div>
              </div>
              {corridors.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Corridors Used</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {corridors.map((c, i) => (
                      <span key={i} className="badge badge-neutral" style={{ fontSize: '0.78rem', padding: '6px 14px' }}>
                        <Route size={12} style={{ marginRight: 4 }} /> {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick text summary (matches spec example) */}
            <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '20px 24px', background: 'rgba(0,212,170,0.04)', borderLeft: '4px solid #00d4aa' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
                <div><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>FROM:</span> {transportOrigin} | <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>TO:</span> {transportDest} | <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>WEIGHT:</span> {transportWeight}kg</div>
                <div><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Distance:</span> {distance} km</div>
                {Object.entries(results).map(([mode, data]) => (
                  <div key={mode}>
                    <span style={{ color: MODE_COLORS[mode], fontWeight: 700, minWidth: 110, display: 'inline-block' }}>{data.display}</span>
                    {' → '}{data.time} | TZS <span style={{ fontWeight: 700 }}>{data.cost.toLocaleString()}</span>
                  </div>
                ))}
                {routePath.length > 1 && (
                  <div><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Route:</span> {routePath.map(r => r.split(' ')[0]).join(' → ')}</div>
                )}
              </div>
            </div>
          </>
        )}
      </>
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Small presentational sub-components                                */
/* ------------------------------------------------------------------ */

function ComparisonChip({ label, value }) {
  const num = Number(value);
  const isPositive = num > 0;
  const isNegative = num < 0;
  const color = isPositive ? '#22c55e' : isNegative ? '#ef4444' : 'var(--text-muted)';
  const bg = isPositive ? 'rgba(34,197,94,0.1)' : isNegative ? 'rgba(239,68,68,0.1)' : 'var(--bg-glass-light)';
  const icon = isPositive ? <ArrowUpRight size={14} /> : isNegative ? <ArrowDownRight size={14} /> : <Minus size={14} />;

  return (
    <div
      className="glass-card"
      style={{
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: bg,
        minWidth: 180,
      }}
    >
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
          {isPositive ? '+' : ''}{num.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function ResultTile({ label, value, unit, icon, color, highlight = false }) {
  return (
    <div
      className="glass-card fade-in"
      style={{
        padding: '18px 20px',
        borderTop: highlight ? `3px solid ${color}` : `2px solid ${color}30`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: highlight ? '1.6rem' : '1.3rem',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: highlight ? color : 'var(--text-primary)',
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab label helper                                                   */
/* ------------------------------------------------------------------ */

function tabLabel(tab) {
  const labels = {
    'best-market': 'Find the best market to sell your crops at the highest net price.',
    'farm': 'Manage your farm profile, crops, and land details.',
    'timing': 'Get data-driven advice on when to sell your crops for maximum profit.',
    'cooperative': 'Connect with cooperatives and fellow farmers in your region.',
    'analytics': 'Analyze price trends and forecasts for your crops.',
    'transport': 'Calculate transport costs between markets to maximize your net revenue.',
  };
  return labels[tab] || 'Farmer Dashboard';
}

/* end of file */
