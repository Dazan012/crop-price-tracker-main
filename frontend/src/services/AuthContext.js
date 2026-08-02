import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember_me') === 'true');
  const [accountLocked, setAccountLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);

  // Session-first: check localStorage on every app load, before ANY UI renders
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedRemember = localStorage.getItem('remember_me') === 'true';
    setRememberMe(savedRemember);

    if (savedToken && savedUser) {
      // If Remember Me is not enabled, clear session on browser close (hard refresh only)
      if (!savedRemember) {
        // Check sessionStorage as session indicator
        const sessionToken = sessionStorage.getItem('session_token');
        if (!sessionToken) {
          // New browser session — clear and redirect
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setLoading(false);
          return;
        }
      }

      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch {
        localStorage.clear();
        setLoading(false);
        return;
      }
      // Validate the token server-side on app mount
      authAPI.me()
        .then((res) => {
          const freshUser = res.data;
          localStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  // Helper: store token + user after any successful auth
  const _storeSession = (newToken, newUser, remember = false) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('remember_me', remember ? 'true' : 'false');
    // Set sessionStorage indicator for session-only mode
    sessionStorage.setItem('session_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setRememberMe(remember);
  };

  // Legacy username/password login (kept for backward compat)
  const login = async (username, password, remember = false) => {
    const res = await authAPI.login({ username, password, remember_me: remember });
    const { token: t, user: u } = res.data;
    _storeSession(t, u, remember);
    return { user: u, onboardingComplete: u.onboarding_complete ?? true };
  };

  // Legacy registration (kept for backward compat)
  const register = async (data) => {
    const res = await authAPI.register(data);
    const { token: t, user: u } = res.data;
    _storeSession(t, u);
    return { user: u, onboardingComplete: u.onboarding_complete ?? true };
  };

  // ── Frictionless Auth Methods ──

  const sendMagicLink = async (email) => {
    const res = await authAPI.sendMagicLink(email);
    return res.data;
  };

  const verifyMagicLink = async (magicToken, remember = false) => {
    const res = await authAPI.verifyMagicLink(magicToken);
    const { token: t, user: u } = res.data;
    _storeSession(t, u, remember);
    return {
      user: u,
      isNewUser: res.data.is_new_user,
      onboardingComplete: res.data.onboarding_complete ?? u.onboarding_complete ?? true,
    };
  };

  const sendPhoneCode = async (phone) => {
    const res = await authAPI.sendPhoneCode(phone);
    return res.data;
  };

  const verifyPhoneCode = async (phone, code, remember = false) => {
    const res = await authAPI.verifyPhoneCode(phone, code);
    const { token: t, user: u } = res.data;
    _storeSession(t, u, remember);
    return {
      user: u,
      isNewUser: res.data.is_new_user,
      onboardingComplete: res.data.onboarding_complete ?? u.onboarding_complete ?? true,
    };
  };

  const googleAuth = async (credential, remember = false) => {
    const res = await authAPI.googleAuth(credential);
    const { token: t, user: u } = res.data;
    _storeSession(t, u, remember);
    return {
      user: u,
      isNewUser: res.data.is_new_user,
      onboardingComplete: res.data.onboarding_complete ?? u.onboarding_complete ?? true,
    };
  };

  const googleAuthWithCode = async (code, remember = false) => {
    const res = await authAPI.googleAuthCode(code);
    const { token: t, user: u } = res.data;
    _storeSession(t, u, remember);
    return {
      user: u,
      isNewUser: res.data.is_new_user,
      onboardingComplete: res.data.onboarding_complete ?? u.onboarding_complete ?? true,
    };
  };

  const completeOnboarding = async (data) => {
    const res = await authAPI.completeOnboarding(data);
    const updatedUser = res.data.user;
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    return updatedUser;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('session_token');
    setToken(null);
    setUser(null);
    setRememberMe(false);
  };

  const checkAccountStatus = async () => {
    try {
      const res = await authAPI.accountStatus();
      const data = res.data;
      setAccountLocked(data.account_locked);
      if (data.locked_remaining_seconds > 0) {
        setLockedUntil(new Date(Date.now() + data.locked_remaining_seconds * 1000));
      }
      return data;
    } catch {
      return null;
    }
  };

  const fetchLoginHistory = async () => {
    try {
      const res = await authAPI.loginHistory();
      return res.data;
    } catch {
      return [];
    }
  };

  const refreshUser = async () => {
    try {
      const res = await authAPI.me();
      const updatedUser = res.data;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      return updatedUser;
    } catch {
      return null;
    }
  };

  const role = user?.role || null;
  const isAdmin = role === 'admin';
  const isAgent = role === 'agent';
  const isTrader = role === 'trader';
  const isFarmer = role === 'farmer';
  const isApproved = user?.is_approved ?? true;
  const canSubmit = user?.can_submit_prices ?? false;
  const canReview = user && ['admin', 'agent'].includes(role) && isApproved;
  const approvalStatus = user?.approval_status || 'approved';
  const onboardingComplete = user?.onboarding_complete ?? true;

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      // Legacy auth
      login, register, logout, refreshUser,
      // Frictionless auth
      sendMagicLink, verifyMagicLink,
      sendPhoneCode, verifyPhoneCode,
      googleAuth, googleAuthWithCode,
      completeOnboarding,
      // Security
      rememberMe, accountLocked, lockedUntil,
      checkAccountStatus, fetchLoginHistory,
      // Derived state
      role, isAdmin, isAgent, isTrader, isFarmer,
      isApproved, canSubmit, canReview, approvalStatus,
      isAuthenticated: !!token,
      onboardingComplete,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
