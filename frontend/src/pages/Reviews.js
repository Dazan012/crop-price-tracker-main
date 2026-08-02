import { useState, useEffect } from 'react';
import { reviewAPI } from '../services/api';
import { AnomalyBadge, LoadingSpinner, PageCard } from '../components/Shared';
import { useAuth } from '../services/AuthContext';
import { ClipboardCheck, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function Reviews() {
  const { canReview, isAdmin } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    reviewAPI.list()
      .then(res => setReviews(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleReview = async (id, action) => {
    setProcessing(id);
    try {
      await reviewAPI.review(id, { action, reason });
      setReviews(prev => prev.filter(r => r.id !== id));
      setReason('');
    } catch (err) {
      alert(err.response?.data?.error || 'Review failed');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) return <LoadingSpinner message="Loading review queue..." />;

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><ClipboardCheck size={28} /> Review Queue</h1>
          <p>Approve or reject flagged price entries</p>
        </div>
        <span className="badge badge-warning">{reviews.length} pending</span>
      </div>

      {reviews.length === 0 ? (
        <div className="glass-card fade-in" style={{ padding: 60, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)', opacity: 0.5, marginBottom: 16 }} />
          <h2>All Clear!</h2>
          <p style={{ marginTop: 8 }}>No entries pending review</p>
        </div>
      ) : (
        reviews.map(entry => (
          <div key={entry.id} className="glass-card review-card fade-in">
            <div className="review-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
                <div>
                  <h3>{entry.crop_name} @ {entry.market_name}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{entry.region_name}</span>
                </div>
              </div>
              <AnomalyBadge score={entry.anomaly_score} />
            </div>

            <div className="review-meta">
              <span>Price: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                TZS {Number(entry.price).toLocaleString()}
              </strong></span>
              <span>Date: <strong>{entry.price_date}</strong></span>
              <span>Submitted by: <strong>{entry.submitted_by_name || 'Unknown'}</strong></span>
              <span>Status: <strong style={{ color: 'var(--warning)' }}>{entry.status}</strong></span>
            </div>

            {entry.anomaly_reason && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.825rem',
                color: 'var(--text-secondary)',
                marginBottom: 16,
                borderLeft: '3px solid var(--warning)',
              }}>
                {entry.anomaly_reason}
              </div>
            )}

            {isAdmin ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="form-control"
                  placeholder="Review note (optional)..."
                  value={processing === entry.id ? reason : ''}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: '8px 12px' }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleReview(entry.id, 'approve')}
                  disabled={processing === entry.id}
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleReview(entry.id, 'reject')}
                  disabled={processing === entry.id}
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            ) : (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.18)',
                fontSize: '0.825rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}>
                View only — admin access required
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
