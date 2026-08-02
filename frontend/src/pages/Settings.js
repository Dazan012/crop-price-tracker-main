import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { authAPI, notificationAPI } from '../services/api';
import {
  Settings as SettingsIcon, User, Shield, Bell, Trash2, Mail,
  CheckCircle, AlertTriangle, Eye, EyeOff, Moon, Sun, Lock, Edit,
  Clock, Smartphone, LogIn,
} from 'lucide-react';

export default function Settings() {
  const { user, logout, refreshUser, rememberMe, checkAccountStatus } = useAuth();
  const navigate = useNavigate();

  // Login history
  const [loginHistory, setLoginHistory] = useState([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);

  // Account status
  const [accLocked, setAccLocked] = useState(false);
  const [accFailedAttempts, setAccFailedAttempts] = useState(0);

  // Theme state (mirrors the Header component approach)
  const [theme, setTheme] = useState(() => localStorage.getItem('smart-crops-theme') || 'dark');

  // Change password state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, newPw: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // Delete account states
  const [deletePw, setDeletePw] = useState('');
  const [deleteShowPw, setDeleteShowPw] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Email verification states
  const [verifySending, setVerifySending] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Notification toggles (real — synced with backend)
  const [notifications, setNotifications] = useState({
    notificationsEnabled: true,
    priceAlerts: true,
    opportunityAlerts: true,
    transportAlerts: true,
    personalizedAlerts: true,
    emailNotif: true,
    smsNotif: false,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  /* Keep theme in sync with localStorage */
  useEffect(() => {
    const handleStorage = () => {
      setTheme(localStorage.getItem('smart-crops-theme') || 'dark');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /* Load notification preferences from backend */
  useEffect(() => {
    if (!user) return;
    setNotifLoading(true);
    authAPI.getPreferences().then((res) => {
      const d = res.data;
      setNotifications({
        notificationsEnabled: d.notifications_enabled !== false,
        priceAlerts: d.price_alerts !== false,
        opportunityAlerts: d.opportunity_alerts !== false,
        transportAlerts: d.transport_alerts !== false,
        personalizedAlerts: d.personalized_alerts !== false,
        emailNotif: d.email_notifications !== false,
        smsNotif: d.sms_notifications === true,
      });
    }).catch(() => {}).finally(() => setNotifLoading(false));
  }, [user]);

  /* Save a single notification preference toggle */
  const toggleNotif = async (key, apiField) => {
    const newVal = !notifications[key];
    setNotifications((prev) => ({ ...prev, [key]: newVal }));
    setNotifSaving(true);
    try {
      await authAPI.updatePreferences({ [apiField]: newVal });
    } catch (err) {
      // Revert on failure
      setNotifications((prev) => ({ ...prev, [key]: !newVal }));
    } finally {
      setNotifSaving(false);
    }
  };

  /* Load login history and account status */
  useEffect(() => {
    if (!user) return;
    setLoginHistoryLoading(true);
    Promise.all([
      authAPI.loginHistory(),
      checkAccountStatus(),
    ]).then(([historyRes, status]) => {
      setLoginHistory(historyRes.data || []);
      if (status) {
        setAccLocked(status.account_locked);
        setAccFailedAttempts(status.failed_login_attempts);
      }
    }).catch(() => {}).finally(() => setLoginHistoryLoading(false));
  }, [user]);

  /* Auto-hide code input after successful verification */
  useEffect(() => {
    if (verifyMsg.includes('verified successfully')) {
      const timer = setTimeout(() => {
        setShowCodeInput(false);
        setVerifyMsg('');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [verifyMsg]);

  /* ---- Change Password ---- */
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      setPwError('All fields are required.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwLoading(true);
    try {
      await authAPI.changePassword({
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      });
      setPwSuccess('Password changed successfully.');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.response?.data?.current_password?.[0] ||
        'Failed to change password. Please check your current password.';
      setPwError(msg);
    } finally {
      setPwLoading(false);
    }
  };

  /* ---- Send Email Verification ---- */
  const handleSendVerification = async () => {
    setVerifyMsg('');
    setVerifySending(true);
    setVerifyCode('');
    setShowCodeInput(false);
    try {
      await authAPI.sendVerification();
      setVerifyMsg('Code sent! Enter it below.');
      setShowCodeInput(true);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Failed to send verification code.';
      setVerifyMsg(msg);
    } finally {
      setVerifySending(false);
    }
  };

  /* ---- Verify the code inline ---- */
  const handleVerifyCode = async () => {
    if (verifyCode.length !== 6) {
      setVerifyMsg('Please enter the full 6-digit code.');
      return;
    }
    setVerifySending(true);
    setVerifyMsg('');
    try {
      await authAPI.verifyEmail(verifyCode);
      await refreshUser();
      setVerifyMsg('Email verified successfully!');
      setShowCodeInput(false);
      setVerifyCode('');
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Invalid or expired code.';
      setVerifyMsg(msg);
      setVerifyCode('');
    } finally {
      setVerifySending(false);
    }
  };

  /* ---- Delete Account (step 1: show confirm dialog) ---- */
  const handleDeleteRequest = () => {
    setDeleteError('');
    if (!deletePw) {
      setDeleteError('Please enter your password to confirm deletion.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  /* ---- Delete Account (step 2: final deletion) ---- */
  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await authAPI.deleteAccount(deletePw);
      // Properly clear auth state (token + user in React state + localStorage)
      await logout();
      navigate('/');
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Failed to delete account. Please check your password.';
      setDeleteError(msg);
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ---- Helpers ---- */
  const roleLabel = (role) => {
    const labels = { farmer: 'Farmer', trader: 'Trader', agent: 'Agent', admin: 'Administrator', general: 'General' };
    return labels[role] || role || 'Unknown';
  };

  if (!user) return null;

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><SettingsIcon size={28} /> Settings</h1>
          <p>Manage your profile, security, and preferences</p>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  PROFILE SECTION                                              */}
      {/* ============================================================ */}
      <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <User size={20} style={{ color: 'var(--accent)' }} />
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Profile</h2>
        </div>

        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 700, color: '#000', flexShrink: 0,
          }}>
            {user.first_name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user.first_name || user.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                : user.username}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              @{user.username}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/edit-profile')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Edit size={14} /> Edit Profile
          </button>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <InfoField label="Email" value={user.email || '—'} />
          <InfoField label="Username" value={user.username || '—'} />
          <InfoField label="Role" value={roleLabel(user.role)} />

          {/* Email verification status */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Email Status
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user.email_verified ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: '0.875rem', fontWeight: 500 }}>
                  <CheckCircle size={15} /> Verified
                </span>
              ) : (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warning)', fontSize: '0.875rem', fontWeight: 500 }}>
                    <AlertTriangle size={15} /> Unverified
                  </span>
                  {!showCodeInput && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendVerification}
                      disabled={verifySending}
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                    >
                      <Mail size={13} />
                      {verifySending ? 'Sending...' : 'Verify'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Inline code input — shown after clicking Verify */}
            {showCodeInput && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input
                  className="form-control"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 160, fontSize: '0.85rem', padding: '6px 10px', letterSpacing: '0.15em' }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleVerifyCode}
                  disabled={verifySending || verifyCode.length !== 6}
                  style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                >
                  {verifySending ? 'Verifying...' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={verifySending}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'underline',
                  }}
                >
                  Resend
                </button>
              </div>
            )}

            {/* Verification message — green for success, red for error */}
            {verifyMsg && (
              <div style={{
                fontSize: '0.8rem',
                color: verifyMsg.toLowerCase().includes('verified successfully')
                  ? 'var(--success)'
                  : verifyMsg.toLowerCase().includes('invalid') || verifyMsg.toLowerCase().includes('expired') || verifyMsg.toLowerCase().includes('failed') || verifyMsg.toLowerCase().includes('please enter')
                    ? 'var(--danger)'
                    : 'var(--text-secondary)',
                marginTop: 6,
              }}>
                {verifyMsg}
              </div>
            )}
          </div>

          {/* Role-specific fields */}
          {user.region && <InfoField label="Region" value={user.region} />}
          {user.main_crops && <InfoField label="Main Crops" value={user.main_crops} />}
          {user.farm_size != null && <InfoField label="Farm Size" value={`${user.farm_size} acres`} />}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  ACCOUNT SECURITY SECTION                                     */}
      {/* ============================================================ */}
      <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Shield size={20} style={{ color: 'var(--accent)' }} />
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Account Security</h2>
        </div>

        {/* Change Password */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 16, color: 'var(--text-primary)' }}>
            <Lock size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Change Password
          </h3>

          {pwError && (
            <div style={{
              padding: '10px 14px', background: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div style={{
              padding: '10px 14px', background: 'var(--success-bg)',
              border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem', color: 'var(--success)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CheckCircle size={14} />
              {pwSuccess}
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              {/* Current Password */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    type={pwShow.current ? 'text' : 'password'}
                    value={pwForm.current}
                    onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, current: !pwShow.current })}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 2 }}
                  >
                    {pwShow.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    type={pwShow.newPw ? 'text' : 'password'}
                    value={pwForm.newPw}
                    onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, newPw: !pwShow.newPw })}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 2 }}
                  >
                    {pwShow.newPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    type={pwShow.confirm ? 'text' : 'password'}
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, confirm: !pwShow.confirm })}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 2 }}
                  >
                    {pwShow.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={pwLoading}>
              {pwLoading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* ---- Security Monitoring ---- */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 16, color: 'var(--text-primary)' }}>
            <Clock size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Login Activity & Security
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Remember Me</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, color: rememberMe ? 'var(--success)' : 'var(--text-secondary)' }}>
                {rememberMe ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account Status</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, color: accLocked ? 'var(--danger)' : 'var(--success)' }}>
                {accLocked ? 'Locked' : 'Active'}
              </div>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Failed Attempts</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, color: accFailedAttempts >= 3 ? 'var(--warning)' : 'var(--text-primary)' }}>
                {accFailedAttempts} / 5
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Recent login attempts (last 20):
          </p>

          {loginHistoryLoading ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading...</p>
          ) : loginHistory.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No login history available.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: '0.8rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Date & Time</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Method</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {loginHistory.map((attempt, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          color: attempt.success ? 'var(--success)' : 'var(--danger)',
                          fontWeight: 500,
                        }}>
                          {attempt.success ? <LogIn size={12} /> : <AlertTriangle size={12} />}
                          {attempt.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>
                        {new Date(attempt.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Smartphone size={12} />
                          {attempt.attempt_method === 'password' ? 'Password' :
                           attempt.attempt_method === 'magic_link' ? 'Magic Link' :
                           attempt.attempt_method === 'phone_otp' ? 'Phone OTP' :
                           attempt.attempt_method === 'google' ? 'Google' : attempt.attempt_method}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {attempt.ip_address || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---- Delete Account (Danger Zone) ---- */}
        <div style={{
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          background: 'rgba(239, 68, 68, 0.04)',
        }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 8, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={16} />
            Danger Zone — Delete Account
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            This action is <strong>permanent and irreversible</strong>. Deleting your account will remove all your data,
            including your profile, submissions, alerts, and preferences. You will not be able to recover your account.
          </p>

          {deleteError && (
            <div style={{
              padding: '10px 14px', background: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              {deleteError}
            </div>
          )}

          {!showDeleteConfirm ? (
            <div>
              <div className="form-group" style={{ marginBottom: 16, maxWidth: 320 }}>
                <label>Confirm your password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    type={deleteShowPw ? 'text' : 'password'}
                    value={deletePw}
                    onChange={(e) => setDeletePw(e.target.value)}
                    placeholder="Enter your password"
                    style={{ paddingRight: 40, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setDeleteShowPw(!deleteShowPw)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 2 }}
                  >
                    {deleteShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button
                className="btn btn-danger"
                onClick={handleDeleteRequest}
                disabled={!deletePw}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  cursor: deletePw ? 'pointer' : 'not-allowed',
                  opacity: deletePw ? 1 : 0.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.875rem',
                }}
              >
                <Trash2 size={16} />
                Delete My Account
              </button>
            </div>
          ) : (
            /* Confirmation dialog */
            <div style={{
              padding: 20,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                <strong style={{ color: '#ef4444', fontSize: '0.95rem' }}>Are you absolutely sure?</strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                This will permanently delete the account <strong style={{ color: 'var(--text-primary)' }}>@{user.username}</strong> and
                all associated data. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleteLoading}
                  style={{
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.875rem',
                    opacity: deleteLoading ? 0.7 : 1,
                  }}
                >
                  {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  NOTIFICATION PREFERENCES                                     */}
      {/* ============================================================ */}
      <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Notification Preferences</h2>
          </div>
          {notifSaving && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Saving...</span>
          )}
        </div>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Control which notifications you receive. Changes are saved automatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Master switch */}
          <div style={{
            padding: '14px 16px', borderRadius: 'var(--radius-sm)',
            background: notifications.notificationsEnabled ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
            border: `1px solid ${notifications.notificationsEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
          }}>
            <ToggleRow
              label="Enable Notifications"
              description={notifications.notificationsEnabled
                ? 'You will receive notifications based on your preferences below'
                : 'All notifications are disabled — the bell icon will be muted'}
              checked={notifications.notificationsEnabled}
              onChange={() => toggleNotif('notificationsEnabled', 'notifications_enabled')}
            />
          </div>

          {/* Granular toggles — only shown when master is on */}
          {notifications.notificationsEnabled && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              marginLeft: 8, paddingLeft: 16,
              borderLeft: '2px solid var(--border)',
            }}>
              <ToggleRow
                label="Price Alerts"
                description="Get notified when crop prices change significantly (≥10% in 24h)"
                checked={notifications.priceAlerts}
                onChange={() => toggleNotif('priceAlerts', 'price_alerts')}
              />
              <ToggleRow
                label="Market Opportunities"
                description="Arbitrage alerts when price difference exceeds TZS 200/kg between regions"
                checked={notifications.opportunityAlerts}
                onChange={() => toggleNotif('opportunityAlerts', 'opportunity_alerts')}
              />
              <ToggleRow
                label="Transport Alerts"
                description="Notifications when transport costs change by more than 15%"
                checked={notifications.transportAlerts}
                onChange={() => toggleNotif('transportAlerts', 'transport_alerts')}
              />
              <ToggleRow
                label="Personalized Alerts"
                description="Updates tailored to your tracked crops and regions"
                checked={notifications.personalizedAlerts}
                onChange={() => toggleNotif('personalizedAlerts', 'personalized_alerts')}
              />

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <ToggleRow
                label="Email Notifications"
                description="Receive notification summaries via email"
                checked={notifications.emailNotif}
                onChange={() => toggleNotif('emailNotif', 'email_notifications')}
              />
              <ToggleRow
                label="SMS Notifications"
                description="Receive critical (high priority) alerts via text message"
                checked={notifications.smsNotif}
                onChange={() => toggleNotif('smsNotif', 'sms_notifications')}
              />
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  THEME SETTINGS                                               */}
      {/* ============================================================ */}
      <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {theme === 'dark' ? <Moon size={20} style={{ color: 'var(--accent)' }} /> : <Sun size={20} style={{ color: 'var(--accent)' }} />}
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Theme</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 360 }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              You can also toggle the theme from the header.
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
          }}>
            {theme === 'dark' ? <Moon size={16} style={{ color: 'var(--accent)' }} /> : <Sun size={16} style={{ color: 'var(--warning)' }} />}
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  SUB-COMPONENTS                                                       */
/* ==================================================================== */

function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: checked ? 'var(--accent)' : 'var(--border)',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}
