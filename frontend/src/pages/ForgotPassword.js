import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { KeyRound, Leaf, ArrowLeft, Mail, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      // Even on error, show success message (don't reveal if email exists)
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
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
          <h2 style={{ marginBottom: 12 }}>Check Your Email</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24, fontSize: '0.9rem' }}>
            If an account exists with <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>,
            we've sent a password reset link. Click the link in the email to set a new password.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 24 }}>
            The link expires in 24 hours. Check your spam folder if you don't see it.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
            <ArrowLeft size={16} /> Back to Sign In
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
            <KeyRound size={24} />
          </div>
          <h2>Forgot Password</h2>
          <p>Enter your email address and we'll send you a reset link</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-primary)' }} />
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ paddingLeft: 36 }}
                required
                autoFocus
              />
            </div>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <Mail size={18} /> {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="auth-footer">
          Remember your password? <Link to="/login">Sign In</Link>
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
