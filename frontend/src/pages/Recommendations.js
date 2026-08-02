import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recommendAPI } from '../services/api';
import { LoadingSpinner, PageCard, StatCard } from '../components/Shared';
import { useAuth } from '../services/AuthContext';
import {
  Lightbulb, TrendingUp, MapPin, ShoppingCart, Sprout,
  BarChart3, Target, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Star, Truck, Clock, Eye, Bell, DollarSign
} from 'lucide-react';

const SIGNAL_CONFIG = {
  hold: { label: 'HOLD', color: '#22c55e', badge: 'badge-success' },
  wait: { label: 'WAIT', color: '#f59e0b', badge: 'badge-warning' },
  sell_now: { label: 'SELL NOW', color: '#ef4444', badge: 'badge-danger' },
};

function FreshnessBadge({ freshness, color }) {
  const bg = color || '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 999, background: bg + '22', color: bg,
      border: `1px solid ${bg}44`,
    }}>
      <Clock size={10} /> {freshness}
    </span>
  );
}

function ScoreGauge({ score, signalColor }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <div style={{
        flex: 1, height: 8, borderRadius: 4,
        background: 'var(--bg-tertiary, #1a3a2a)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          borderRadius: 4,
          background: signalColor || '#f59e0b',
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700,
        color: signalColor || 'var(--text-muted)', minWidth: 36, textAlign: 'right',
      }}>
        {score}
      </span>
    </div>
  );
}

function SellSignalCard({ signal }) {
  if (!signal) return (
    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
      Insufficient data for timing signal
    </div>
  );
  const cfg = SIGNAL_CONFIG[signal.signal] || SIGNAL_CONFIG.wait;
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: cfg.color + '11', border: `1px solid ${cfg.color}33`,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className={`badge ${cfg.badge}`} style={{ fontSize: '0.7rem' }}>
          {cfg.label}
        </span>
        <span style={{ fontSize: '0.75rem', color: cfg.color }}>
          vs 7d: {signal.pct_vs_7d > 0 ? '+' : ''}{signal.pct_vs_7d}%
          &nbsp;·&nbsp; vs 30d: {signal.pct_vs_30d > 0 ? '+' : ''}{signal.pct_vs_30d}%
        </span>
      </div>
      <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {signal.message}
      </p>
      <ScoreGauge score={signal.score} signalColor={cfg.color} />
    </div>
  );
}

