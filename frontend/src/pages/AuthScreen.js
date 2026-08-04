import { useState, useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { Leaf, Mail, Phone, Lock, User, ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function AuthScreen() {
  const { isAuthenticated, onboardingComplete, login, googleAuth, googleAuthWithCode, sendPhoneCode, verifyPhoneCode, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | 'email' | 'phone'
  const [error, setError] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [gsReady, setGsReady] = useState(false);

  // Email/password login state
  const [identifier, setIdentifier] = useState(''); // username or email
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState(null);
  const codeRefs = useRef([]);
  const googleInitRef = useRef(false);
  const googleRetryRef = useRef(0);
  const googleButtonRef = useRef(null);


  // Countdown timer for phone OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Google Identity Services (ID token flow — no client_secret needed)
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleInitRef.current) return;
    if (!window.google?.accounts?.id) {
      // GSI script loads async; retry until it's ready.
      if (googleRetryRef.current < 20) {
        googleRetryRef.current += 1;
        setTimeout(initGoogle, 250);
      }
      return;
    }
    initGoogle();
    function initGoogle() {
      if (!window.google?.accounts?.id || googleInitRef.current) return;
      googleInitRef.current = true;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: 'popup',
        callback: handleCredentialResponse,
      });
      setGsReady(true);
    }
    return () => {
      window.google?.accounts?.id?.disableAutoSelect();
    };
  }, []);

  // Render the GSI button once GSI is ready, and re-render on card remount (mode changes)
  useEffect(() => {
    if (!gsReady || !googleButtonRef.current) return;
    if (!window.google?.accounts?.id) return;
    const container = googleButtonRef.current;
    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 400,
      locale: 'en',
    });
  }, [gsReady, mode]);

  const redirectAfterAuth = (result) => {
    if (!result.onboardingComplete) {
      navigate('/onboarding');
    } else if (result.hasPassword === false) {
      localStorage.removeItem('skip_password_setup');
      navigate('/setup-password');
    } else {
      navigate('/dashboard');
    }
  };

  const handleCredentialResponse = async (response) => {
    if (!response?.credential) return;
    setError('');
    setLoadingAction(true);
    try {
      const result = await googleAuth(response.credential);
      redirectAfterAuth(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed. Please try another method.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleGoogleClick = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured yet. Please contact the administrator.');
      return;
    }
    setError('');
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google sign-in is still loading. Please try again.');
    }
  };


  // Redirect if already authenticated
  if (!loading && isAuthenticated) {
    if (!onboardingComplete) return <Navigate to="/onboarding" />;
    return <Navigate to="/dashboard" />;
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your username or email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError('');
    setLoadingAction(true);
    try {
      const result = await login(identifier.trim(), password);
      redirectAfterAuth(result);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.non_field_errors?.[0] || 'Invalid credentials. Please check your username/email and password.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendPhoneCode = async (e) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length < 9) {
      setError('Please enter a valid phone number.');
      return;
    }
    setError('');
    setLoadingAction(true);
    try {
      const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `+255${cleanPhone.replace(/^0+/, '')}`;
      const res = await sendPhoneCode(fullPhone);
      setPhoneCodeSent(true);
      setCountdown(60);
      setDevCode(res.dev_code || null);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send verification code.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-advance to next input
    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newCode.every(d => d !== '') && newCode.join('').length === 6) {
      handleVerifyPhoneCode(newCode.join(''));
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      codeRefs.current[5]?.focus();
      handleVerifyPhoneCode(pasted);
    }
  };

  const handleVerifyPhoneCode = async (codeStr) => {
    setError('');
    setLoadingAction(true);
    try {
      const cleanPhone = phone.replace(/\s/g, '');
      const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `+255${cleanPhone.replace(/^0+/, '')}`;
      const result = await verifyPhoneCode(fullPhone, codeStr);
      redirectAfterAuth(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired code.');
      setCode(['', '', '', '', '', '']);
      codeRefs.current[0]?.focus();
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    await handleSendPhoneCode({ preventDefault: () => { } });
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="glass-card auth-card fade-in-up" style={{ maxWidth: 440 }}>
        {/* Header */}
        <div className="auth-header" style={{ marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-md)',
            background: 'var(--sprout-dim)',
            border: '1px solid rgba(95,182,125,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'var(--sprout)',
          }}>
            <Leaf size={28} />
          </div>
          <h2 style={{ marginBottom: 4, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Smart Crops</h2>
          <p style={{ color: 'var(--husk-muted)', fontSize: '0.9rem' }}>
            Market Price Tracker for Tanzania
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* ── Default: Show auth options ── */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Sign In
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: 4 }}>
                Sign in with your preferred method, or create a new account if you are not registered yet.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Google Sign-In (ID token flow — no client_secret needed) */}
              <div className="auth-google-wrapper">
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  className="btn btn-secondary"
                  disabled={loadingAction}
                  style={{
                    width: '100%', justifyContent: 'center', padding: '14px 20px',
                    fontSize: '0.95rem', fontWeight: 600,
                  }}
                >
                  {loadingAction ? (
                    <div className="spinner" style={{ width: 18, height: 18, marginRight: 10 }} />
                  ) : (
                    <svg viewBox="0 0 48 48" width="18" height="18" style={{ marginRight: 10 }}>
                      <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.2-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  )}
                  {loadingAction ? 'Signing in...' : 'Continue with Google'}
                </button>
                <div ref={googleButtonRef} className="auth-google-button" aria-hidden="true" />
              </div>

              <button
                onClick={() => { setMode('phone'); setError(''); }}
                className="btn btn-primary"
                disabled={loadingAction}
                style={{
                  width: '100%', justifyContent: 'center', padding: '14px 20px',
                  fontSize: '0.95rem', fontWeight: 600,
                }}
              >
                <Phone size={18} style={{ marginRight: 10 }} />
                Continue with Phone
              </button>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0',
                color: 'var(--text-muted)', fontSize: '0.8rem',
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <button
                onClick={() => { setMode('email'); setError(''); }}
                className="btn btn-secondary"
                disabled={loadingAction}
                style={{
                  width: '100%', justifyContent: 'center', padding: '14px 20px',
                  fontSize: '0.95rem', fontWeight: 600,
                }}
              >
                <Mail size={18} style={{ marginRight: 10 }} />
                Continue with Email
              </button>
            </div>
          </div>
        )}

        {/* ── Email / Password Login Flow ── */}
        {mode === 'email' && (
          <form onSubmit={handleEmailLogin}>
            <button
              type="button"
              onClick={() => { setMode(null); setError(''); setIdentifier(''); setPassword(''); }}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.85rem', marginBottom: 16, padding: 0,
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              Sign in with your username or email and password.
            </p>

            {/* Username / Email */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Username or Email</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
                }}>
                  <User size={16} />
                </span>
                <input
                  className="form-control"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="your_username or you@example.com"
                  autoFocus
                  autoComplete="username"
                  required
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
                }}>
                  <Lock size={16} />
                </span>
                <input
                  className="form-control"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  style={{ paddingLeft: 38, paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-primary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loadingAction}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <CheckCircle size={18} />
              {loadingAction ? 'Signing in...' : 'Sign In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none' }}>
                Forgot your password?
              </Link>
              <Link to="/register" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                Register account
              </Link>
            </div>
          </form>
        )}

        {/* ── Phone OTP Flow ── */}
        {mode === 'phone' && !phoneCodeSent && (
          <form onSubmit={handleSendPhoneCode}>
            <button
              type="button"
              onClick={() => { setMode(null); setError(''); }}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.85rem', marginBottom: 16, padding: 0,
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Enter your phone number and we'll send you a verification code.
            </p>
            <div className="form-group">
              <label>Phone number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  padding: '10px 12px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: '1.1rem' }}>🇹🇿</span> +255
                </div>
                <input
                  className="form-control"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="7XX XXX XXX"
                  autoFocus
                  required
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loadingAction} style={{ width: '100%', justifyContent: 'center' }}>
              <Phone size={18} /> {loadingAction ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {mode === 'phone' && phoneCodeSent && (
          <div>
            <button
              type="button"
              onClick={() => { setPhoneCodeSent(false); setCode(['', '', '', '', '', '']); setMode(null); setError(''); setDevCode(null); }}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.85rem', marginBottom: 16, padding: 0,
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>
              Enter the 6-digit code sent to
            </p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, textAlign: 'center', marginBottom: 20 }}>
              +255 {phone.replace(/\s/g, '')}
            </p>

            {devCode && (
              <div style={{
                padding: '8px 12px', background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem', color: '#3b82f6', textAlign: 'center', marginBottom: 16,
              }}>
                Dev mode — your code is: <strong>{devCode}</strong>
              </div>
            )}

            {/* 6-digit OTP input */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { codeRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  disabled={loadingAction}
                  style={{
                    width: 44, height: 52, textAlign: 'center', fontSize: '1.3rem',
                    fontWeight: 700, borderRadius: 'var(--radius-sm)',
                    border: '2px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text)', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              ))}
            </div>

            {loadingAction && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>Verifying...</p>
              </div>
            )}

            {/* Resend */}
            <div style={{ textAlign: 'center' }}>
              {countdown > 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Resend code in {countdown}s
                </p>
              ) : (
                <button
                  onClick={handleResendCode}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent)',
                    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                  }}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 28, paddingTop: 20,
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            By continuing, you agree to Smart Crops' Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}