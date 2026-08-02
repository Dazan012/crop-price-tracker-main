import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { agentAPI, matchAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useDataWithFallback } from '../services/DataContext';
import { StatCard, LoadingSpinner, PageCard } from '../components/Shared';
import WeatherWidget from '../components/WeatherWidget';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import {
  ClipboardList, CheckCircle, Clock, AlertTriangle, Eye, Send,
  TrendingUp, BarChart3, Filter, FileText, MapPin, Wheat, Edit3,
  Calendar, Target, Activity, XCircle, Info, Plus, Trash2, CloudSun,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG = {
  published:   { color: '#22c55e', label: 'Published',   bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
  under_review:{ color: '#f59e0b', label: 'Under Review',bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  flagged:     { color: '#ef4444', label: 'Flagged',     bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)' },
  live:        { color: '#3b82f6', label: 'Live',        bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
};

const CHART_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4'];

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(10,26,16,0.95)',
  border: '1px solid rgba(0,212,170,0.2)',
  borderRadius: 8,
  fontSize: '0.8rem',
};

const FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'published', label: 'Published' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'live', label: 'Live' },
];

const AGENT_TABS = [
  { key: 'overview', label: 'Overview', to: '/agent/dashboard' },
  { key: 'submissions', label: 'Submissions', to: '/agent/submissions' },
  { key: 'today', label: 'Today', to: '/agent/submissions/today' },
  { key: 'flagged', label: 'Flagged', to: '/agent/submissions/flagged' },
  { key: 'market', label: 'Market', to: '/agent/market' },
  { key: 'matches', label: 'Matches', to: '/agent/matches' },
  { key: 'performance', label: 'Performance', to: '/agent/performance' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function AnomalyScore({ score }) {
  if (score == null) return <span className="badge badge-neutral">N/A</span>;
  const abs = Math.abs(score);
  if (abs > 2.5) return <span className="badge badge-danger"><AlertTriangle size={11} /> {abs.toFixed(1)}</span>;
  if (abs > 1.0) return <span className="badge badge-warning"><AlertTriangle size={11} /> {abs.toFixed(1)}</span>;
  return <span className="badge badge-success">{abs.toFixed(1)}</span>;
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.published;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: '0.72rem',
        fontWeight: 600,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

function TrustScoreRing({ score, size = 80 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="trust-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,212,170,0.08)" strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div className="score-value">{pct}</div>
        <div className="score-max">/ 100</div>
      </div>
    </div>
  );
}

function AgentTierBadge({ accuracy, total }) {
  const tier = accuracy >= 90 && total >= 50 ? 'gold'
    : accuracy >= 75 && total >= 20 ? 'silver'
    : accuracy >= 60 ? 'bronze'
    : 'rising';
  const labels = { gold: 'Gold Agent', silver: 'Silver Agent', bronze: 'Bronze Agent', rising: 'Rising Star' };
  const icons = { gold: '🏆', silver: '🥈', bronze: '🥉', rising: '⭐' };
  return (
    <span className={`agent-badge ${tier}`}>
      {icons[tier]} {labels[tier]}
    </span>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function AgentDashboard({ tab }) {
  const { user } = useAuth();
  const { crops, markets: allMarketsData, regions: allRegions } = useDataWithFallback();

  const [weatherRegion, setWeatherRegion] = useState(user?.region || '');

  /* ---- state ---- */
  const [stats, setStats] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [marketData, setMarketData] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);
  const [matchForm, setMatchForm] = useState({
    match_type: 'sell',
    crop: '',
    region: '',
    quantity_kg: '',
    target_price: '',
    description: '',
  });
  const [matchCreating, setMatchCreating] = useState(false);
  const [priceSummary, setPriceSummary] = useState([]);

  /* ---- load live price summary ---- */
  useEffect(() => {
    dashboardAPI.stats()
      .then((r) => {
        const prices = r.data?.avg_prices || [];
        setPriceSummary(prices.slice(0, 6));
      })
      .catch(() => setPriceSummary([]));
  }, []);

  /* ---- load stats ---- */
  useEffect(() => {
    setLoading(true);
    agentAPI.stats()
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  /* ---- load submissions ---- */
  useEffect(() => {
    setSubmissionsLoading(true);
    const params = {};
    if (tab === 'flagged') params.status = 'flagged';
    else if (tab === 'today') params.status = statusFilter; // will filter client-side by date
    else if (statusFilter) params.status = statusFilter;

    agentAPI.submissions(params)
      .then((r) => {
        let data = r.data || [];
        if (tab === 'flagged') {
          data = data.filter((s) => s.status === 'flagged' || s.is_anomaly);
        }
        if (tab === 'today') {
          const today = new Date().toISOString().slice(0, 10);
          data = data.filter((s) => (s.price_date || '').startsWith(today));
        }
        setSubmissions(data);
      })
      .catch(() => setSubmissions([]))
      .finally(() => setSubmissionsLoading(false));
  }, [tab, statusFilter]);

  /* ---- load market info from context ---- */
  useEffect(() => {
    if (tab !== 'market' || !user?.assigned_market) return;
    const found = allMarketsData.find(
      (m) => String(m.id || m.market_id) === String(user.assigned_market)
    );
    setMarketData(found || null);
    setMarketLoading(false);
  }, [tab, user?.assigned_market, allMarketsData]);

  /* ---- load matches ---- */
  useEffect(() => {
    if (tab !== 'matches') return;
    setMatchesLoading(true);
    setMatchesError(null);
    Promise.all([matchAPI.list(), matchAPI.my()])
      .then(([listRes, myRes]) => {
        setMatches(listRes.data || []);
        setMyMatches(myRes.data || []);
      })
      .catch((err) => {
        setMatchesError(err?.response?.data?.detail || 'Failed to load matches.');
        setMatches([]);
        setMyMatches([]);
      })
      .finally(() => setMatchesLoading(false));
  }, [tab]);

  /* ---- save note ---- */
  const handleSaveNote = (submissionId) => {
    setSavingNote(true);
    agentAPI.updateNote(submissionId, { agent_notes: noteText })
      .then(() => {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, agent_notes: noteText } : s))
        );
        setEditingNote(null);
        setNoteText('');
      })
      .catch(() => {})
      .finally(() => setSavingNote(false));
  };

  /* ---- create match ---- */
  const handleCreateMatch = (e) => {
    e.preventDefault();
    setMatchCreating(true);
    setMatchesError(null);
    matchAPI.create({
      ...matchForm,
      quantity_kg: Number(matchForm.quantity_kg),
      target_price: Number(matchForm.target_price),
    })
      .then(() => {
        setMatchForm({ match_type: 'sell', crop: '', region: '', quantity_kg: '', target_price: '', description: '' });
        return Promise.all([matchAPI.list(), matchAPI.my()]);
      })
      .then(([listRes, myRes]) => {
        setMatches(listRes.data || []);
        setMyMatches(myRes.data || []);
      })
      .catch((err) => {
        setMatchesError(err?.response?.data?.detail || 'Failed to create match.');
      })
      .finally(() => setMatchCreating(false));
  };

  /* ---- cancel match ---- */
  const handleCancelMatch = (id) => {
    setMatchesError(null);
    matchAPI.cancel(id)
      .then(() => Promise.all([matchAPI.list(), matchAPI.my()]))
      .then(([listRes, myRes]) => {
        setMatches(listRes.data || []);
        setMyMatches(myRes.data || []);
      })
      .catch((err) => {
        setMatchesError(err?.response?.data?.detail || 'Failed to cancel match.');
      });
  };

  /* ---- derived ---- */
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySubmissions = submissions.filter((s) => (s.price_date || '').startsWith(todayStr));
  const flaggedSubmissions = submissions.filter((s) => s.status === 'flagged' || s.is_anomaly);

  /* ---- loading guard ---- */
  if (loading && !stats) return <LoadingSpinner message="Loading agent dashboard..." />;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  const currentTab = tab || 'overview';

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header fade-in">
        <div>
          <h1><ClipboardList size={28} /> Agent Dashboard</h1>
          <p>{currentTab === 'overview' ? `Welcome back, ${user?.first_name || user?.username || 'Agent'}! Here's your submission overview.` : tabLabel(tab)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live Data</span>
        </div>
      </div>

      <div className="tab-bar fade-in">
        {AGENT_TABS.map((item) => (
          <Link key={item.key} to={item.to} className={item.key === currentTab ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>

      {tab == null && renderOverview()}
      {tab === 'submissions' && renderSubmissions()}
      {tab === 'today' && renderTodaySubmissions()}
      {tab === 'flagged' && renderFlaggedSubmissions()}
      {tab === 'market' && renderMarketInfo()}
      {tab === 'matches' && renderMatches()}
      {tab === 'performance' && renderPerformance()}
    </div>
  );

  /* ============================================================== */
  /*  OVERVIEW                                                        */
  /* ============================================================== */
  function renderOverview() {
    const totalSub = stats?.total ?? 0;
    const accuracy = stats?.accuracy_rate ?? 0;
    const todayCount = stats?.today_count ?? 0;
    const flaggedCount = stats?.flagged ?? 0;

    return (
      <>
        {/* Stat cards */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard label="Total Submissions" value={totalSub} icon={<Send size={20} />} color="#00d4aa" />
          <StatCard label="Accuracy Rate" value={`${accuracy.toFixed(1)}%`} icon={<Target size={20} />} color="#22c55e" />
          <StatCard label="Today's Entries" value={todayCount} icon={<Calendar size={20} />} color="#3b82f6" />
          <StatCard label="Flagged" value={flaggedCount} icon={<AlertTriangle size={20} />} color="#ef4444" />
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

        {/* Status breakdown */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <PageCard title="Status Breakdown" icon={<BarChart3 size={18} />}>
            <div className="chart-container" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Published', value: stats?.published ?? 0, color: STATUS_CONFIG.published.color },
                    { name: 'Review', value: stats?.under_review ?? 0, color: STATUS_CONFIG.under_review.color },
                    { name: 'Flagged', value: stats?.flagged ?? 0, color: STATUS_CONFIG.flagged.color },
                    { name: 'Live', value: stats?.live ?? 0, color: STATUS_CONFIG.live.color },
                  ]}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {[
                      STATUS_CONFIG.published.color,
                      STATUS_CONFIG.under_review.color,
                      STATUS_CONFIG.flagged.color,
                      STATUS_CONFIG.live.color,
                    ].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PageCard>

          {/* Quick stats */}
          <PageCard title="Quick Stats" icon={<Activity size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <QuickStatRow label="This Week" value={stats?.week_count ?? 0} icon={<Calendar size={14} />} color="#3b82f6" />
              <QuickStatRow label="Published" value={stats?.published ?? 0} icon={<CheckCircle size={14} />} color="#22c55e" />
              <QuickStatRow label="Under Review" value={stats?.under_review ?? 0} icon={<Clock size={14} />} color="#f59e0b" />
              <QuickStatRow label="Flagged" value={stats?.flagged ?? 0} icon={<AlertTriangle size={14} />} color="#ef4444" />
              <QuickStatRow label="Live on Platform" value={stats?.live ?? 0} icon={<Eye size={14} />} color="#06b6d4" />
            </div>
          </PageCard>
        </div>

        {/* Recent submissions */}
        <PageCard
          title="Recent Submissions"
          icon={<FileText size={18} />}
          action={
            <a href="/agent/submissions" className="btn btn-secondary btn-sm">
              View All <BarChart3 size={14} />
            </a>
          }
        >
          {renderSubmissionsTable(submissions.slice(0, 8), false)}
        </PageCard>
      </>
    );
  }

  /* ============================================================== */
  /*  SUBMISSIONS (full list with filter)                             */
  /* ============================================================== */
  function renderSubmissions() {
    return (
      <>
        <div className="filters-bar" style={{ marginBottom: 24 }}>
          <span className="filter-label"><Filter size={14} /> Filter</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {submissionsLoading ? (
          <LoadingSpinner message="Loading submissions..." />
        ) : (
          <PageCard title="All Submissions" icon={<ClipboardList size={18} />}>
            {renderSubmissionsTable(submissions, true)}
          </PageCard>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  TODAY'S SUBMISSIONS                                             */
  /* ============================================================== */
  function renderTodaySubmissions() {
    return (
      <>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="badge badge-info"><Calendar size={12} /> {todayStr}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {todaySubmissions.length} submission{todaySubmissions.length !== 1 ? 's' : ''} today
          </span>
        </div>

        {submissionsLoading ? (
          <LoadingSpinner message="Loading today's submissions..." />
        ) : (
          <PageCard title="Today's Submissions" icon={<Calendar size={18} />}>
            {renderSubmissionsTable(todaySubmissions, true)}
          </PageCard>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  FLAGGED SUBMISSIONS                                             */
  /* ============================================================== */
  function renderFlaggedSubmissions() {
    return (
      <>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="badge badge-danger"><AlertTriangle size={12} /> Flagged</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {flaggedSubmissions.length} flagged submission{flaggedSubmissions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {submissionsLoading ? (
          <LoadingSpinner message="Loading flagged submissions..." />
        ) : (
          <PageCard title="Flagged Submissions" icon={<AlertTriangle size={18} />}>
            {renderSubmissionsTable(flaggedSubmissions, true)}
          </PageCard>
        )}
      </>
    );
  }

  /* ============================================================== */
  /*  MARKET INFO (real data)                                         */
  /* ============================================================== */
  function renderMarketInfo() {
    const market = marketData;
    const totalSub = stats?.total ?? 0;
    const accuracy = stats?.accuracy_rate ?? 0;
    const todayCount = stats?.today_count ?? 0;
    const publishedCount = stats?.published ?? 0;
    const approvalRate = totalSub > 0 ? ((publishedCount / totalSub) * 100).toFixed(1) : '0.0';
    const recentSubs = submissions.slice(0, 8);

    // Live price summary from dashboard stats API
    const livePriceSummary = priceSummary.length > 0
      ? priceSummary.map((p) => {
          const spread = p.max_price - p.min_price;
          const spreadPct = p.avg_price > 0 ? ((spread / p.avg_price) * 100).toFixed(1) : '0.0';
          const trend = spread > 0 ? `+${spreadPct}%` : `${spreadPct}%`;
          return { crop: p.crop, avgPrice: p.avg_price, trend, count: p.count };
        })
      : [];

    if (marketLoading) return <LoadingSpinner message="Loading market information..." />;

    return (
      <>
        {/* Market header card */}
        <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                  {market?.name || 'Assigned Market'}
                </h2>
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={11} /> Active
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} style={{ color: '#00d4aa' }} />
                  <span>{market?.region_name || user?.region || 'Region'}, {market?.district_name || market?.district || user?.district || 'District'}</span>
                </div>
                {market?.operating_days && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={13} style={{ color: '#3b82f6' }} />
                    <span>{market.operating_days}</span>
                  </div>
                )}
                {market?.market_type && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} style={{ color: '#f59e0b' }} />
                    <span>{market.market_type}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-info" style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                <MapPin size={11} /> Market ID: {market?.id || market?.market_id || user?.assigned_market || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats grid — computed from existing stats */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard label="Total Submissions" value={totalSub} icon={<Send size={20} />} color="#00d4aa" />
          <StatCard label="Accuracy Rate" value={`${accuracy.toFixed(1)}%`} icon={<Target size={20} />} color="#22c55e" />
          <StatCard label="Today's Entries" value={todayCount} icon={<Calendar size={20} />} color="#3b82f6" />
          <StatCard label="Approval Rate" value={`${approvalRate}%`} icon={<CheckCircle size={20} />} color="#f59e0b" />
        </div>

        {/* Recent Submissions + Market Price Summary */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <PageCard title="Recent Submissions" icon={<Clock size={18} />}>
            {recentSubs.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Crop</th>
                      <th>Price (TZS)</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSubs.map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Wheat size={13} style={{ color: '#00d4aa' }} />
                            <strong style={{ color: 'var(--text-primary)' }}>{sub.crop_name || '--'}</strong>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatTZS(sub.price)}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {formatDate(sub.price_date)}
                        </td>
                        <td>
                          {sub.status === 'published' || sub.status === 'live' ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle size={11} /> {sub.status}
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} /> {sub.status || 'pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>No submissions yet.</p>
              </div>
            )}
          </PageCard>

          <PageCard title="Market Price Summary" icon={<TrendingUp size={18} />}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th>Avg Price (TZS/kg)</th>
                    <th>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {livePriceSummary.length > 0 ? livePriceSummary.map((item, i) => {
                    const isPositive = item.trend.startsWith('+');
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Wheat size={13} style={{ color: '#00d4aa' }} />
                            <strong style={{ color: 'var(--text-primary)' }}>{item.crop}</strong>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({item.count} entries)</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatTZS(item.avgPrice)}
                        </td>
                        <td>
                          <span
                            className={isPositive ? 'badge badge-success' : 'badge badge-warning'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}
                          >
                            <TrendingUp size={11} /> {item.trend}
                          </span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        {priceSummary.length === 0 ? 'Loading price data...' : 'No price data available yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </div>
      </>
    );
  }

  /* ============================================================== */
  /*  MATCHES (real API)                                              */
  /* ============================================================== */
  function renderMatches() {
    const matchTypeColor = (t) => (t === 'buy' ? '#3b82f6' : '#22c55e');

    if (matchesLoading) return <LoadingSpinner message="Loading matches..." />;

    return (
      <>
        {/* Error banner */}
        {matchesError && (
          <div
            className="glass-card fade-in"
            style={{
              padding: '12px 20px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
            }}
          >
            <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>{matchesError}</span>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.72rem' }}
              onClick={() => setMatchesError(null)}
            >
              <XCircle size={12} /> Dismiss
            </button>
          </div>
        )}

        {/* Matches header */}
        <div
          className="glass-card fade-in"
          style={{
            padding: 20,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Target size={22} style={{ color: '#00d4aa' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                {matches.length} Active Market Matches
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Create buy/sell matches and connect with other market participants
              </p>
            </div>
          </div>
          <span
            className="badge badge-info"
            style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {myMatches.length} Yours
          </span>
        </div>

        {/* ---- Create Match form ---- */}
        <PageCard title="Create Match" icon={<Plus size={18} />}>
          <form onSubmit={handleCreateMatch}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 14,
              }}
            >
              {/* Match type */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Type
                </label>
                <select
                  className="form-control"
                  value={matchForm.match_type}
                  onChange={(e) => setMatchForm({ ...matchForm, match_type: e.target.value })}
                  required
                >
                  <option value="sell">Sell</option>
                  <option value="buy">Buy</option>
                </select>
              </div>

              {/* Crop */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Crop
                </label>
                <select
                  className="form-control"
                  value={matchForm.crop}
                  onChange={(e) => setMatchForm({ ...matchForm, crop: e.target.value })}
                  required
                >
                  <option value="">Select crop...</option>
                  {crops.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Region
                </label>
                <input
                  className="form-control"
                  type="text"
                  placeholder="e.g. Morogoro"
                  value={matchForm.region}
                  onChange={(e) => setMatchForm({ ...matchForm, region: e.target.value })}
                  required
                />
              </div>

              {/* Quantity */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Quantity (kg)
                </label>
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  placeholder="e.g. 2000"
                  value={matchForm.quantity_kg}
                  onChange={(e) => setMatchForm({ ...matchForm, quantity_kg: e.target.value })}
                  required
                />
              </div>

              {/* Target price */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Target Price (TZS)
                </label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  placeholder="e.g. 85000"
                  value={matchForm.target_price}
                  onChange={(e) => setMatchForm({ ...matchForm, target_price: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginTop: 14 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                Description
              </label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Describe what you are looking for..."
                value={matchForm.description}
                onChange={(e) => setMatchForm({ ...matchForm, description: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={matchCreating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {matchCreating ? (
                  <>
                    <span className="spinner-dot" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Create Match
                  </>
                )}
              </button>
            </div>
          </form>
        </PageCard>

        {/* ---- My Matches ---- */}
        <div style={{ marginTop: 24 }}>
          <PageCard title="My Matches" icon={<Send size={18} />}>
            {myMatches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>You have no active matches. Create one above!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myMatches.map((m) => {
                  const typeColor = matchTypeColor(m.match_type);
                  return (
                    <div
                      key={m.id}
                      className="glass-card"
                      style={{
                        padding: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
                        <span
                          className="badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 12px',
                            borderRadius: 20,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: `${typeColor}18`,
                            border: `1px solid ${typeColor}44`,
                            color: typeColor,
                          }}
                        >
                          <Activity size={11} /> {m.match_type === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {m.crop}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                            <MapPin size={11} style={{ verticalAlign: -1 }} /> {m.region}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          <ClipboardList size={12} style={{ verticalAlign: -1 }} />{' '}
                          {Number(m.quantity_kg).toLocaleString()} kg
                        </span>
                        <span
                          style={{
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                          }}
                        >
                          <TrendingUp size={12} style={{ verticalAlign: -1 }} /> TZS{' '}
                          {formatTZS(m.target_price)}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCancelMatch(m.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#ef4444',
                        }}
                        title="Cancel match"
                      >
                        <Trash2 size={13} /> Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </PageCard>
        </div>

        {/* ---- Active Market Matches ---- */}
        <div style={{ marginTop: 24 }}>
          <PageCard title="Active Market Matches" icon={<Target size={18} />}>
            {matches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <p>No active matches on the market right now.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {matches.map((m) => {
                  const typeColor = matchTypeColor(m.match_type);
                  return (
                    <div key={m.id} className="glass-card fade-in" style={{ padding: 20 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        {/* Left: type badge + info */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <span
                            className="badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 12px',
                              borderRadius: 20,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              background: `${typeColor}18`,
                              border: `1px solid ${typeColor}44`,
                              color: typeColor,
                              marginBottom: 10,
                            }}
                          >
                            <Activity size={11} /> {m.match_type === 'buy' ? 'Buy' : 'Sell'}
                          </span>
                          <h3
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '1.05rem',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {m.crop}
                          </h3>
                          <p
                            style={{
                              margin: '0 0 8px 0',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <MapPin size={11} style={{ verticalAlign: -1 }} /> {m.region}
                          </p>
                          {m.description && (
                            <p
                              style={{
                                margin: 0,
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                              }}
                            >
                              {m.description}
                            </p>
                          )}
                        </div>

                        {/* Right: posted by */}
                        <div style={{ textAlign: 'right', minWidth: 100 }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              display: 'block',
                              marginBottom: 2,
                            }}
                          >
                            Posted by
                          </span>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {m.posted_by_username || m.user?.username || 'Unknown'}
                          </strong>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              display: 'block',
                              marginTop: 4,
                            }}
                          >
                            {formatDate(m.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Crop details row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 20,
                          flexWrap: 'wrap',
                          marginTop: 16,
                          padding: '12px 16px',
                          borderRadius: 8,
                          background: 'rgba(0,212,170,0.04)',
                          border: '1px solid rgba(0,212,170,0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Wheat size={14} style={{ color: '#00d4aa' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            Crop:
                          </span>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {m.crop}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ClipboardList size={14} style={{ color: '#3b82f6' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            Qty:
                          </span>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {Number(m.quantity_kg).toLocaleString()} kg
                          </strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TrendingUp size={14} style={{ color: '#f59e0b' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            Target:
                          </span>
                          <strong
                            style={{
                              fontSize: '0.85rem',
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            TZS {formatTZS(m.target_price)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PageCard>
        </div>
      </>
    );
  }

  /* ============================================================== */
  /*  PERFORMANCE                                                     */
  /* ============================================================== */
  function renderPerformance() {
    const chartData = [
      { name: 'Published', value: stats?.published ?? 0, color: STATUS_CONFIG.published.color },
      { name: 'Under Review', value: stats?.under_review ?? 0, color: STATUS_CONFIG.under_review.color },
      { name: 'Flagged', value: stats?.flagged ?? 0, color: STATUS_CONFIG.flagged.color },
      { name: 'Live', value: stats?.live ?? 0, color: STATUS_CONFIG.live.color },
    ];

    const total = (stats?.total ?? 0) || 1;
    const accuracy = stats?.accuracy_rate ?? 0;
    const trustScore = Math.round(
      (accuracy * 0.5) +
      ((stats?.published ?? 0) / total * 100 * 0.3) +
      (Math.min(total, 100) * 0.2)
    );

    return (
      <>
        {/* Trust Score + Tier */}
        <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <TrustScoreRing score={trustScore} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Agent Trust Score
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <AgentTierBadge accuracy={accuracy} total={total} />
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Your score reflects submission accuracy ({accuracy.toFixed(0)}%), publication rate, and contribution volume.
              Keep submitting quality data to earn higher tiers.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Accuracy</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444' }}>
                {accuracy.toFixed(1)}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Published</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#22c55e' }}>
                {stats?.published ?? 0} / {stats?.total ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>This Week</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#3b82f6' }}>
                {stats?.week_count ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Performance stat cards */}
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <StatCard label="Total Submissions" value={stats?.total ?? 0} icon={<Send size={20} />} color="#00d4aa" />
          <StatCard label="Accuracy Rate" value={`${accuracy.toFixed(1)}%`} icon={<Target size={20} />} color={accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444'} />
          <StatCard label="This Week" value={stats?.week_count ?? 0} icon={<Calendar size={20} />} color="#3b82f6" />
        </div>

        {/* Status distribution chart */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <PageCard title="Submission Status Distribution" icon={<BarChart3 size={18} />}>
            <div className="chart-container" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,170,0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#4a6b52' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PageCard>

          {/* Performance metrics */}
          <PageCard title="Performance Metrics" icon={<Activity size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PerformanceBar label="Published Rate" value={((stats?.published ?? 0) / total) * 100} color="#22c55e" />
              <PerformanceBar label="Review Rate" value={((stats?.under_review ?? 0) / total) * 100} color="#f59e0b" />
              <PerformanceBar label="Flag Rate" value={((stats?.flagged ?? 0) / total) * 100} color="#ef4444" />
              <PerformanceBar label="Live Rate" value={((stats?.live ?? 0) / total) * 100} color="#3b82f6" />
            </div>
          </PageCard>
        </div>
      </>
    );
  }

  /* ============================================================== */
  /*  SHARED: Submissions Table                                       */
  /* ============================================================== */
  function renderSubmissionsTable(data, showNotes) {
    if (!data || data.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No submissions found.</p>
        </div>
      );
    }

    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Crop</th>
              <th>Market</th>
              <th>Region</th>
              <th>Price (TZS)</th>
              <th>Anomaly</th>
              <th>Status</th>
              {showNotes && <th>Notes</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((sub) => (
              <tr key={sub.id}>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {formatDate(sub.price_date)}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wheat size={13} style={{ color: '#00d4aa' }} />
                    <strong style={{ color: 'var(--text-primary)' }}>{sub.crop_name || '--'}</strong>
                  </div>
                </td>
                <td>{sub.market_name || '--'}</td>
                <td>
                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                    <MapPin size={10} /> {sub.region_name || '--'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {formatTZS(sub.price)}
                </td>
                <td>
                  <AnomalyScore score={sub.anomaly_score} />
                </td>
                <td>
                  <StatusPill status={sub.status} />
                </td>
                {showNotes && (
                  <td>
                    {editingNote === sub.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="form-control"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add note..."
                          style={{ fontSize: '0.78rem', padding: '4px 8px', minWidth: 120 }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveNote(sub.id)}
                          disabled={savingNote}
                          style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                        >
                          {savingNote ? '...' : 'Save'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setEditingNote(null); setNoteText(''); }}
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                        onClick={() => { setEditingNote(sub.id); setNoteText(sub.agent_notes || ''); }}
                      >
                        <span style={{ fontSize: '0.78rem', color: sub.agent_notes ? 'var(--text-secondary)' : 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.agent_notes || 'Add note...'}
                        </span>
                        <Edit3 size={11} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Small sub-components                                                */
/* ------------------------------------------------------------------ */

function QuickStatRow({ label, value, icon, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,212,170,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function PerformanceBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,212,170,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab label helper                                                   */
/* ------------------------------------------------------------------ */

function tabLabel(tab) {
  const labels = {
    'submissions': 'View and manage all your price submissions.',
    'today': "Today's price entries submitted to the platform.",
    'flagged': 'Submissions flagged for review due to anomalies.',
    'market': 'Information about your assigned market.',
    'matches': 'Potential buyer-seller matches based on your data.',
    'performance': 'Track your accuracy, submission volume, and quality metrics.',
  };
  return labels[tab] || 'Agent Dashboard';
}

/* end of file */
