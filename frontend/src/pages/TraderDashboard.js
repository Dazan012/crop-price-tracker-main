import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { traderAPI, forecastAPI, dashboardAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import WeatherWidget from '../components/WeatherWidget';
import { useAuth } from '../services/AuthContext';
import { StatCard, LoadingSpinner, PageCard } from '../components/Shared';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend, LineChart, Line,
  AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, BarChart3, MapPin, Wheat, Database,
  AlertTriangle, ArrowUpRight, ArrowRight, ShoppingCart, Target,
  Calendar, CheckCircle, LineChart as LineChartIcon, Package,
  Zap, ArrowUpCircle, ArrowDownCircle, MinusCircle, Eye,
  Radar, Route, GitBranch, Download, Save, X, CloudSun,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ['#00d4aa', '#3b82f6', '#f59e0b', '#a78bfa', '#ec4899', '#06b6d4', '#84cc16'];

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(10,26,16,0.95)',
  border: '1px solid rgba(0,212,170,0.2)',
  borderRadius: 8,
  fontSize: '0.8rem',
};

const CLASSIFICATION_COLORS = {
  surplus: '#22c55e',
  deficit: '#ef4444',
  neutral: '#6b7280',
};

const ACTION_CONFIG = {
  sell_now: {
    icon: <TrendingDown size={28} />,
    color: '#ef4444',
    label: 'Sell Now',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
  },
  hold: {
    icon: <Target size={28} />,
    color: '#f59e0b',
    label: 'Hold',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
  },
  wait: {
    icon: <TrendingUp size={28} />,
    color: '#00d4aa',
    label: 'Wait for Better Prices',
    bg: 'rgba(0,212,170,0.12)',
    border: 'rgba(0,212,170,0.3)',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getMarginTier(netSpread) {
  if (netSpread >= 100) return 'high';
  if (netSpread >= 50) return 'medium';
  return 'low';
}

function formatTZS(val) {
  if (val == null) return '—';
  return `${Number(val).toLocaleString('en-TZ')} TZS`;
}

const MARGIN_ROW_STYLE = {
  high: { background: 'rgba(34,197,94,0.06)', borderLeft: '3px solid #22c55e' },
  medium: { background: 'rgba(245,158,11,0.06)', borderLeft: '3px solid #f59e0b' },
  low: { background: 'rgba(107,114,128,0.06)', borderLeft: '3px solid #6b7280' },
};

const TRADER_TABS = [
  { key: 'overview', label: 'Overview', to: '/trader/dashboard' },
  { key: 'spread', label: 'Spread', to: '/trader/spread' },
  { key: 'opportunities', label: 'Opportunities', to: '/trader/spread/opportunities' },
  { key: 'supply', label: 'Supply', to: '/trader/supply' },
  { key: 'forecast7', label: '7-Day Forecast', to: '/trader/forecast/7day' },
  { key: 'forecast30', label: '30-Day Forecast', to: '/trader/forecast/30day' },
  { key: 'tools', label: 'Tools', to: '/trader/tools' },
  { key: 'intelligence', label: 'Intelligence', to: '/trader/intelligence' },
];

function ClassificationBadge({ classification }) {
  const cls = (classification || 'neutral').toLowerCase();
  const color = CLASSIFICATION_COLORS[cls] || CLASSIFICATION_COLORS.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: `${color}18`,
        color,
        border: `1px solid ${color}30`,
        textTransform: 'capitalize',
      }}
    >
      {cls === 'surplus' ? <ArrowUpCircle size={12} /> : cls === 'deficit' ? <ArrowDownCircle size={12} /> : <MinusCircle size={12} />}
      {cls}
    </span>
  );
}

function getConfidenceLevel(val) {
  if (val == null) return 'low';
  if (val >= 0.7) return 'high';
  if (val >= 0.3) return 'medium';
  return 'low';
}

