import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { Lock, Leaf, Eye, EyeOff, CheckCircle, AlertTriangle, KeyRound } from 'lucide-react';

const PASSWORD_CHECKS = [
  { test: (pw) => pw.length >= 8, label: 'At least 8 characters' },
  { test: (pw) => /[A-Z]/.test(pw), label: 'One uppercase letter (A-Z)' },
  { test: (pw) => /[a-z]/.test(pw), label: 'One lowercase letter (a-z)' },
  { test: (pw) => /\d/.test(pw), label: 'One number (0-9)' },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), label: 'One special character (!@#$...)' },
];

export default function SetupPassword() {
  const { setPassword } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState({ password: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passedChecks = PASSWORD_CHECKS.filter((c) => c.test(form.password)).length;
  const strength = Math.round((passedChecks / PASSWORD_CHECKS.length) * 100);
  const strengthColor = strength >= 80 ? '#22c55e' : strength >= 40 ? '#f59e0b' : '#ef4444';

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
      await setPassword(form.password, form.confirm);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('skip_password_setup', '1');
    navigate('/dashboard');
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
          <h2 style={{ marginBottom: 12 }}>Password Set!</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24, fontSize: '0.9rem' }}>
            Your password has been set successfully. You can now sign in with your email and password anytime.
          </p>
          <button className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => navigate('/dashboard')}>
            <CheckCircle size={16} /> Go to Dashboard
          </button>
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
            <KeyRound size={24} />
          </div>
          <h2>Set Up a Password</h2>
          <p>Create a password so you can sign in with email &amp; password later.</p>
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
                autoComplete="new-password"
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

          {form.password && (
            <div style={{ margin: '-6px 0 14px' }}>
              <div style={{
                height: 4, borderRadius: 2, background: 'var(--border)',
                overflow: 'hidden', marginBottom: 8,
              }}>
                <div style={{
                  height: '100%', width: `${strength}%`,
                  background: strengthColor, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                {PASSWORD_CHECKS.map((c) => {
                  const ok = c.test(form.password);
                  return (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: ok ? '#22c55e' : 'var(--text-muted)' }}>
                      <CheckCircle size={11} />
                      {c.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                autoComplete="new-password"
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
            <Lock size={18} /> {loading ? 'Saving...' : 'Set Password'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline',
            }}
          >
            Skip for now
          </button>
        </div>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Link to="/" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Leaf size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Back to Smart Crops
          </Link>
        </div>
      </div>
    </div>
  );
}
