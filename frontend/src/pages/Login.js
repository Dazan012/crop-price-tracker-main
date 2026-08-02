import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { LogIn, Leaf, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(null);

  if (isAuthenticated) return <Navigate to="/dashboard" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password, rememberMe);
    } catch (err) {
      const data = err.response?.data;
      if (data?.account_locked) {
        setIsLocked(true);
        setError(data.error || 'Account is locked due to too many failed attempts.');
      } else {
        setError(data?.error || 'Login failed. Check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

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
            <Leaf size={24} />
          </div>
          <h2>Welcome Back</h2>
          <p>Sign in to Smart Crops Market Tracker</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: isLocked ? 'var(--warning-bg, #fff3cd)' : 'var(--danger-bg)',
            border: `1px solid ${isLocked ? 'rgba(255,193,7,0.3)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: isLocked ? 'var(--warning, #856404)' : 'var(--danger)',
            marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {isLocked ? <Lock size={14} /> : <AlertTriangle size={14} />}
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              className="form-control"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Enter your username"
              autoComplete="username"
              name="username"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter your password"
                autoComplete="current-password"
                name="password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <input
              type="checkbox"
              id="remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="remember-me" style={{ fontSize: '0.85rem', cursor: 'pointer', margin: 0 }}>
              Remember me
            </label>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <LogIn size={18} /> {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none' }}>
            Forgot your password?
          </Link>
        </div>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>

        <div style={{
          marginTop: 24, padding: '16px', background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Contact your administrator for account access.
          </p>
        </div>
      </div>
    </div>
  );
}
