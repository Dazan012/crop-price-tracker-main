import React, { useState, useEffect, memo } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, XCircle, Trash2 } from 'lucide-react';

/* Dark-mode → light-mode color map: darker shades for contrast on white */
const LIGHT_COLOR_MAP = {
  '#00d4aa': '#047857',
  '#3b82f6': '#1d4ed8',
  '#f59e0b': '#b45309',
  '#ef4444': '#dc2626',
  '#a78bfa': '#6d28d9',
  '#ec4899': '#be185d',
  '#06b6d4': '#0e7490',
  '#84cc16': '#4d7c0f',
  '#22c55e': '#15803d',
};

function useTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'dark' : 'dark'
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export const StatCard = memo(function StatCard({ label, value, change, icon, color = 'var(--accent)' }) {
  const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
  const ChangeIcon = change > 0 ? <TrendingUp size={14} /> : change < 0 ? <TrendingDown size={14} /> : <Minus size={14} />;

  const theme = useTheme();
  const isLight = theme === 'light';
  const displayColor = isLight ? (LIGHT_COLOR_MAP[color] || color) : color;
  const iconBg = isLight ? `${displayColor}18` : `${color}20`;

  return (
    <div className="glass-card stat-card fade-in">
      <div className="stat-icon" style={{ background: iconBg, color: displayColor }}>
        {icon}
      </div>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color: displayColor }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {change !== undefined && (
        <span className={`stat-change ${changeClass}`}>
          {ChangeIcon}
          {change > 0 ? '+' : ''}{change}%
        </span>
      )}
    </div>
  );
});

export const StatusBadge = memo(function StatusBadge({ status }) {
  const config = {
    approved: { icon: <CheckCircle size={12} />, cls: 'badge-success', label: 'Approved' },
    pending: { icon: <Clock size={12} />, cls: 'badge-warning', label: 'Pending' },
    rejected: { icon: <XCircle size={12} />, cls: 'badge-danger', label: 'Rejected' },
    flagged: { icon: <AlertTriangle size={12} />, cls: 'badge-danger', label: 'Flagged' },
  };
  const c = config[status] || config.pending;
  return <span className={`badge ${c.cls}`}>{c.icon} {c.label}</span>;
});

export const AnomalyBadge = memo(function AnomalyBadge({ score }) {
  if (!score && score !== 0) return <span className="badge badge-neutral">N/A</span>;
  const absScore = Math.abs(score);
  if (absScore > 4) return <span className="badge badge-danger"><AlertTriangle size={12} /> Critical ({absScore.toFixed(1)})</span>;
  if (absScore > 2.5) return <span className="badge badge-warning"><AlertTriangle size={12} /> Warning ({absScore.toFixed(1)})</span>;
  return <span className="badge badge-info"><AlertTriangle size={12} /> Low ({absScore.toFixed(1)})</span>;
});

export function PriceTable({ prices, showStatus = false, showAdminDelete = false, onDelete }) {
  if (!prices || prices.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <p>No price data available</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Crop</th>
            <th>Market</th>
            <th>Region</th>
            <th>Price (TZS)</th>
            <th>Date</th>
            {showStatus && <th>Status</th>}
            <th>Anomaly</th>
            {showAdminDelete && <th style={{ textAlign: 'center', width: 70 }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.crop_name}</strong></td>
              <td>{p.market_name}</td>
              <td><span className="badge badge-neutral">{p.region_name}</span></td>
              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {p.price != null ? Number(p.price).toLocaleString('en-TZ') : '--'}
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{p.price_date}</td>
              {showStatus && <td><StatusBadge status={p.status} /></td>}
              <td>{p.is_anomaly ? <AnomalyBadge score={p.anomaly_score} /> : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
              {showAdminDelete && (
                <td style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => onDelete && onDelete(p.id)}
                    style={{
                      background: 'rgba(199,92,77,0.08)',
                      border: '1px solid rgba(199,92,77,0.2)',
                      borderRadius: 6,
                      color: '#C75C4D',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(199,92,77,0.2)';
                      e.currentTarget.style.borderColor = 'rgba(199,92,77,0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(199,92,77,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(199,92,77,0.2)';
                    }}
                    title="Remove this entry"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const LoadingSpinner = memo(function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="loading-spinner">
      <div className="spinner" />
      <p style={{ fontSize: '0.875rem' }}>{message}</p>
    </div>
  );
});

export const PageCard = memo(function PageCard({ title, children, action, icon, className = '', style }) {
  return (
    <div className={`glass-card fade-in ${className}`} style={style}>
      {(title || action) && (
        <div className="card-header">
          {title && <h3 className="card-title">{icon} {title}</h3>}
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
});
