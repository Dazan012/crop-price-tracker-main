import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { Lock, Leaf, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ResetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState({ password: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.password || !form.confirm) {
      setError('Please fill in both fields.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ uid, token, new_password: form.password });
      setSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Invalid or expired reset link. Please request a new one.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card fade-in-up" style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={32} style={{ color: '#22c55e' }} />
          </div>
          <h2 style={{ marginBottom: 12 }}>Password Reset</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24, fontSize: '0.9rem' }}>
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
            <Lock size={16} /> Sign In Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="glass-card auth-card fade-in-up">
        <div className="auth-header">
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: '#000',
          }}>
            <Lock size={24} />
          </div>
          <h2>Set New Password</h2>
          <p>Enter your new password below</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                type={showPw.password ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                required
                autoFocus
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw({ ...showPw, password: !showPw.password })}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {showPw.password ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                type={showPw.confirm ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                placeholder="Re-enter your password"
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <Lock size={18} /> {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/forgot-password">Request a new link</Link>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to="/" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Leaf size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Back to Smart Crops
          </Link>
        </div>
      </div>
    </div>
  );
}
