import { useState, useEffect } from 'react';
import { alertAPI } from '../services/api';
import { Bell, BellRing, Plus, Trash2, Wheat, Store, TrendingDown, TrendingUp, DollarSign, Activity } from 'lucide-react';

const ALERT_TYPES = [
  { value: 'price_drop', label: 'Price Drop', icon: <TrendingDown size={14} />, color: '#ef4444' },
  { value: 'price_rise', label: 'Price Rise', icon: <TrendingUp size={14} />, color: '#22c55e' },
  { value: 'above_threshold', label: 'Above Threshold', icon: <TrendingUp size={14} />, color: '#3b82f6' },
  { value: 'below_threshold', label: 'Below Threshold', icon: <TrendingDown size={14} />, color: '#f59e0b' },
];

export default function PriceAlertManager({ crops, markets, compact }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    crop: '',
    market: '',
    alert_type: 'price_drop',
    threshold_price: '',
    pct_change: '',
  });

  const fetchAlerts = () => {
    setLoading(true);
    alertAPI.list().then((res) => {
      setAlerts(res.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const payload = {
      crop: parseInt(form.crop),
      alert_type: form.alert_type,
    };
    if (form.market) payload.market = parseInt(form.market);
    if (form.threshold_price) payload.threshold_price = parseFloat(form.threshold_price);
    if (form.pct_change) payload.pct_change = parseFloat(form.pct_change);
    try {
      await alertAPI.create(payload);
      setShowForm(false);
      setForm({ crop: '', market: '', alert_type: 'price_drop', threshold_price: '', pct_change: '' });
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await alertAPI.delete(id);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  if (compact) {
    const activeAlerts = alerts.filter(a => a.status === 'active');
    const triggeredAlerts = alerts.filter(a => a.status === 'triggered');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bell size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            {activeAlerts.length} active alerts
          </span>
          {triggeredAlerts.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--warning)' }}>
              {triggeredAlerts.length} triggered
            </span>
          )}
          <button className="btn btn-sm btn-secondary" onClick={() => setShowForm(!showForm)} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}>
            {showForm ? 'Cancel' : '+ New Alert'}
          </button>
        </div>
        {showForm && (
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <select className="form-control" name="crop" value={form.crop} onChange={handleChange} required style={{ flex: 1, minWidth: 100, fontSize: '0.75rem', padding: '4px 6px' }}>
              <option value="">Crop</option>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="form-control" name="alert_type" value={form.alert_type} onChange={handleChange} style={{ flex: 1, minWidth: 90, fontSize: '0.75rem', padding: '4px 6px' }}>
              {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className="form-control" type="number" name="threshold_price" value={form.threshold_price} onChange={handleChange} placeholder="Threshold (TZS)" style={{ width: 110, fontSize: '0.75rem', padding: '4px 6px' }} />
            <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Create</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellRing size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Price Alerts</h3>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> {showForm ? 'Cancel' : 'New Alert'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{ padding: 16, background: 'var(--bg-glass)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}><Wheat size={12} /> Crop</label>
              <select className="form-control" name="crop" value={form.crop} onChange={handleChange} required>
                <option value="">Select crop...</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}><Store size={12} /> Market (optional)</label>
              <select className="form-control" name="market" value={form.market} onChange={handleChange}>
                <option value="">All markets</option>
                {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}><Activity size={12} /> Alert Type</label>
              <select className="form-control" name="alert_type" value={form.alert_type} onChange={handleChange}>
                {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
                {form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold' ? <DollarSign size={12} /> : <Activity size={12} />}
                {form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold' ? ' Threshold (TZS)' : ' % Change'}
              </label>
              <input className="form-control" type="number" name={form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold' ? 'threshold_price' : 'pct_change'} value={form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold' ? form.threshold_price : form.pct_change} onChange={handleChange} placeholder={form.alert_type === 'above_threshold' || form.alert_type === 'below_threshold' ? 'e.g. 2000' : 'e.g. 10'} step="0.1" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Create Alert</button>
        </form>
      )}

      {/* Alert list */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto 8px' }} />
          Loading alerts...
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <Bell size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p style={{ margin: 0 }}>No price alerts configured</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>Create alerts for price drops, rises, or thresholds</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((alert) => {
            const at = ALERT_TYPES.find(t => t.value === alert.alert_type);
            const isTriggered = alert.status === 'triggered';
            return (
              <div key={alert.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: isTriggered ? 'rgba(245,158,11,0.08)' : 'var(--bg-glass)',
                border: isTriggered ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                fontSize: '0.82rem',
              }}>
                <span style={{ fontSize: '1.1rem', color: at?.color || 'var(--text-muted)' }}>
                  {isTriggered ? <BellRing size={16} /> : (at?.icon || <Bell size={16} />)}
                </span>
                <div style={{ flex: 1 }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{alert.crop_name}</strong>
                    {alert.market_name && <span style={{ color: 'var(--text-muted)' }}> @ {alert.market_name}</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {at?.label || alert.alert_type}
                    {alert.threshold_price && ` · TZS ${Number(alert.threshold_price).toLocaleString()}`}
                    {alert.pct_change && ` · ${alert.pct_change}%`}
                    {isTriggered && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>· TRIGGERED</span>}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => handleDelete(alert.id)}
                  style={{ padding: '4px 8px', color: 'var(--text-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}
                  title="Delete alert"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
