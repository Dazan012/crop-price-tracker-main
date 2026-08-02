import { useState, useEffect } from 'react';
import { anomalyAPI, reviewAPI } from '../services/api';
import { AnomalyBadge, LoadingSpinner, PageCard } from '../components/Shared';
import { useAuth } from '../services/AuthContext';
import { AlertTriangle, Shield, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

export default function Anomalies() {
  const { isAdmin } = useAuth();
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [processing, setProcessing] = useState(null);
  const [reason, setReason] = useState('');

  const handleReview = async (id, action) => {
    setProcessing(id);
    try {
      await reviewAPI.review(id, { action, reason });
      setAnomalies(prev => prev.filter(a => a.id !== id));
      setReason('');
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  useEffect(() => {
    anomalyAPI.list()
      .then(res => setAnomalies(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? anomalies
    : filter === 'critical'
      ? anomalies.filter(a => Math.abs(a.anomaly_score || 0) > 4)
      : filter === 'warning'
        ? anomalies.filter(a => {
            const s = Math.abs(a.anomaly_score || 0);
            return s > 2.5 && s <= 4;
          })
        : anomalies.filter(a => Math.abs(a.anomaly_score || 0) <= 2.5);

  const criticalCount = anomalies.filter(a => Math.abs(a.anomaly_score || 0) > 4).length;
  const warningCount = anomalies.filter(a => {
    const s = Math.abs(a.anomaly_score || 0);
    return s > 2.5 && s <= 4;
  }).length;

  if (loading) return <LoadingSpinner message="Loading anomalies..." />;

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><AlertTriangle size={28} style={{ color: 'var(--warning)' }} /> Anomaly Detection</h1>
          <p>Price entries flagged by the anomaly detection system</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-danger">{anomalies.length} Flagged</span>
          <span className="badge badge-neutral">{criticalCount} Critical</span>
        </div>
      </div>

      <div className="tab-bar fade-in">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All ({anomalies.length})
        </button>
        <button className={filter === 'critical' ? 'active' : ''} onClick={() => setFilter('critical')}>
          Critical ({criticalCount})
        </button>
        <button className={filter === 'warning' ? 'active' : ''} onClick={() => setFilter('warning')}>
          Warning ({warningCount})
        </button>
      </div>

      <PageCard title="Flagged Entries" icon={<Shield size={18} />}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✓</div>
            <p>No anomalies in this category</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Crop</th>
                  <th>Market</th>
                  <th>Price (TZS)</th>
                  <th>Date</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td><AnomalyBadge score={a.anomaly_score} /></td>
                    <td><strong>{a.crop_name}</strong></td>
                    <td>{a.market_name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--danger)' }}>
                      {Number(a.price).toLocaleString()}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{a.price_date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {a.anomaly_score?.toFixed(3) || '—'}
                    </td>
                    <td>
                      <span className={`badge ${a.status === 'flagged' ? 'badge-danger' : 'badge-warning'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {a.anomaly_reason?.slice(0, 80) || '—'}
                    </td>
                    <td>
                      {isAdmin ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleReview(a.id, 'approve')}
                            disabled={processing === a.id}
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            <CheckCircle size={12} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleReview(a.id, 'reject')}
                            disabled={processing === a.id}
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            <XCircle size={12} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          View only — admin access required
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  );
}
