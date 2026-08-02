import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';
import { LanguageProvider } from './services/i18n/LanguageContext';
import { DataProvider } from './services/DataContext';
import Header from './components/Header';
import OfflineIndicator from './components/OfflineIndicator.jsx';

/* ── Eager-loaded critical pages ─────────────────────────── */
import Landing from './pages/Landing';
import AuthScreen from './pages/AuthScreen';
import Register from './pages/Register';

/* ── Lazy-loaded pages with retry on chunk failure ───────── */
function lazyWithRetry(importFn) {
  return lazy(() => {
    const attempt = (retries = 3) =>
      importFn().catch((err) => {
        if (retries <= 0) {
          // All retries failed — force reload to get fresh chunks
          console.warn('Chunk load failed after retries, reloading...');
          window.location.reload();
          return new Promise(() => {}); // prevent unhandled rejection
        }
        if (err.name === 'ChunkLoadError' || err.message?.includes('Loading chunk') || err.message?.includes('Loading CSS chunk')) {
          const delay = Math.pow(2, 3 - retries) * 1000; // 1s, 2s, 4s
          return new Promise((resolve) =>
            setTimeout(() => attempt(retries - 1).then(resolve), delay)
          );
        }
        throw err;
      });
    return attempt();
  });
}

/* ── Global chunk error auto-reload ─────────────────────── */
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.name === 'ChunkLoadError' || event.reason?.message?.includes('Loading chunk')) {
      event.preventDefault();
      console.warn('Global chunk load error — auto-reloading...');
      window.location.reload();
    }
  });
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const MarketPrices = lazyWithRetry(() => import('./pages/MarketPrices'));
const SubmitPrice = lazyWithRetry(() => import('./pages/SubmitPrice'));
const Anomalies = lazyWithRetry(() => import('./pages/Anomalies'));
const Reviews = lazyWithRetry(() => import('./pages/Reviews'));
const Forecasting = lazyWithRetry(() => import('./pages/Forecasting'));
const AgentApproval = lazyWithRetry(() => import('./pages/AgentApproval'));
const Recommendations = lazyWithRetry(() => import('./pages/Recommendations'));
const AgentDashboard = lazyWithRetry(() => import('./pages/AgentDashboard'));
const TraderDashboard = lazyWithRetry(() => import('./pages/TraderDashboard'));
const FarmerDashboard = lazyWithRetry(() => import('./pages/FarmerDashboard'));
const PriceHeatmap = lazyWithRetry(() => import('./pages/PriceHeatmap'));
const CandlestickChart = lazyWithRetry(() => import('./pages/CandlestickChart'));
const PriceAlerts = lazyWithRetry(() => import('./pages/PriceAlerts'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const AdminUsers = lazyWithRetry(() => import('./pages/AdminUsers'));
const EditProfile = lazyWithRetry(() => import('./pages/EditProfile'));
const Reports = lazyWithRetry(() => import('./pages/Reports'));
const Search = lazyWithRetry(() => import('./pages/Search'));
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const AuthCallback = lazyWithRetry(() => import('./pages/AuthCallback'));
const Onboarding = lazyWithRetry(() => import('./pages/Onboarding'));
const EmailVerification = lazyWithRetry(() => import('./pages/EmailVerification'));

function PageLoader() {
  return (
    <div className="loading-spinner" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  );
}

/* ── Route Guards ─────────────────────────────────────────── */

function ProtectedRoute({ children }) {
  const { isAuthenticated, onboardingComplete, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  const path = window.location.pathname;
  if (!onboardingComplete && path !== '/onboarding' && path !== '/verify-email') return <Navigate to="/onboarding" />;
  return children;
}

function CanSubmitRoute({ children }) {
  const { isAuthenticated, canSubmit, onboardingComplete, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  const path = window.location.pathname;
  if (!onboardingComplete && path !== '/onboarding' && path !== '/verify-email') return <Navigate to="/onboarding" />;
  if (!canSubmit) return <Navigate to="/dashboard" />;
  return children;
}

function CanReviewRoute({ children }) {
  const { isAuthenticated, canReview, onboardingComplete, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  const path = window.location.pathname;
  if (!onboardingComplete && path !== '/onboarding' && path !== '/verify-email') return <Navigate to="/onboarding" />;
  if (!canReview) return <Navigate to="/dashboard" />;
  return children;
}

function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, onboardingComplete, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  const path = window.location.pathname;
  if (!onboardingComplete && path !== '/onboarding' && path !== '/verify-email') return <Navigate to="/onboarding" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return children;
}

function RoleRoute({ allowedRoles, children }) {
  const { isAuthenticated, role, onboardingComplete, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  const path = window.location.pathname;
  if (!onboardingComplete && path !== '/onboarding' && path !== '/verify-email') return <Navigate to="/onboarding" />;
  if (!allowedRoles.includes(role)) return <Navigate to="/dashboard" />;
  return children;
}

/* ── Routes ───────────────────────────────────────────────── */

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route element={<Header />}>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthScreen />} />
        <Route path="/register" element={<Register />} />
        <Route path="/prices" element={<MarketPrices />} />
        <Route path="/prices/heatmap" element={<PriceHeatmap />} />
        <Route path="/prices/chart" element={<CandlestickChart />} />

        {/* Shared Authenticated */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/forecast" element={<ProtectedRoute><Forecasting /></ProtectedRoute>} />
        <Route path="/submit" element={<CanSubmitRoute><SubmitPrice /></CanSubmitRoute>} />
        <Route path="/anomalies" element={<CanReviewRoute><Anomalies /></CanReviewRoute>} />
        <Route path="/reviews" element={<CanReviewRoute><Reviews /></CanReviewRoute>} />
        <Route path="/agents" element={<AdminRoute><AgentApproval /></AdminRoute>} />
        <Route path="/recommendations" element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />

        {/* Farmer Routes */}
        <Route path="/farmer/dashboard" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard /></RoleRoute>} />
        <Route path="/farmer/prices" element={<RoleRoute allowedRoles={['farmer']}><MarketPrices /></RoleRoute>} />
        <Route path="/farmer/best-market" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="best-market" /></RoleRoute>} />
        <Route path="/farmer/farm" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="farm" /></RoleRoute>} />
        <Route path="/farmer/timing" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="timing" /></RoleRoute>} />
        <Route path="/farmer/cooperative" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="cooperative" /></RoleRoute>} />
        <Route path="/farmer/analytics" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="analytics" /></RoleRoute>} />
        <Route path="/farmer/trends" element={<RoleRoute allowedRoles={['farmer']}><CandlestickChart /></RoleRoute>} />
        <Route path="/farmer/forecast" element={<RoleRoute allowedRoles={['farmer']}><Forecasting /></RoleRoute>} />
        <Route path="/farmer/transport" element={<RoleRoute allowedRoles={['farmer']}><FarmerDashboard tab="transport" /></RoleRoute>} />
        <Route path="/farmer/alerts" element={<RoleRoute allowedRoles={['farmer', 'trader']}><PriceAlerts /></RoleRoute>} />

        {/* Trader Routes */}
        <Route path="/trader/dashboard" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard /></RoleRoute>} />
        <Route path="/trader/spread" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="spread" /></RoleRoute>} />
        <Route path="/trader/spread/live" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="spread" /></RoleRoute>} />
        <Route path="/trader/spread/opportunities" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="opportunities" /></RoleRoute>} />
        <Route path="/trader/supply" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="supply" /></RoleRoute>} />
        <Route path="/trader/forecast" element={<RoleRoute allowedRoles={['trader']}><Forecasting /></RoleRoute>} />
        <Route path="/trader/forecast/7day" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="forecast7" /></RoleRoute>} />
        <Route path="/trader/forecast/30day" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="forecast30" /></RoleRoute>} />
        <Route path="/trader/tools" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="tools" /></RoleRoute>} />
        <Route path="/trader/intelligence" element={<RoleRoute allowedRoles={['trader']}><TraderDashboard tab="intelligence" /></RoleRoute>} />
        <Route path="/trader/anomalies" element={<RoleRoute allowedRoles={['trader', 'admin', 'agent']}><Anomalies /></RoleRoute>} />
        <Route path="/trader/alerts" element={<RoleRoute allowedRoles={['trader', 'farmer']}><PriceAlerts /></RoleRoute>} />

        {/* Agent Routes */}
        <Route path="/agent/dashboard" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard /></RoleRoute>} />
        <Route path="/agent/submit" element={<CanSubmitRoute><SubmitPrice /></CanSubmitRoute>} />
        <Route path="/agent/submissions" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="submissions" /></RoleRoute>} />
        <Route path="/agent/submissions/today" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="today" /></RoleRoute>} />
        <Route path="/agent/submissions/flagged" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="flagged" /></RoleRoute>} />
        <Route path="/agent/market" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="market" /></RoleRoute>} />
        <Route path="/agent/matches" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="matches" /></RoleRoute>} />
        <Route path="/agent/performance" element={<RoleRoute allowedRoles={['agent', 'admin']}><AgentDashboard tab="performance" /></RoleRoute>} />
        <Route path="/agent/forecast" element={<RoleRoute allowedRoles={['agent', 'admin']}><Forecasting /></RoleRoute>} />
        <Route path="/agent/alerts" element={<RoleRoute allowedRoles={['agent', 'admin']}><PriceAlerts /></RoleRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>

      {/* Standalone auth pages (no header) */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/verify-email" element={<ProtectedRoute><EmailVerification /></ProtectedRoute>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
    </Routes>
    </Suspense>
  );
}

/* ── Chunk Error Boundary — auto-reloads on chunk failure ── */
class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk') || error?.message?.includes('Loading CSS chunk')) {
      return { hasError: true };
    }
    throw error; // re-throw non-chunk errors
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevState.hasError && this.state.hasError) {
      // Auto-reload on chunk error
      setTimeout(() => window.location.reload(), 500);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Loading latest version...</div>
          <div style={{ fontSize: 14, color: '#666' }}>The app has been updated. Reloading now.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <>
      <OfflineIndicator />
      <ChunkErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <LanguageProvider>
              <DataProvider>
                <AppRoutes />
              </DataProvider>
            </LanguageProvider>
          </AuthProvider>
        </BrowserRouter>
      </ChunkErrorBoundary>
    </>
  );
}

export default App;
