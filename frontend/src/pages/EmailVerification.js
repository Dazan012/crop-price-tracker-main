import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { authAPI } from '../services/api';
import { Mail, CheckCircle, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';

export default function EmailVerification() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [sentMessage, setSentMessage] = useState('');
  const inputRefs = useRef([]);
  const cooldownTimer = useRef(null);

  /* -- Auto-send verification code on mount -- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await authAPI.sendVerification();
        if (!cancelled) setSentMessage('Verification code sent to your email.');
      } catch (err) {
        if (!cancelled) {
          const msg = err.response?.data?.detail || err.response?.data?.error || 'Failed to send verification code.';
          setError(msg);
        }
      } finally {
        setSending(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* -- Cooldown countdown timer -- */
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownTimer.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownTimer.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, [resendCooldown]);

  /* -- Auto-focus the first input on mount -- */
  useEffect(() => {
    if (!sending && !success && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [sending, success]);

  /* -- Handle input in a digit box -- */
  const handleChange = (index, value) => {
    // Only accept single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError('');

    // Auto-advance to next box
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (next.every((d) => d !== '') && digit) {
      handleVerify(next.join(''));
    }
  };

  /* -- Handle keydown (backspace navigation) -- */
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (code[index] === '' && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...code];
        next[index - 1] = '';
        setCode(next);
      } else {
        const next = [...code];
        next[index] = '';
        setCode(next);
      }
      setError('');
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  /* -- Handle paste (full code) -- */
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const next = [...code];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setCode(next);
    setError('');

    // Focus the next empty box or last box
    const nextEmpty = next.findIndex((d) => d === '');
    if (nextEmpty >= 0) {
      inputRefs.current[nextEmpty]?.focus();
    } else {
      inputRefs.current[5]?.focus();
    }

    // Auto-submit if all 6 digits pasted
    if (pasted.length === 6) {
      handleVerify(pasted);
    }
  }, [code]);

  /* -- Submit verification code -- */
  const handleVerify = async (codeStr) => {
    const finalCode = codeStr || code.join('');
    if (finalCode.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setError('');
    setVerifying(true);
    try {
      await authAPI.verifyEmail(finalCode);
      await refreshUser();
      setSuccess(true);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Invalid or expired verification code.';
      setError(msg);
      // Clear the code inputs for re-entry
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  /* -- Resend verification code -- */
  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;

    setError('');
    setResending(true);
    try {
      await authAPI.resendVerification();
      setSentMessage('A new code has been sent to your email.');
      setCode(['', '', '', '', '', '']);
      setResendCooldown(60);
      inputRefs.current[0]?.focus();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || '';
      // Check for rate limit
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '60', 10);
        setResendCooldown(retryAfter);
        setError(`Please wait before requesting another code.`);
      } else {
        setError(msg || 'Failed to resend verification code.');
      }
    } finally {
      setResending(false);
    }
  };

  /* -- Format countdown timer display -- */
  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  };

  /* ================================================================== */
  /*  SUCCESS STATE                                                      */
  /* ================================================================== */

  // Auto-redirect to dashboard once verified
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [success]);

  if (success) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-card fade-in-up" style={{ maxWidth: 460, textAlign: 'center' }}>
          <div className="auth-header">
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: 'var(--success)',
              boxShadow: '0 0 30px rgba(16, 185, 129, 0.2)',
            }}>
              <CheckCircle size={32} />
            </div>
            <h2 style={{ marginBottom: 8 }}>Account Setup Complete!</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Your email has been successfully verified. You're all set to use Smart Crops Market Tracker.
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Redirecting to dashboard...
            </p>
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/dashboard', { replace: true })}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            Continue to Dashboard <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  MAIN VERIFICATION FORM (always shown — code input visible immediately) */
  /* ================================================================== */

  return (
    <div className="auth-page">
      <div className="glass-card auth-card fade-in-up" style={{ maxWidth: 460 }}>
        <div className="auth-header">
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: '#000',
          }}>
            <Mail size={24} />
          </div>
          <h2>Verify Your Email</h2>
          <p style={{ fontSize: '0.875rem' }}>
            {sending
              ? 'Sending verification code to your email...'
              : <>We've sent a 6-digit code to{' '}
                <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {user?.email || 'your email address'}
                </strong>
                <br /><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Enter the code below when it arrives
                </span>
              </>
            }
          </p>
        </div>

        {/* Sending indicator (shown briefly while email is dispatched) */}
        {sending && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '10px 14px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: 20,
          }}>
            <div style={{
              width: 16, height: 16,
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            Sending code to {user?.email || 'your email'}...
          </div>
        )}

        {/* Sent confirmation message */}
        {sentMessage && !error && !sending && (
          <div style={{
            padding: '10px 14px', background: 'var(--success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--success)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle size={14} />
            {sentMessage}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* 6-digit code input boxes — ALWAYS VISIBLE */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          marginBottom: 24,
        }}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              disabled={verifying}
              style={{
                width: 48,
                height: 56,
                textAlign: 'center',
                fontSize: '1.4rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-input)',
                border: digit
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'all 0.2s',
                boxShadow: digit ? '0 0 0 3px var(--accent-glow)' : 'none',
                caretColor: 'var(--accent)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)';
                e.target.style.boxShadow = '0 0 0 3px var(--accent-glow)';
              }}
              onBlur={(e) => {
                if (!digit) {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.borderWidth = '1px';
                  e.target.style.boxShadow = 'none';
                }
              }}
            />
          ))}
        </div>

        {/* Verify button */}
        <button
          className="btn btn-primary btn-lg"
          onClick={() => handleVerify()}
          disabled={verifying || code.join('').length !== 6}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {verifying ? (
            <>
              <div style={{
                width: 16, height: 16,
                border: '2px solid rgba(0,0,0,0.3)',
                borderTopColor: '#000',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Verifying...
            </>
          ) : (
            <>
              <CheckCircle size={18} /> Verify Email
            </>
          )}
        </button>

        {/* Resend code */}
        <div style={{
          textAlign: 'center', marginTop: 24, paddingTop: 20,
          borderTop: '1px solid var(--border)',
        }}>
          <p style={{
            fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: 12,
          }}>
            Didn't receive the code?
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 18px',
              color: resendCooldown > 0 ? 'var(--text-faint)' : 'var(--accent)',
              fontSize: '0.825rem',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: resendCooldown > 0 || resending ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: resendCooldown > 0 ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (resendCooldown === 0 && !resending) {
                e.currentTarget.style.borderColor = 'var(--border-hover)';
                e.currentTarget.style.background = 'var(--bg-glass-light)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: resending ? 'spin 0.8s linear infinite' : 'none',
              }}
            />
            {resendCooldown > 0
              ? `Resend in ${formatCooldown(resendCooldown)}`
              : resending
                ? 'Sending...'
                : 'Resend Code'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