function MarketComparisonTable({ markets, cropId, navigate }) {
  if (!markets || markets.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem',
        fontFamily: 'var(--font-mono)',
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color, #ffffff22)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Market</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Avg Price</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Entries</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Freshness</th>
            <th style={{ textAlign: 'center', padding: '6px 8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => (
            <tr key={m.market_id || i} style={{ borderBottom: '1px solid var(--border-color, #ffffff11)' }}>
              <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                  <span>{m.market_name}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    ({m.region})
                  </span>
                </div>
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                TZS {Number(m.avg_price).toLocaleString()}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)' }}>
                {m.entry_count}
              </td>
              <td style={{ padding: '8px', textAlign: 'center' }}>
                <FreshnessBadge freshness={m.freshness} color={m.freshness_color} />
              </td>
              <td style={{ padding: '8px', textAlign: 'center' }}>
                <button className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                  onClick={() => navigate(`/prices?crop=${cropId}&market=${m.market_id}`)}>
                  <Eye size={11} /> Prices
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArbitrageDetails({ rec }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
      <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary, #1a3a2a)' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          <ShoppingCart size={11} style={{ marginRight: 4 }} /> BUY
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          {rec.buy_market}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          TZS {Number(rec.buy_price).toLocaleString()}/kg
        </div>
        <div style={{ marginTop: 4 }}>
          <FreshnessBadge freshness={rec.buy_freshness} color={rec.buy_freshness_color} />
        </div>
      </div>
      <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-tertiary, #1a3a2a)' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          <TrendingUp size={11} style={{ marginRight: 4 }} /> SELL
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          {rec.sell_market}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          TZS {Number(rec.sell_price).toLocaleString()}/kg
        </div>
        <div style={{ marginTop: 4 }}>
          <FreshnessBadge freshness={rec.sell_freshness} color={rec.sell_freshness_color} />
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: 8, background: '#22c55e11', border: '1px solid #22c55e33' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Net Profit</span>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#22c55e' }}>
              TZS {Number(rec.net_profit_per_kg).toLocaleString()}/kg
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Margin</span>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
              {rec.margin_pct}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              <Truck size={11} style={{ marginRight: 2 }} /> Transport
            </span>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TZS {Number(rec.transport_cost_per_kg).toLocaleString()}/kg
            </div>
          </div>
        </div>
        {rec.distance_km > 0 && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ~{rec.distance_km} km
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({ rec, role, navigate }) {
  // Farmer: crop_opportunity type
  if (rec.type === 'crop_opportunity') {
    return (
      <div className="glass-card fade-in" style={{ borderLeft: '3px solid #10b981' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#10b981', display: 'flex' }}><Sprout size={16} /></span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {rec.crop}
            </h3>
          </div>
          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
            {rec.market_comparison?.length || 0} markets
          </span>
        </div>

        <SellSignalCard signal={rec.sell_signal} />
        <MarketComparisonTable markets={rec.market_comparison} cropId={rec.crop_id} navigate={navigate} />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm"
            onClick={() => navigate(`/forecast/${rec.crop_id}`)}>
            <Eye size={13} /> View Forecast
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/alerts/create?crop=${rec.crop_id}`)}>
            <Bell size={13} /> Set Alert
          </button>
        </div>
      </div>
    );
  }

  // Trader: arbitrage type
  if (rec.type === 'arbitrage') {
    return (
      <div className="glass-card fade-in" style={{ borderLeft: '3px solid #3b82f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#3b82f6', display: 'flex' }}><TrendingUp size={16} /></span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {rec.crop}
            </h3>
          </div>
          <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
            Margin {rec.margin_pct}%
          </span>
        </div>
        <p style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {rec.description}
        </p>
        <ArbitrageDetails rec={rec} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm"
            onClick={() => navigate(`/transport?from=${rec.buy_market_id}&to=${rec.sell_market_id}&crop=${rec.crop_id}`)}>
            <Truck size={13} /> View Route
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/prices?crop=${rec.crop_id}`)}>
            <Eye size={13} /> Prices
          </button>
        </div>
      </div>
    );
  }

  // Agent: performance type
  if (rec.type === 'performance') {
    const qualityColor = rec.data_quality_color || '#22c55e';
    return (
      <div className="glass-card fade-in" style={{ borderLeft: `3px solid ${qualityColor}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: qualityColor, display: 'flex' }}><Target size={16} /></span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</h3>
          </div>
          <span className="badge badge-neutral" style={{
            fontSize: '0.7rem',
            background: qualityColor + '22',
            color: qualityColor,
            border: `1px solid ${qualityColor}44`,
          }}>
            {rec.data_quality?.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {rec.description}
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Submissions</span>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              {rec.total_submissions}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Accuracy</span>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: qualityColor }}>
              {rec.accuracy_rate}%
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Anomaly Rate</span>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#ef4444' }}>
              {rec.anomaly_rate}%
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Streak</span>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f59e0b' }}>
              {rec.streak > 0 ? `${rec.streak}d` : '—'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Agent: system_insight
  if (rec.type === 'system_insight') {
    return (
      <div className="glass-card fade-in" style={{ borderLeft: '3px solid #6366f1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: '#6366f1', display: 'flex' }}><BarChart3 size={16} /></span>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rec.description}</p>
      </div>
    );
  }

  // Admin: admin_overview
  if (rec.type === 'admin_overview') {
    return (
      <div className="glass-card fade-in" style={{ borderLeft: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#f59e0b', display: 'flex' }}><AlertTriangle size={16} /></span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</h3>
          </div>
          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
            {rec.submissions_last_7d} / 7d
          </span>
        </div>
        <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rec.description}</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Pending Reviews</span>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ef4444' }}>{rec.pending_reviews}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Pending Agents</span>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f59e0b' }}>{rec.pending_agents}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Active Markets</span>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#22c55e' }}>
              {rec.active_markets}/{rec.total_markets}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Active Agents</span>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#3b82f6' }}>{rec.active_agents}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Trend</span>
            <div style={{
              fontWeight: 700, fontSize: '1rem',
              display: 'flex', alignItems: 'center', gap: 4,
              color: rec.trend_color || 'var(--text-muted)',
            }}>
              {rec.trend === 'up' ? <ArrowUpRight size={14} /> : rec.trend === 'down' ? <ArrowDownRight size={14} /> : null}
              {rec.trend?.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin: data_quality (data gaps)
  if (rec.type === 'data_quality') {
    return (
      <div className="glass-card fade-in" style={{ borderLeft: '3px solid #8b5cf6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#8b5cf6', display: 'flex' }}><Target size={16} /></span>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</h3>
          </div>
          {rec.action && (
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{rec.action}</span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rec.description}</p>
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <div className="glass-card fade-in" style={{ borderLeft: '3px solid var(--accent)' }}>
      <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>{rec.title}</h4>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rec.description}</p>
    </div>
  );
}

function buildSummaryStats(summary, role, totalRecs) {
  const stats = [];

  stats.push({
    label: 'Recommendations',
    value: summary.total_recommendations ?? totalRecs,
    icon: <Lightbulb size={20} />,
    color: '#f59e0b',
  });

  if (role === 'farmer') {
    const bestCrops = summary.best_crops || [];
    stats.push({
      label: 'Best Crops',
      value: bestCrops.length > 0 ? bestCrops.slice(0, 2).join(', ') : 'N/A',
      icon: <Sprout size={20} />,
      color: '#10b981',
    });
    stats.push({
      label: 'Avg Savings',
      value: summary.avg_savings || 'N/A',
      icon: <DollarSign size={20} />,
      color: '#00d4aa',
    });
  } else if (role === 'trader') {
    stats.push({
      label: 'Avg Margin',
      value: summary.avg_margin || 'N/A',
      icon: <TrendingUp size={20} />,
      color: '#3b82f6',
    });
    stats.push({
      label: 'Opportunities',
      value: summary.opportunities ?? totalRecs,
      icon: <ShoppingCart size={20} />,
      color: '#00d4aa',
    });
    if (summary.fresh_opportunities != null) {
      stats.push({
        label: 'Fresh Data',
        value: summary.fresh_opportunities,
        icon: <Clock size={20} />,
        color: '#22c55e',
      });
    }
  } else if (role === 'agent') {
    stats.push({
      label: 'Data Quality',
      value: summary.data_quality || 'N/A',
      icon: <Target size={20} />,
      color: '#8b5cf6',
    });
    stats.push({
      label: 'Submissions',
      value: summary.submissions ?? totalRecs,
      icon: <BarChart3 size={20} />,
      color: '#00d4aa',
    });
    if (summary.accuracy_rate) {
      stats.push({
        label: 'Accuracy',
        value: summary.accuracy_rate,
        icon: <Star size={20} />,
        color: '#f97316',
      });
    }
  } else if (role === 'admin') {
    stats.push({
      label: 'System Health',
      value: summary.system_health || 'Good',
      icon: <AlertTriangle size={20} />,
      color: '#f59e0b',
    });
    stats.push({
      label: 'Active Markets',
      value: summary.active_markets ?? 'N/A',
      icon: <MapPin size={20} />,
      color: '#3b82f6',
    });
  }

  return stats;
}

export default function Recommendations() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recommendAPI.list()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner message="Loading recommendations..." />;

  const recommendations = data?.recommendations || [];
  const summary = data?.summary || {};

  const roleLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : 'User';

  const summaryStats = buildSummaryStats(summary, role, recommendations.length);

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><Lightbulb size={28} style={{ color: '#f59e0b' }} /> Recommendations</h1>
          <p>Personalized insights for {roleLabel}s</p>
        </div>
        <span className="badge badge-info">{recommendations.length} items</span>
      </div>

      {summaryStats.length > 0 && (
        <div className={summaryStats.length <= 3 ? 'grid-3' : 'grid-4'} style={{ marginBottom: 24 }}>
          {summaryStats.map((stat, i) => (
            <StatCard
              key={i}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
            />
          ))}
        </div>
      )}

      {recommendations.length === 0 ? (
        <PageCard title="Recommendations" icon={<Lightbulb size={18} />}>
          <div className="empty-state">
            <div className="empty-icon"><Lightbulb size={40} style={{ opacity: 0.3 }} /></div>
            <p>No recommendations available right now.</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Check back later as more market data is collected and analyzed.
            </p>
          </div>
        </PageCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {recommendations.map((rec, i) => (
            <RecommendationCard key={rec.id || i} rec={rec} role={role} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}