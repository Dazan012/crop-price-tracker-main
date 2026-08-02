import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { Leaf, AlertCircle } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyMagicLink } = useAuth();

  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg('No sign-in token found in this link.');
      return;
    }

    let cancelled = false;
    const verify = async () => {
      try {
        const result = await verifyMagicLink(token);
        if (cancelled) return;
        setStatus('success');
        // Brief delay to show success message before redirect
        setTimeout(() => {
          if (cancelled) return;
          if (!result.onboardingComplete) {
            navigate('/onboarding', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        }, 1200);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'This link has expired or already been used.');
      }
    };
    verify();

    return () => { cancelled = true; };
  }, [searchParams, verifyMagicLink, navigate]);

  return (
    <div className="auth-page" style={{ minHeight: '100vh' }}>
      <div className="glass-card auth-card fade-in-up" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', color: '#000',
        }}>
          <Leaf size={24} />
        </div>

        {status === 'verifying' && (
          <>
            <div className="spinner" style={{ margin: '20px auto' }} />
            <h3 style={{ marginBottom: 8 }}>Signing you in...</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Verifying your sign-in link. This will only take a moment.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              margin: '20px auto 16px', color: '#22c55e',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ marginBottom: 8 }}>You're signed in!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Redirecting you to Smart Crops...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              margin: '20px auto 16px', color: '#ef4444',
            }}>
              <AlertCircle size={28} />
            </div>
            <h3 style={{ marginBottom: 8 }}>Unable to sign in</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
              {errorMsg}
            </p>
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
            >
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