const CONFIDENCE_COLORS = { high: '#00d4aa', medium: '#f59e0b', low: '#ef4444' };

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TraderDashboard({ tab }) {
  const { user } = useAuth();
  const { crops, regions: allRegions } = useDataWithFallback();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [spreadData, setSpreadData] = useState([]);
  const [supplyData, setSupplyData] = useState([]);
  const [weatherRegion, setWeatherRegion] = useState(user?.region || '');

  /* ---- profit calculator state ---- */
  const [buyPrice, setBuyPrice] = useState(1200);
  const [sellPrice, setSellPrice] = useState(1450);
  const [quantity, setQuantity] = useState(500);

  /* ---- break-even analyzer state ---- */
  const [beBuyPrice, setBeBuyPrice] = useState(1200);
  const [beTransport, setBeTransport] = useState(85);
  const [beLoading, setBeLoading] = useState(30);
  const [bePackaging, setBePackaging] = useState(15);

  /* ---- saved scenarios ---- */
  const [savedScenarios, setSavedScenarios] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sc-scenarios') || '[]');
    } catch { return []; }
  });
  const [scenarioName, setScenarioName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [scenarioSaved, setScenarioSaved] = useState(false);

  const handleSaveScenario = () => {
    if (!showSaveInput) {
      setShowSaveInput(true);
      return;
    }
    const name = scenarioName.trim() || `Scenario ${savedScenarios.length + 1}`;
    const scenario = {
      name,
      buyPrice,
      sellPrice,
      quantity,
      cost: buyPrice * quantity,
      revenue: sellPrice * quantity,
      net: (sellPrice * quantity) - (buyPrice * quantity),
      margin: buyPrice * quantity > 0 ? (((sellPrice * quantity - buyPrice * quantity) / (buyPrice * quantity)) * 100).toFixed(1) : '0.0',
      savedAt: new Date().toLocaleString(),
    };
    const updated = [...savedScenarios, scenario];
    setSavedScenarios(updated);
    localStorage.setItem('sc-scenarios', JSON.stringify(updated));
    setScenarioName('');
    setShowSaveInput(false);
    setScenarioSaved(true);
    setTimeout(() => setScenarioSaved(false), 3000);
  };

  const handleDeleteScenario = (index) => {
    const updated = savedScenarios.filter((_, i) => i !== index);
    setSavedScenarios(updated);
    localStorage.setItem('sc-scenarios', JSON.stringify(updated));
  };

  const handleExportReport = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Buy Price (TZS/kg)', buyPrice],
      ['Sell Price (TZS/kg)', sellPrice],
      ['Quantity (kg)', quantity],
      ['Gross Revenue (TZS)', buyPrice * quantity],
      ['Cost of Goods (TZS)', sellPrice * quantity],
      ['Net Profit (TZS)', (sellPrice * quantity) - (buyPrice * quantity)],
      ['Margin (%)', buyPrice * quantity > 0 ? (((sellPrice * quantity - buyPrice * quantity) / (buyPrice * quantity)) * 100).toFixed(1) : '0.0'],
      [''],
      ['Break-Even Analysis', ''],
      ['Break-Even Buy Price (TZS/kg)', beBuyPrice],
      ['Transport Cost (TZS/kg)', beTransport],
      ['Loading & Handling (TZS/kg)', beLoading],
      ['Packaging (TZS/kg)', bePackaging],
      ['Total Cost per kg (TZS)', beBuyPrice + beTransport + beLoading + bePackaging],
      ['Min Profitable Sell (10% margin, TZS)', ((beBuyPrice + beTransport + beLoading + bePackaging) * 1.1).toFixed(0)],
    ];
    if (savedScenarios.length > 0) {
      rows.push([''], ['Saved Scenarios', '']);
      rows.push(['Name', 'Buy', 'Sell', 'Qty (kg)', 'Net Profit', 'Margin %']);
      savedScenarios.forEach((s) => {
        rows.push([s.name, s.buyPrice, s.sellPrice, s.quantity, s.net, s.margin]);
      });
    }
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trader-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---- unit converter state ---- */
  const [unitWeight, setUnitWeight] = useState(1000);

  /* ---- profit calculator computed values ---- */
  const profitCalc = useMemo(() => {
    const cost = buyPrice * quantity;
    const revenue = sellPrice * quantity;
    const net = revenue - cost;
    const margin = cost > 0 ? ((net / cost) * 100).toFixed(1) : '0.0';
    return { cost, revenue, net, margin };
  }, [buyPrice, sellPrice, quantity]);

  /* ---- break-even computed values ---- */
  const breakEven = useMemo(() => {
    const totalCost = beBuyPrice + beTransport + beLoading + bePackaging;
    const minProfitable = (totalCost * 1.1).toFixed(0);
    return { totalCost, minProfitable };
  }, [beBuyPrice, beTransport, beLoading, bePackaging]);

  /* ---- unit converter computed values ---- */
  const unitConversions = useMemo(() => {
    const w = unitWeight || 0;
    return [
      { unit: 'Gunia (Bags)', value: `${(w / 90).toFixed(1)} bags`, note: '90 kg/bag (maize)' },
      { unit: 'Tonnes', value: `${(w / 1000).toFixed(2)} t`, note: '1,000 kg' },
      { unit: 'Pishi (Tins)', value: `${(w / 2).toFixed(0)} tins`, note: '2 kg/tin' },
      { unit: 'Dagger (Debe)', value: `${(w / 20).toFixed(0)} debe`, note: '20 kg/debe' },
    ];
  }, [unitWeight]);

  /* ---- forecast state ---- */
  const [selectedCrop, setSelectedCrop] = useState('');
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  /* ---- initial data load ---- */
  useEffect(() => {
    const tasks = [
      dashboardAPI.stats(),
      traderAPI.spreadAnalysis(),
      traderAPI.supplyTracker(),
    ];

    Promise.all(tasks)
      .then((results) => {
        setStats(results[0].data);
        setSpreadData(results[1].data?.spreads || results[1].data || []);
        setSupplyData(results[2].data?.regions || results[2].data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  /* ---- forecast fetch on crop change ---- */
  useEffect(() => {
    if (!selectedCrop) {
      setForecast(null);
      return;
    }
    setForecastLoading(true);
    forecastAPI
      .crop(selectedCrop)
      .then((res) => setForecast(res.data))
      .catch(console.error)
      .finally(() => setForecastLoading(false));
  }, [selectedCrop]);

  if (loading) return <LoadingSpinner message="Loading trader dashboard..." />;

  /* ---- derived data ---- */
  const topSpreads = [...spreadData]
    .sort((a, b) => (b.net_spread || b.gross_spread || 0) - (a.net_spread || a.gross_spread || 0))
    .slice(0, 5);

  const topSpreadBarData = topSpreads.map((s, i) => ({
    name: s.crop_name || s.crop || `Route ${i + 1}`,
    spread: s.net_spread || s.gross_spread || 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const topOpportunity = topSpreads[0] || null;
  const currentTab = tab || 'overview';

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header fade-in">
        <div>
          <h1><ShoppingCart size={28} style={{ color: 'var(--accent)' }} /> Trader Dashboard</h1>
          <p>Spread analysis, supply tracking, and price intelligence for trading decisions</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live Data</span>
        </div>
      </div>

      <div className="tab-bar fade-in">
        {TRADER_TABS.map((item) => (
          <Link key={item.key} to={item.to} className={item.key === currentTab ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  OVERVIEW (default / null tab)                                */}
      {/* ============================================================ */}
      {(!tab || tab === 'overview') && (
        <OverviewView
          stats={stats}
          topSpreadBarData={topSpreadBarData}
          topOpportunity={topOpportunity}
          supplyData={supplyData}
          weatherRegion={weatherRegion}
          setWeatherRegion={setWeatherRegion}
          allRegions={allRegions}
        />
      )}

      {/* ============================================================ */}
      {/*  SPREAD ANALYSIS                                              */}
      {/* ============================================================ */}
      {(tab === 'spread' || tab === 'opportunities') && (
        <SpreadView
          spreadData={spreadData}
          topOpportunity={topOpportunity}
          showTopOnly={tab === 'opportunities'}
        />
      )}

      {/* ============================================================ */}
      {/*  SUPPLY TRACKER                                               */}
      {/* ============================================================ */}
      {tab === 'supply' && (
        <SupplyView supplyData={supplyData} />
      )}

      {/* ============================================================ */}
      {/*  7-DAY FORECAST                                               */}
      {/* ============================================================ */}
      {tab === 'forecast7' && (
        <ForecastView
          crops={crops}
          selectedCrop={selectedCrop}
          setSelectedCrop={setSelectedCrop}
          forecast={forecast}
          forecastLoading={forecastLoading}
          horizon="7_days"
        />
      )}

      {/* ============================================================ */}
      {/*  30-DAY FORECAST                                              */}
      {/* ============================================================ */}
      {tab === 'forecast30' && (
        <ForecastView
          crops={crops}
          selectedCrop={selectedCrop}
          setSelectedCrop={setSelectedCrop}
          forecast={forecast}
          forecastLoading={forecastLoading}
          horizon="30_days"
        />
      )}

      {/* ============================================================ */}
      {/*  TOOLS (placeholder)                                          */}
      {/* ============================================================ */}
      {tab === 'tools' && (
        <>
          {/* Section Header */}
          <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '20px 24px', borderLeft: '4px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Zap size={24} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Trading Tools</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Calculators, converters, and quick actions for smarter trading</p>
              </div>
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '4px 12px' }}>4 Tools Available</span>
          </div>

          {/* Profit Calculator + Break-Even Analyzer */}
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {/* Profit Calculator */}
            <div className="glass-card fade-in" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(0,212,170,0.12)' }}>
                  <BarChart3 size={20} style={{ color: '#00d4aa' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Profit Calculator</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimate your trade margins</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Buy Price (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(0,212,170,0.04)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Sell Price (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(0,212,170,0.04)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Quantity (kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(0,212,170,0.04)' }}
                  />
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Gross Revenue</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>TZS {profitCalc.revenue.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Cost of Goods</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>- TZS {profitCalc.cost.toLocaleString()}</span>
                </div>
                <div style={{ height: 1, background: 'rgba(34,197,94,0.2)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Net Profit</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.15rem', color: profitCalc.net >= 0 ? '#22c55e' : '#ef4444' }}>TZS {profitCalc.net.toLocaleString()}</span>
                    <span className={profitCalc.net >= 0 ? 'badge badge-success' : 'badge badge-danger'} style={{ marginLeft: 8, fontSize: '0.7rem' }}>{profitCalc.margin}% margin</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.82rem', justifyContent: 'center' }} onClick={() => { setBuyPrice(1200); setSellPrice(1450); setQuantity(500); }}>
                  <BarChart3 size={14} /> Reset
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.82rem', justifyContent: 'center' }} onClick={handleSaveScenario}>
                  <Save size={14} /> {showSaveInput ? 'Confirm Save' : 'Save Scenario'}
                </button>
              </div>
              {showSaveInput && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="form-control"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    placeholder={`Scenario ${savedScenarios.length + 1}`}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '6px 10px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveScenario(); }}
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowSaveInput(false); setScenarioName(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {scenarioSaved && (
                <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Scenario saved!
                </div>
              )}
              {savedScenarios.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Saved Scenarios ({savedScenarios.length})
                  </div>
                  {savedScenarios.map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 6, marginBottom: 4,
                      background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.08)',
                      fontSize: '0.78rem',
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                          Buy: {s.buyPrice} / Sell: {s.sellPrice} / Net: TZS {Number(s.net).toLocaleString()} ({s.margin}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => { setBuyPrice(s.buyPrice); setSellPrice(s.sellPrice); setQuantity(s.quantity); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.72rem', textDecoration: 'underline' }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteScenario(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Break-Even Analyzer */}
            <div className="glass-card fade-in" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(245,158,11,0.12)' }}>
                  <Target size={20} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Break-Even Analyzer</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Factor in transport &amp; handling costs</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Buy Price (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={beBuyPrice}
                    onChange={(e) => setBeBuyPrice(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(245,158,11,0.04)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Transport (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={beTransport}
                    onChange={(e) => setBeTransport(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(245,158,11,0.04)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Loading &amp; Handling (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={beLoading}
                    onChange={(e) => setBeLoading(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(245,158,11,0.04)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Packaging (TZS/kg)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={bePackaging}
                    onChange={(e) => setBePackaging(Number(e.target.value) || 0)}
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(245,158,11,0.04)' }}
                  />
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Total Cost per kg</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: '#f59e0b' }}>TZS {breakEven.totalCost.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Break-Even Sell Price</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: '#f59e0b' }}>TZS {breakEven.totalCost.toLocaleString()}/kg</span>
                </div>
                <div style={{ height: 1, background: 'rgba(245,158,11,0.2)', margin: '4px 0 10px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Min. Profitable Sell (10% margin)</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#22c55e' }}>TZS {Number(breakEven.minProfitable).toLocaleString()}/kg</span>
                </div>
              </div>

              {/* Route visual */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px', borderRadius: 8, background: 'rgba(0,212,170,0.04)', fontSize: '0.8rem' }}>
                <MapPin size={14} style={{ color: '#22c55e' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Source Market</span>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>transport cost included</span>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                <MapPin size={14} style={{ color: '#ef4444' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Destination</span>
              </div>
            </div>
          </div>

          {/* Unit Converter + Quick Actions */}
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {/* Unit Converter */}
            <div className="glass-card fade-in" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>
                  <Package size={20} style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Agricultural Unit Converter</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Common Tanzanian crop measurements</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Enter Weight (kg)</label>
                <input
                  type="number"
                  className="form-control"
                  value={unitWeight}
                  onChange={(e) => setUnitWeight(Number(e.target.value) || 0)}
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(59,130,246,0.04)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {unitConversions.map((conv, i) => (
                  <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.1)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{conv.unit}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: 2 }}>{conv.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{conv.note}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.04)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: '#3b82f6' }}>Tip:</strong> A standard maize gunia weighs 90 kg. Rice bags are typically 50 kg. Prices at wholesale markets are usually quoted per gunia or per kg.
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-card fade-in" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(167,139,250,0.12)' }}>
                  <Zap size={20} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Quick Actions</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Common trading workflows</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate('/trader/alerts')}
                  style={{ flexDirection: 'column', padding: '20px 16px', borderRadius: 12, gap: 10, fontSize: '0.82rem', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', cursor: 'pointer' }}
                >
                  <Target size={22} style={{ color: '#ef4444' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Set Price Alert</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Get notified at target price</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={handleExportReport}
                  style={{ flexDirection: 'column', padding: '20px 16px', borderRadius: 12, gap: 10, fontSize: '0.82rem', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.06)', cursor: 'pointer' }}
                >
                  <Download size={22} style={{ color: '#22c55e' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Export Report</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Download CSV report</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => navigate('/trader/spread/opportunities')}
                  style={{ flexDirection: 'column', padding: '20px 16px', borderRadius: 12, gap: 10, fontSize: '0.82rem', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.06)', cursor: 'pointer' }}
                >
                  <Route size={22} style={{ color: '#3b82f6' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Compare Markets</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Side-by-side market prices</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => navigate('/trader/supply')}
                  style={{ flexDirection: 'column', padding: '20px 16px', borderRadius: 12, gap: 10, fontSize: '0.82rem', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.06)', cursor: 'pointer' }}
                >
                  <Package size={22} style={{ color: '#f59e0b' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Track Shipment</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Monitor goods in transit</span>
                </button>
              </div>

              {/* Recent activity log — derived from live data */}
              <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 8, background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.08)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Recent Activity</div>
                {(() => {
                  const activities = [];
                  const topSpread = [...spreadData].sort((a, b) => (b.net_spread || b.gross_spread || 0) - (a.net_spread || a.gross_spread || 0))[0];
                  if (topSpread) {
                    activities.push({
                      icon: <ArrowUpRight size={12} style={{ color: '#22c55e' }} />,
                      text: `Top spread: ${topSpread.crop || topSpread.crop_name} — buy at ${topSpread.buy_market} (${formatTZS(topSpread.buy_price)}), sell at ${topSpread.sell_market} (${formatTZS(topSpread.sell_price)})`,
                      time: 'Live',
                    });
                  }
                  const deficitRegion = supplyData.find((s) => (s.classification || '').toLowerCase() === 'deficit');
                  if (deficitRegion) {
                    activities.push({
                      icon: <AlertTriangle size={12} style={{ color: '#ef4444' }} />,
                      text: `Supply deficit detected in ${deficitRegion.region} (${deficitRegion.crop_count || deficitRegion.crops?.length || 0} crops tracked)`,
                      time: 'Live',
                    });
                  }
                  if (spreadData.length > 1) {
                    activities.push({
                      icon: <Eye size={12} style={{ color: '#3b82f6' }} />,
                      text: `Tracking ${spreadData.length} crop spreads across ${new Set(spreadData.map((s) => s.buy_region || s.buy_market)).size} markets`,
                      time: 'Live',
                    });
                  }
                  if (stats?.total_entries) {
                    activities.push({
                      icon: <CheckCircle size={12} style={{ color: '#f59e0b' }} />,
                      text: `${stats.total_entries.toLocaleString()} price entries across ${stats.total_markets || 0} markets`,
                      time: 'Live',
                    });
                  }
                  const display = activities.slice(0, 4);
                  if (display.length === 0) {
                    return (
                      <div style={{ padding: '8px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        No market activity yet. Data will appear once prices are submitted.
                      </div>
                    );
                  }
                  return display.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < display.length - 1 ? '1px solid rgba(0,212,170,0.06)' : 'none', fontSize: '0.78rem' }}>
                      {item.icon}
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{item.text}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{item.time}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/*  INTELLIGENCE / ANOMALIES OVERVIEW                            */}
      {/* ============================================================ */}
      {tab === 'intelligence' && (
        <IntelligenceView stats={stats} spreadData={spreadData} supplyData={supplyData} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  OVERVIEW VIEW                                                      */
/* ================================================================== */

function OverviewView({ stats, topSpreadBarData, topOpportunity, supplyData, weatherRegion, setWeatherRegion, allRegions }) {
  return (
    <>
      {/* Stat Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="Total Entries"
          value={stats?.total_entries || 0}
          icon={<Database size={20} />}
          color="#00d4aa"
        />
        <StatCard
          label="Active Markets"
          value={stats?.total_markets || 0}
          icon={<MapPin size={20} />}
          color="#3b82f6"
        />
        <StatCard
          label="Crops Tracked"
          value={stats?.total_crops || 0}
          icon={<Wheat size={20} />}
          color="#f59e0b"
        />
        <StatCard
          label="Spread Routes"
          value={topSpreadBarData.length || 0}
          icon={<TrendingUp size={20} />}
          color="#10b981"
        />
      </div>

      {/* Weather */}
      <div className="glass-card fade-in" style={{ padding: 20, marginBottom: 24 }}>
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
            {allRegions.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <WeatherWidget region={weatherRegion} compact={true} />
      </div>

      {/* Top Spread Opportunities Chart + Top Opportunity Card */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <PageCard title="Top 5 Spread Opportunities" icon={<BarChart3 size={18} />}>
          {topSpreadBarData.length > 0 ? (
            <div className="chart-container" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topSpreadBarData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#4a6b52' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: '#e8f5e9' }}
                    formatter={(val) => [`${Number(val).toLocaleString()} TZS`, 'Net Spread']}
                  />
                  <Bar dataKey="spread" radius={[0, 4, 4, 0]} barSize={24}>
                    {topSpreadBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <p>No spread data available</p>
            </div>
          )}
        </PageCard>

        {/* Top Opportunity Card */}
        <div className="glass-card fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Target size={18} style={{ color: '#00d4aa' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Top Opportunity</h3>
          </div>
          {topOpportunity ? (
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                  {topOpportunity.crop_name || topOpportunity.crop || 'N/A'}
                </strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Buy at</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {topOpportunity.buy_market || topOpportunity.source_market || '—'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: '#4ade80', fontWeight: 600 }}>
                    {Number(topOpportunity.buy_price || topOpportunity.source_price || 0).toLocaleString()} TZS
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Sell at</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {topOpportunity.sell_market || topOpportunity.dest_market || '—'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 600 }}>
                    {Number(topOpportunity.sell_price || topOpportunity.dest_price || 0).toLocaleString()} TZS
                  </div>
                </div>
              </div>
              <div style={{
                marginTop: 16, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Net Spread</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem',
                  color: '#00d4aa',
                }}>
                  {Number(topOpportunity.net_spread || topOpportunity.gross_spread || 0).toLocaleString()} TZS
                </span>
              </div>
              {topOpportunity.margin_pct != null && (
                <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  Margin: <span style={{ color: '#00d4aa', fontWeight: 600 }}>{Number(topOpportunity.margin_pct).toFixed(1)}%</span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No trading opportunities found.</p>
          )}
        </div>
      </div>

      {/* Supply Summary by Region */}
      <PageCard title="Supply Summary by Region" icon={<Package size={18} />}>
        {supplyData.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Total Qty</th>
                  <th>Entries</th>
                  <th>Crops</th>
                  <th>Classification</th>
                </tr>
              </thead>
              <tbody>
                {supplyData.map((s, i) => (
                  <tr key={s.region || s.region_name || i}>
                    <td><strong>{s.region || s.region_name || `Region ${i + 1}`}</strong></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {Number(s.total_quantity || s.quantity || 0).toLocaleString()}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.entry_count || s.entries || 0}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.crop_count || s.crops || 0}</td>
                    <td>
                      <ClassificationBadge classification={s.classification || s.status || 'neutral'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No supply data available</p>
          </div>
        )}
      </PageCard>
    </>
  );
}

/* ================================================================== */
/*  SPREAD VIEW                                                        */
/* ================================================================== */

function SpreadView({ spreadData, topOpportunity, showTopOnly }) {
  const data = showTopOnly
    ? [...spreadData]
        .sort((a, b) => (b.net_spread || b.gross_spread || 0) - (a.net_spread || a.gross_spread || 0))
        .slice(0, 5)
    : spreadData;

  return (
    <>
      {/* Top Opportunity Highlight */}
      {topOpportunity && (
        <div
          className="glass-card fade-in"
          style={{
            marginBottom: 24,
            padding: '20px 24px',
            borderLeft: '4px solid #00d4aa',
            background: 'rgba(0,212,170,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Target size={18} style={{ color: '#00d4aa' }} />
            <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
              Best Spread: {topOpportunity.crop_name || topOpportunity.crop || 'N/A'}
            </strong>
            <span className="badge badge-neutral" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
              {Number(topOpportunity.net_spread || topOpportunity.gross_spread || 0).toLocaleString()} TZS net
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Buy from <strong>{topOpportunity.buy_market || topOpportunity.source_market || '—'}</strong> at{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: '#4ade80' }}>
              {Number(topOpportunity.buy_price || topOpportunity.source_price || 0).toLocaleString()} TZS
            </span>
            {' '}&rarr;{' '}
            Sell at <strong>{topOpportunity.sell_market || topOpportunity.dest_market || '—'}</strong> for{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
              {Number(topOpportunity.sell_price || topOpportunity.dest_price || 0).toLocaleString()} TZS
            </span>
          </p>
        </div>
      )}

      {/* Spread Analysis Table */}
      <PageCard
        title={showTopOnly ? 'Top 5 Spread Opportunities' : 'Full Spread Analysis'}
        icon={<BarChart3 size={18} />}
      >
        {data.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Buy Market</th>
                  <th>Buy Price</th>
                  <th>Sell Market</th>
                  <th>Sell Price</th>
                  <th>Gross Spread</th>
                  <th>Net Spread</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s, i) => {
                  const net = s.net_spread || s.gross_spread || 0;
                  const tier = getMarginTier(net);
                  return (
                    <tr key={s.id || i} style={MARGIN_ROW_STYLE[tier]}>
                      <td><strong>{s.crop_name || s.crop || '—'}</strong></td>
                      <td>{s.buy_market || s.source_market || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4ade80' }}>
                        {Number(s.buy_price || s.source_price || 0).toLocaleString()}
                      </td>
                      <td>{s.sell_market || s.dest_market || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#ef4444' }}>
                        {Number(s.sell_price || s.dest_price || 0).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {Number(s.gross_spread || 0).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: tier === 'high' ? '#22c55e' : tier === 'medium' ? '#f59e0b' : '#6b7280' }}>
                        {Number(net).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {s.margin_pct != null ? `${Number(s.margin_pct).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">&#x1F4CA;</div>
            <p>No spread data available</p>
          </div>
        )}
      </PageCard>

      {/* Margin Tier Legend */}
      <div
        className="glass-card fade-in"
        style={{
          marginTop: 16,
          padding: '12px 20px',
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e', display: 'inline-block' }} />
          High margin (&ge;100 TZS)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f59e0b', display: 'inline-block' }} />
          Medium margin (50&ndash;99 TZS)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#6b7280', display: 'inline-block' }} />
          Low margin (&lt;50 TZS)
        </span>
      </div>
    </>
  );
}

/* ================================================================== */
/*  SUPPLY VIEW                                                        */
/* ================================================================== */

function SupplyView({ supplyData }) {
  const surplusCount = supplyData.filter((s) => (s.classification || s.status || '').toLowerCase() === 'surplus').length;
  const deficitCount = supplyData.filter((s) => (s.classification || s.status || '').toLowerCase() === 'deficit').length;
  const neutralCount = supplyData.length - surplusCount - deficitCount;

  const pieData = [
    { name: 'Surplus', value: surplusCount, color: CLASSIFICATION_COLORS.surplus },
    { name: 'Deficit', value: deficitCount, color: CLASSIFICATION_COLORS.deficit },
    { name: 'Neutral', value: neutralCount, color: CLASSIFICATION_COLORS.neutral },
  ].filter((d) => d.value > 0);

  return (
    <>
      {/* Summary stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="Total Regions"
          value={supplyData.length}
          icon={<MapPin size={20} />}
          color="#00d4aa"
        />
        <StatCard
          label="Surplus Regions"
          value={surplusCount}
          icon={<ArrowUpCircle size={20} />}
          color="#22c55e"
        />
        <StatCard
          label="Deficit Regions"
          value={deficitCount}
          icon={<ArrowDownCircle size={20} />}
          color="#ef4444"
        />
        <StatCard
          label="Neutral Regions"
          value={neutralCount}
          icon={<MinusCircle size={20} />}
          color="#6b7280"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Supply Table */}
        <PageCard title="Regional Supply Details" icon={<Package size={18} />}>
          {supplyData.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Quantity</th>
                    <th>Entries</th>
                    <th>Crops</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {supplyData.map((s, i) => (
                    <tr key={s.region || s.region_name || i}>
                      <td><strong>{s.region || s.region_name || `Region ${i + 1}`}</strong></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {Number(s.total_quantity || s.quantity || 0).toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.entry_count || s.entries || 0}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.crop_count || s.crops || 0}</td>
                      <td>
                        <ClassificationBadge classification={s.classification || s.status || 'neutral'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No supply data available</p>
            </div>
          )}
        </PageCard>

        {/* Classification Distribution Pie */}
        <PageCard title="Supply Classification" icon={<Database size={18} />}>
          {pieData.length > 0 ? (
            <>
              <div className="chart-container" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#81c784' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Classification explanations */}
              <div style={{ padding: '16px 20px 8px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }}>
                  What this means for trading
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {surplusCount > 0 && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#22c55e', marginBottom: 2 }}>Surplus ({surplusCount} region{surplusCount > 1 ? 's' : ''})</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          These regions produce more than they consume. Prices tend to be lower — good markets to <strong style={{ color: 'var(--text-secondary)' }}>buy from</strong> for arbitrage.
                        </div>
                      </div>
                    </div>
                  )}
                  {deficitCount > 0 && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ef4444', marginBottom: 2 }}>Deficit ({deficitCount} region{deficitCount > 1 ? 's' : ''})</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          These regions consume more than they produce. Prices tend to be higher — good markets to <strong style={{ color: 'var(--text-secondary)' }}>sell into</strong> for better margins.
                        </div>
                      </div>
                    </div>
                  )}
                  {neutralCount > 0 && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(107,114,128,0.06)', borderRadius: 8, border: '1px solid rgba(107,114,128,0.15)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6b7280', marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>Neutral ({neutralCount} region{neutralCount > 1 ? 's' : ''})</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          Supply roughly matches demand in these regions. Prices are <strong style={{ color: 'var(--text-secondary)' }}>stable</strong> — lower risk but thinner margins.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>No classification data available</p>
            </div>
          )}
        </PageCard>
      </div>
    </>
  );
}

/* ================================================================== */
/*  FORECAST VIEW                                                      */
/* ================================================================== */

function ForecastView({ crops, selectedCrop, setSelectedCrop, forecast, forecastLoading, horizon }) {
  const predictions = forecast?.predictions;
  const trend = forecast?.trend || forecast?.direction || 'stable';
  const confidenceVal = forecast?.confidence;
  const confidenceLevel = getConfidenceLevel(confidenceVal);
  const action = forecast?.action || 'hold';
  const actionReason = forecast?.action_reason;
  const actionCfg = ACTION_CONFIG[action] || ACTION_CONFIG.hold;
  const timeline = forecast?.timeline;
  const currentPrice = forecast?.current_price || 0;
  const stats = forecast?.stats;

  const chartData = (timeline || []).map(([date, price]) => ({ date, price }));

  const predValue = predictions?.[horizon];
  const getChangePct = (val) => {
    if (!val || !currentPrice) return null;
    return (((val - currentPrice) / currentPrice) * 100).toFixed(1);
  };
  const changePct = getChangePct(predValue);
  const isPositive = changePct >= 0;

  const horizonLabel = horizon === '7_days' ? '7-Day' : horizon === '14_days' ? '14-Day' : '30-Day';

  return (
    <>
      {/* Crop Selector */}
      <div className="glass-card fade-in" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginBottom: 8,
            fontWeight: 500,
          }}
        >
          Select a Crop for {horizonLabel} Forecast
        </label>
        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          className="form-control"
          style={{ maxWidth: 360 }}
        >
          <option value="">-- Choose a crop --</option>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedCrop && !forecastLoading && (
        <div className="glass-card fade-in" style={{ textAlign: 'center', padding: 48 }}>
          <LineChartIcon size={48} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Select a crop above to view the {horizonLabel.toLowerCase()} price forecast.
          </p>
        </div>
      )}

      {forecastLoading && <LoadingSpinner message="Generating forecast..." />}

      {forecast && !forecastLoading && (
        <>
          {/* Stat Cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <StatCard
              label="Current Price"
              value={currentPrice ? `TZS ${Number(currentPrice).toLocaleString()}` : '—'}
              icon={<BarChart3 size={20} />}
              color="#00d4aa"
            />
            <StatCard
              label={`${horizonLabel} Prediction`}
              value={predValue ? `TZS ${Number(predValue).toLocaleString()}` : '—'}
              change={changePct != null ? parseFloat(changePct) : undefined}
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
              value={trend.charAt(0).toUpperCase() + trend.slice(1)}
              icon={
                trend === 'up'
                  ? <TrendingUp size={20} />
                  : trend === 'down'
                    ? <TrendingDown size={20} />
                    : <Target size={20} />
              }
              color={
                trend === 'up' ? '#00d4aa'
                  : trend === 'down' ? '#ef4444'
                    : '#f59e0b'
              }
            />
          </div>

          {/* Predictions Row */}
          {predictions && (
            <div className="grid-3" style={{ marginBottom: 24 }}>
              {['7_days', '14_days', '30_days'].map((key) => {
                const val = predictions[key];
                if (val == null) return null;
                const pct = getChangePct(val);
                const pos = pct >= 0;
                const isActive = key === horizon;
                return (
                  <div
                    key={key}
                    className="glass-card fade-in"
                    style={{
                      padding: 20,
                      border: isActive ? '1px solid rgba(0,212,170,0.4)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {key.replace('_', '-').replace('days', 'Day')} Forecast
                      </span>
                      {isActive && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'rgba(0,212,170,0.15)',
                            color: '#00d4aa',
                            fontWeight: 600,
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '1.6rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        marginBottom: 8,
                      }}
                    >
                      {Number(val).toLocaleString()}{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TZS</span>
                    </div>
                    {pct != null && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          background: pos ? 'rgba(0,212,170,0.12)' : 'rgba(239,68,68,0.12)',
                          color: pos ? '#00d4aa' : '#ef4444',
                        }}
                      >
                        {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {pos ? '+' : ''}
                        {pct}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Area Chart */}
          {chartData.length > 0 && (
            <PageCard title={`${forecast.crop || 'Crop'} Price Trend`} icon={<TrendingUp size={18} />}>
              <div className="chart-container" style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="traderPriceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#00d4aa" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#4a6b52' }}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: '#e8f5e9' }}
                      formatter={(val) => [`${Number(val).toLocaleString()} TZS`, 'Price']}
                      labelFormatter={(v) => `Date: ${v}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#00d4aa"
                      strokeWidth={2}
                      fill="url(#traderPriceGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#00d4aa', stroke: '#0a1a10', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PageCard>
          )}

          {/* Action Recommendation */}
          <div
            className="glass-card fade-in"
            style={{
              marginTop: 24,
              padding: 24,
              background: actionCfg.bg,
              border: `1px solid ${actionCfg.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div
                style={{
                  color: actionCfg.color,
                  padding: 12,
                  borderRadius: 12,
                  background: `${actionCfg.color}15`,
                  flexShrink: 0,
                }}
              >
                {actionCfg.icon}
              </div>
              <div>
                <h3
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '1.1rem',
                    color: actionCfg.color,
                    fontWeight: 700,
                  }}
                >
                  {actionCfg.label}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {actionReason || 'No specific recommendation available.'}
                </p>
              </div>
            </div>
          </div>

          {/* Model Stats */}
          {stats && (
            <div className="grid-3" style={{ marginTop: 24 }}>
              <div className="glass-card fade-in" style={{ padding: 20, textAlign: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Data Points
                </span>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    marginTop: 4,
                  }}
                >
                  {stats.data_points ?? '—'}
                </div>
              </div>
              <div className="glass-card fade-in" style={{ padding: 20, textAlign: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Confidence (R&sup2;)
                </span>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    marginTop: 4,
                  }}
                >
                  {confidenceVal != null ? confidenceVal.toFixed(3) : '—'}
                </div>
              </div>
              <div className="glass-card fade-in" style={{ padding: 20, textAlign: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Mean Price
                </span>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    marginTop: 4,
                  }}
                >
                  {stats.mean != null ? Number(stats.mean).toLocaleString() : '—'}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ================================================================== */
/*  INTELLIGENCE VIEW                                                  */
/* ================================================================== */

function IntelligenceView({ stats, spreadData, supplyData }) {
  const anomalies = stats?.total_anomalies || 0;
  const deficitRegions = supplyData.filter(
    (s) => (s.classification || s.status || '').toLowerCase() === 'deficit'
  );
  const highMarginRoutes = spreadData.filter((s) => (s.net_spread || s.gross_spread || 0) >= 100);

  return (
    <>
      {/* Intelligence Stat Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="Anomalies Detected"
          value={anomalies}
          icon={<Radar size={20} />}
          color="#ef4444"
        />
        <StatCard
          label="Deficit Regions"
          value={deficitRegions.length}
          icon={<TrendingDown size={20} />}
          color="#f59e0b"
        />
        <StatCard
          label="High-Margin Routes"
          value={highMarginRoutes.length}
          icon={<Route size={20} />}
          color="#22c55e"
        />
        <StatCard
          label="Total Routes"
          value={spreadData.length}
          icon={<GitBranch size={20} />}
          color="#3b82f6"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Anomalies Summary */}
        <PageCard title="Anomaly Overview" icon={<AlertTriangle size={18} />}>
          {anomalies > 0 ? (
            <div style={{ padding: '12px 0' }}>
              <div
                style={{
                  fontSize: '3rem',
                  fontWeight: 700,
                  color: '#ef4444',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                {anomalies}
              </div>
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                price entries flagged as anomalous across all markets
              </p>
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: '#ef4444' }}>Insight:</strong> Anomalous prices may indicate
                data entry errors, unusual market events, or supply shocks. Review flagged entries to
                improve data quality and identify trading opportunities.
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <CheckCircle size={32} style={{ color: '#22c55e', marginBottom: 8 }} />
              <p style={{ color: 'var(--text-muted)' }}>No anomalies detected. All prices look normal.</p>
            </div>
          )}
        </PageCard>

        {/* Deficit Regions */}
        <PageCard title="Supply Deficit Regions" icon={<ArrowDownCircle size={18} />}>
          {deficitRegions.length > 0 ? (
            <div>
              {deficitRegions.map((r, i) => (
                <div
                  key={r.region || r.region_name || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: i < deficitRegions.length - 1 ? '1px solid rgba(0,212,170,0.06)' : 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {r.region || r.region_name || `Region ${i + 1}`}
                    </strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.crop_count || r.crops || 0} crops &middot; {r.entry_count || r.entries || 0} entries
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#ef4444' }}>
                      {Number(r.total_quantity || r.quantity || 0).toLocaleString()}
                    </span>
                    <ClassificationBadge classification="deficit" />
                  </div>
                </div>
              ))}
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.12)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <strong style={{ color: '#ef4444' }}>Trading Tip:</strong> Deficit regions often have higher
                selling prices. Consider sourcing from surplus regions for maximum spread.
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <p style={{ color: 'var(--text-muted)' }}>No deficit regions found.</p>
            </div>
          )}
        </PageCard>
      </div>

      {/* High-Margin Routes */}
      <PageCard title="High-Margin Trading Routes" icon={<TrendingUp size={18} />}>
        {highMarginRoutes.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Buy Market</th>
                  <th>Sell Market</th>
                  <th style={{ textAlign: 'right' }}>Net Spread</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {highMarginRoutes
                  .sort((a, b) => (b.net_spread || b.gross_spread || 0) - (a.net_spread || a.gross_spread || 0))
                  .slice(0, 10)
                  .map((s, i) => (
                    <tr key={s.id || i}>
                      <td><strong>{s.crop_name || s.crop || '—'}</strong></td>
                      <td>{s.buy_market || s.source_market || '—'}</td>
                      <td>{s.sell_market || s.dest_market || '—'}</td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: '#22c55e',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {Number(s.net_spread || s.gross_spread || 0).toLocaleString()}{' '}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>TZS</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {s.margin_pct != null ? `${Number(s.margin_pct).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No high-margin routes found. Try expanding your market coverage.</p>
          </div>
        )}
      </PageCard>
    </>
  );
}
