import { useState, useEffect } from 'react';
import { agentAPI } from '../services/api';
import { LoadingSpinner, PageCard } from '../components/Shared';
import { useAuth } from '../services/AuthContext';
import {
  ShieldCheck, CheckCircle, XCircle, User, MapPin, Clock,
  AlertTriangle, Users
} from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function AgentApproval() {
  const { isAdmin } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [reasons, setReasons] = useState({});
  const [totalReviewed, setTotalReviewed] = useState(0);

  useEffect(() => {
    agentAPI.pending()
      .then(res => setAgents(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (userId, action) => {
    setProcessing(userId);
    try {
      await agentAPI.approve(userId, { action, reason: reasons[userId] || '' });
      setAgents(prev => prev.filter(a => a.id !== userId));
      setTotalReviewed(prev => prev + 1);
      setReasons(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action} agent`);
    } finally {
      setProcessing(null);
    }
  };

  const setReason = (userId, value) => {
    setReasons(prev => ({ ...prev, [userId]: value }));
  };

  if (!isAdmin) return <Navigate to="/dashboard" />;
  if (loading) return <LoadingSpinner message="Loading pending agents..." />;

  const avatarGradients = [
    'linear-gradient(135deg, #00d4aa, #059669)',
    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    'linear-gradient(135deg, #ec4899, #be185d)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
  ];

  const getGradient = (name) => {
    const index = (name || 'A').charCodeAt(0) % avatarGradients.length;
    return avatarGradients[index];
  };

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><ShieldCheck size={28} /> Agent Approval</h1>
          <p>Review and approve pending market agent registrations</p>
        </div>
        <span className="badge badge-warning">
          <Clock size={12} /> {agents.length} pending
        </span>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="glass-card stat-card fade-in">
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
            <Users size={20} />
          </div>
          <span className="stat-label">Pending Agents</span>
          <span className="stat-value">{agents.length}</span>
        </div>
        <div className="glass-card stat-card fade-in">
          <div className="stat-icon" style={{ background: 'rgba(0, 212, 170, 0.12)', color: '#00d4aa' }}>
            <ShieldCheck size={20} />
          </div>
          <span className="stat-label">Total Reviewed</span>
          <span className="stat-value">{totalReviewed}</span>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="glass-card fade-in" style={{ padding: 60, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)', opacity: 0.5, marginBottom: 16 }} />
          <h2>All Clear!</h2>
          <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>No agents pending approval</p>
        </div>
      ) : (
        agents.map(agent => (
          <div key={agent.id} className="glass-card fade-in" style={{ marginBottom: 16 }}>
            {/* Agent header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: getGradient(agent.username),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1.2rem',
                flexShrink: 0,
                textTransform: 'uppercase',
              }}>
                {(agent.username || 'U')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {agent.first_name} {agent.last_name}
                </h3>
                <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  @{agent.username}
                </span>
              </div>
              <span className="badge badge-warning">
                <Clock size={12} /> Pending
              </span>
            </div>

            {/* Agent details grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}>
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '3px solid var(--accent)',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  Contact
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {agent.email}
                </div>
                {agent.phone && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {agent.phone}
                  </div>
                )}
              </div>

              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '3px solid #3b82f6',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={10} /> Location
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {agent.region}{agent.district ? `, ${agent.district}` : ''}
                </div>
                {agent.assigned_market_name && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Market: <strong style={{ color: 'var(--text-primary)' }}>{agent.assigned_market_name}</strong>
                  </div>
                )}
              </div>

              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '3px solid #8b5cf6',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <User size={10} /> ID Verification
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {agent.id_verification || 'Not provided'}
                </div>
              </div>

              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '3px solid #14b8a6',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={10} /> Experience
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {agent.experience || 'Not specified'}
                </div>
              </div>
            </div>

            {/* Registration date */}
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <Clock size={13} />
              Registered on {agent.date_joined}
            </div>

            {/* Action row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="form-control"
                placeholder="Reason (optional)..."
                value={reasons[agent.id] || ''}
                onChange={(e) => setReason(agent.id, e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: '8px 12px' }}
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                onClick={() => handleAction(agent.id, 'approve')}
                disabled={processing === agent.id}
              >
                <CheckCircle size={14} /> Approve
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleAction(agent.id, 'reject')}
                disabled={processing === agent.id}
              >
                <XCircle size={14} /> Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
