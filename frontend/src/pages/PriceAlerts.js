import { useState, useEffect } from 'react';
import { alertAPI } from '../services/api';
import { useAuth } from '../services/AuthContext';
import { useDataWithFallback } from '../services/DataContext';
import { LoadingSpinner, PageCard } from '../components/Shared';
import {
  Bell, BellRing, BellOff, PlusCircle, Trash2, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';

const ALERT_TYPE_LABELS = {
  price_drop: 'Price Drop',
  price_rise: 'Price Rise',
  above_threshold: 'Above Threshold',
  below_threshold: 'Below Threshold',
};

const ALERT_TYPE_ICONS = {
  price_drop: TrendingDown,
  price_rise: TrendingUp,
  above_threshold: ArrowUpRight,
  below_threshold: ArrowDownRight,
};

const STATUS_COLORS = {
  active: '#00d4aa',
  triggered: '#f59e0b',
  expired: '#6b7280',
  cancelled: '#ef4444',
};

export default function PriceAlerts() {
  const { user } = useAuth();
  const { crops, markets } = useDataWithFallback();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const [form, setForm] = useState({
    crop: '',
    market: '',
    alert_type: 'price_drop',
    threshold_price: '',
    pct_change: '',
  });

  useEffect(() => {
    alertAPI.list()
      .then(res => setAlerts(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.crop || !form.alert_type) return;
    setCreating(true);
    try {
      const payload = {
        crop: parseInt(form.crop),
        alert_type: form.alert_type,
      };
      if (form.market) payload.market = parseInt(form.market);
      if (form.threshold_price) payload.threshold_price = parseFloat(form.threshold_price);
      if (form.pct_change) payload.pct_change = parseFloat(form.pct_change);

      const res = await alertAPI.create(payload);
      setAlerts((prev) => [res.data, ...prev]);
      setShowForm(false);
      setForm({ crop: '', market: '', alert_type: 'price_drop', threshold_price: '', pct_change: '' });
    } catch (err) {
      console.error('Failed to create alert:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await alertAPI.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await alertAPI.check();
      setCheckResult(res.data);
      // Refresh alerts list
      const alertsRes = await alertAPI.list();
      setAlerts(alertsRes.data || []);
    } catch (err) {
      console.error('Failed to check alerts:', err);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading alerts..." />;

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const triggeredAlerts = alerts.filter((a) => a.status === 'triggered');
  const otherAlerts = alerts.filter((a) => a.status !== 'active' && a.status !== 'triggered');

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><Bell size={28} /> Price Alerts</h1>
          <p>Set up alerts for price changes on crops you care about</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleCheck} disabled={checking}>
            {checking ? 'Checking...' : 'Check Now'}
            <BellRing size={14} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New Alert'}
            <PlusCircle size={14} />
          </button>
        </div>
      </div>

      {/* Check Result */}
      {checkResult && (
        <div className="glass-card fade-in" style={{ padding: 20, marginBottom: 24, borderLeft: '3px solid var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <BellRing size={18} style={{ color: 'var(--accent)' }} />
            <strong>Alert Check Complete</strong>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Checked {checkResult.checked} active alert{checkResult.checked !== 1 ? 's' : ''}.
            {checkResult.triggered_count > 0 ? (
              <span style={{ color: 'var(--warning)' }}>
                {' '}{checkResult.triggered_count} alert{checkResult.triggered_count !== 1 ? 's' : ''} triggered!
              </span>
            ) : (
              <span style={{ color: 'var(--success)' }}> No alerts triggered.</span>
            )}
          </p>
          {checkResult.triggered && checkResult.triggered.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checkResult.triggered.map((t) => (
                <div key={t.id} style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, fontSize: '0.82rem' }}>
                  {t.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <PageCard title="Create Price Alert" icon={<Bell size={18} />} extraStyle={{ marginBottom: 24 }}>
          <form onSubmit={handleCreate}>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label>Crop</label>
                <select className="form-control" value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} required>
                  <option value="">Select a crop...</option>
                  {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Market (optional)</label>
                <select className="form-control" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })}>
                  <option value="">All Markets</option>
                  {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Alert Type</label>
                <select className="form-control" value={form.alert_type} onChange={(e) => setForm({ ...form, alert_type: e.target.value })} required>
                  <option value="price_drop">Price Drop (%)</option>
                  <option value="price_rise">Price Rise (%)</option>
                  <option value="above_threshold">Above Price Threshold</option>
                  <option value="below_threshold">Below Price Threshold</option>
                </select>
              </div>

              {(form.alert_type === 'price_drop' || form.alert_type === 'price_rise') && (
                <div className="form-group">
                  <label>Percentage Change (%)</label>
                  <input
                    className="form-control"
                    type="number"
                    value={form.pct_change}
                    onChange={(e) => setForm({ ...form, pct_change: e.target.value })}
                    placeholder="e.g. 10"
                    min="1"
                    max="100"
                    step="0.5"
                  />
                </div>
              )}

              {(form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold') && (
                <div className="form-group">
                  <label>Price Threshold (TZS/kg)</label>
                  <input
                    className="form-control"
                    type="number"
                    value={form.threshold_price}
                    onChange={(e) => setForm({ ...form, threshold_price: e.target.value })}
                    placeholder="e.g. 2000"
                    min="1"
                    step="1"
                    required
                  />
                </div>
              )}
            </div>

            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Alert'}
            </button>
          </form>
        </PageCard>
      )}

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <PageCard title={`Triggered Alerts (${triggeredAlerts.length})`} icon={<AlertTriangle size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {triggeredAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
              ))}
            </div>
          </PageCard>
        </div>
      )}

      {/* Active Alerts */}
      <PageCard title={`Active Alerts (${activeAlerts.length})`} icon={<Bell size={18} />}>
        {activeAlerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BellOff size={36} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
            <p>No active alerts. Create one to get notified about price changes.</p>
          </div>
        )}
      </PageCard>

      {/* History */}
      {otherAlerts.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <PageCard title="Alert History" icon={<Clock size={18} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {otherAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
              ))}
            </div>
          </PageCard>
        </div>
      )}
    </div>
  );
}


function AlertCard({ alert, onDelete }) {
  const Icon = ALERT_TYPE_ICONS[alert.alert_type] || Bell;
  const statusColor = STATUS_COLORS[alert.status] || 'var(--text-muted)';

  return (
    <div
      className="glass-card"
      style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${statusColor}15`,
          color: statusColor,
          flexShrink: 0,
        }}>
          {alert.status === 'triggered' ? <AlertTriangle size={18} /> : <Icon size={18} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {alert.crop_name}
            </strong>
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
              {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: statusColor,
                textTransform: 'uppercase',
              }}
            >
              {alert.status}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {alert.market_name ? alert.market_name : 'All Markets'}
            {alert.threshold_price && ` · TZS ${Number(alert.threshold_price).toLocaleString()}`}
            {alert.pct_change && ` · ${alert.pct_change}%`}
          </div>
          {alert.triggered_price && (
            <div style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: 2 }}>
              Triggered at TZS {Number(alert.triggered_price).toLocaleString()}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(alert.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-faint)',
          padding: 6,
          borderRadius: 6,
          transition: 'all 0.2s',
        }}
        title="Delete alert"
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
