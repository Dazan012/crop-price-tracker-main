import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { useLanguage } from '../services/i18n/LanguageContext';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, TrendingUp, PlusCircle, AlertTriangle,
  ClipboardCheck, LogOut, Leaf, BarChart3, Users, User,
  LineChart, MapPin, Clock, Package,
  CreditCard, Brain, Wrench, Building, ArrowLeftRight,
  Award, ChevronDown, X, Menu, Bell, Settings, Sun, Moon,
  Activity, Sprout, Target, Upload, BarChart2, Globe, FileText,
  Search as SearchIcon, Wheat,
} from 'lucide-react';
import NotificationBell from './NotificationBell.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { dashboardAPI, priceAPI } from '../services/api';

/* ── Role-specific navigation configs ─────────────────────── */

const FARMER_NAV = [
  { to: '/farmer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/farmer/prices', label: 'Market Prices', icon: TrendingUp, children: [
    { to: '/prices/heatmap', label: 'Price Heatmap' },
    { to: '/prices/chart', label: 'Price Charts' },
  ]},
  { to: '/farmer/best-market', label: 'Best Market', icon: MapPin },
  { to: '/farmer/farm', label: 'My Farm', icon: Sprout },
  { to: '/farmer/timing', label: 'Sell Timing', icon: Clock },
  { to: '/farmer/cooperative', label: 'Cooperative', icon: Users },
  { to: '/farmer/analytics', label: 'Analytics', icon: BarChart3, children: [
    { to: '/farmer/trends', label: 'Price Trends' },
    { to: '/farmer/forecast', label: 'Seasonal Forecast' },
    { to: '/farmer/transport', label: 'Transport Costs' },
  ]},
  { to: '/farmer/alerts', label: 'Price Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const TRADER_NAV = [
  { to: '/trader/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trader/spread', label: 'Price Spread', icon: ArrowLeftRight, children: [
    { to: '/trader/spread/live', label: 'Live Spread Analyser' },
    { to: '/trader/spread/opportunities', label: 'Top Opportunities' },
  ]},
  { to: '/trader/supply', label: 'Supply Tracker', icon: Package },
  { to: '/trader/forecast', label: 'Forecasts', icon: LineChart, children: [
    { to: '/trader/forecast/7day', label: '7-Day Forecast' },
    { to: '/trader/forecast/30day', label: '30-Day Outlook' },
  ]},
  { to: '/trader/tools', label: 'Trade Tools', icon: Wrench },
  { to: '/trader/intelligence', label: 'Intelligence', icon: Brain, children: [
    { to: '/trader/anomalies', label: 'Price Anomalies' },
  ]},
  { to: '/trader/alerts', label: 'Price Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const AGENT_NAV = [
  { to: '/agent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agent/submit', label: 'Submit Price', icon: Upload, primary: true },
  { to: '/agent/submissions', label: 'My Submissions', icon: ClipboardCheck, children: [
    { to: '/agent/submissions/today', label: "Today's Submissions" },
    { to: '/agent/submissions/flagged', label: 'Flagged & Rejected' },
  ]},
  { to: '/agent/market', label: 'My Market', icon: Building },
  { to: '/agent/matches', label: 'Matches', icon: ArrowLeftRight },
  { to: '/agent/forecast', label: 'Forecasting', icon: LineChart },
  { to: '/agent/performance', label: 'Performance', icon: Award },
  { to: '/agent/alerts', label: 'Price Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const ADMIN_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/prices', label: 'Market Prices', icon: TrendingUp, children: [
    { to: '/prices/heatmap', label: 'Price Heatmap' },
    { to: '/prices/chart', label: 'Price Charts' },
  ]},
  { to: '/forecast', label: 'Forecasting', icon: LineChart },
  { to: '/submit', label: 'Submit Price', icon: PlusCircle },
  { to: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { to: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { to: '/agents', label: 'Agent Approval', icon: Users },
  { to: '/admin/users', label: 'User Management', icon: Users },
  { to: '/recommendations', label: 'Recommendations', icon: Target },
  { to: '/agent/alerts', label: 'Price Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const GENERAL_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/prices', label: 'Market Prices', icon: TrendingUp, children: [
    { to: '/prices/heatmap', label: 'Price Heatmap' },
    { to: '/prices/chart', label: 'Price Charts' },
  ]},
  { to: '/forecast', label: 'Forecasting', icon: LineChart },
  { to: '/recommendations', label: 'Recommendations', icon: Target },
  { to: '/reports', label: 'Reports', icon: FileText },
];

const ROLE_COLORS = {
  admin: '#ef4444',
  agent: '#f59e0b',
  trader: '#3b82f6',
  farmer: '#22c55e',
  general: '#6b7280',
};

const ROLE_LABELS = {
  admin: 'ADMIN',
  agent: 'AGENT',
  trader: 'TRADER',
  farmer: 'FARMER',
  general: 'USER',
};

/* ── NavDropdown component ────────────────────────────────── */

function NavDropdown({ item, isActive, accentColor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const Icon = item.icon;
  const timeoutRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 150);
  };
  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div
      className="nav-dropdown-wrapper"
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to={item.to}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        style={isActive ? { borderBottomColor: accentColor } : {}}
      >
        <Icon size={16} />
        <span data-translate>{item.label}</span>
        <ChevronDown size={12} className={`dropdown-chevron ${open ? 'open' : ''}`} />
      </Link>
      {open && item.children && (
        <div className="nav-dropdown-menu">
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              className="nav-dropdown-item"
              onClick={() => setOpen(false)}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Hero Ticker sub-component ─────────────────────────────── */
function HeroTicker({ prices }) {
  const safePrices = (prices || []).filter(Boolean).filter((e) => e && typeof e === 'object');
  if (safePrices.length === 0) return null;
  const displayItems = [...safePrices, ...safePrices];
  return (
    <div className="hero-ticker">
      <div className="ticker-label">
        <Activity size={12} /> LIVE
      </div>
      <div className="ticker-scroll">
        <div className="ticker-track-inner">
          {displayItems.map((p, i) => (
            <span key={i} className="ticker-chip">
              <Wheat size={10} style={{ color: '#00d4aa' }} />
              <strong>{p.crop_name}</strong>
              <span className="ticker-price">
                {p.price != null ? Number(p.price).toLocaleString('en-TZ') : '--'} TZS
              </span>
              <span className="ticker-market">{p.market_name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Header component ────────────────────────────────── */

export default function Header() {
  const { user, logout, isAuthenticated, isAdmin, isAgent, canSubmit, canReview, isApproved, role } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('smart-crops-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const accentColor = ROLE_COLORS[role] || ROLE_COLORS.general;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smart-crops-theme', theme);
  }, [theme]);

  /* ── Hero-ticker prices ──────────────────────────────────── */
  const [heroPrices, setHeroPrices] = useState([]);
  const { reapplyTranslation } = useLanguage();

  useEffect(() => {
    priceAPI.list({ limit: 20 })
      .then((r) => setHeroPrices((r.data || []).filter(Boolean)))
      .catch(() => setHeroPrices([]));
  }, []);

  useEffect(() => {
    if (heroPrices.length > 0) {
      reapplyTranslation();
    }
  }, [heroPrices]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  // Smarter active-state detection: match exact path or path prefix with trailing slash
  const isActive = (path) => {
    const p = location.pathname;
    if (p === path) return true;
    if (p.startsWith(path + '/')) return true;
    // For parent routes like /farmer, /trader, /agent — match their prefix
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 1 && p.startsWith('/' + segments[0] + '/')) return true;
    return false;
  };

  // Choose nav based on role
  let navItems = ADMIN_NAV;
  if (role === 'farmer') navItems = FARMER_NAV;
  else if (role === 'trader') navItems = TRADER_NAV;
  else if (role === 'agent') navItems = AGENT_NAV;
  else if (role === 'general') navItems = GENERAL_NAV;

  const homeLink = role === 'farmer' ? '/farmer/dashboard' : role === 'trader' ? '/trader/dashboard' : role === 'agent' ? '/agent/dashboard' : '/dashboard';

  // For unauthenticated users — simple topbar
  if (!isAuthenticated) {
    return (
      <div className="app-wrapper">
        <header className="app-header">
          <Link to="/" className="header-logo">
            <span className="logo-icon"><Leaf size={18} /></span>
            <span className="logo-text">Smart Crops</span>
          </Link>
          <div className="header-spacer" />
          <div className="header-actions">
            <LanguageSwitcher />
            <Link to="/login" className="btn btn-secondary btn-sm"><span data-translate>Sign In</span></Link>
            <Link to="/register" className="btn btn-primary btn-sm"><span data-translate>Get Started</span></Link>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        {!isAuthPage && <HeroTicker prices={heroPrices} />}
        <main className="main-content"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* ── Sticky Header ────────────────────────────────────── */}
      <header className="app-header" style={{ borderBottomColor: `${accentColor}15` }}>
        {/* Logo */}
        <Link to={homeLink} className="header-logo">
          <span className="logo-icon"><Leaf size={18} /></span>
          <span className="logo-text">Smart Crops</span>
        </Link>

        {/* Desktop Nav Items */}
        <nav className="header-nav desktop-only">
          {navItems.map((item) => {
            if (item.children && item.children.length > 0) {
              return <NavDropdown key={item.to} item={item} isActive={isActive(item.to)} accentColor={accentColor} />;
            }
            const Icon = item.icon;
            const isPrimary = item.primary;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive(item.to) ? 'active' : ''} ${isPrimary ? 'nav-item-primary' : ''}`}
                style={isActive(item.to) ? { borderBottomColor: accentColor } : isPrimary ? { background: accentColor } : {}}
              >
                <Icon size={16} />
                <span data-translate>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="header-spacer" />



        {/* Notification Bell */}
        <NotificationBell accentColor={accentColor} />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Theme Toggle */}
        <button className="theme-toggle desktop-only" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Role Badge */}
        <span className="role-badge" style={{ background: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}40` }}>
          {ROLE_LABELS[role] || 'USER'}
        </span>

        {/* Avatar + Dropdown */}
        <div className="user-menu-wrapper" style={{ position: 'relative' }}>
          <button
            className="user-menu-trigger"
            onClick={() => {
              if (window.innerWidth <= 900) {
                setMobileMenuOpen(true);
              } else {
                setUserDropdownOpen(!userDropdownOpen);
              }
            }}
          >
            <div className="user-avatar-sm" style={{ background: `linear-gradient(135deg, ${accentColor}, var(--accent-dark))` }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="user-name desktop-only">{user?.username}</span>
            <ChevronDown size={14} className={`dropdown-chevron ${userDropdownOpen ? 'open' : ''}`} />
          </button>
          {userDropdownOpen && (
            <div className="user-dropdown" style={{ borderTopColor: accentColor }}>
              <Link to={homeLink} className="dropdown-item" onClick={() => setUserDropdownOpen(false)}>Dashboard</Link>
              <Link to="/edit-profile" className="dropdown-item" onClick={() => setUserDropdownOpen(false)}>
                <User size={14} /> Edit Profile
              </Link>
              <Link to="/settings" className="dropdown-item" onClick={() => setUserDropdownOpen(false)}>
                <Settings size={14} /> Settings
              </Link>
              <button className="dropdown-item" onClick={logout}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button className="header-icon-btn mobile-only" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={22} />
        </button>
      </header>

      {!isAuthPage && <HeroTicker prices={heroPrices} />}

      {/* ── Mobile Bottom Sheet ──────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header" style={{ background: `${accentColor}15`, borderBottomColor: `${accentColor}30` }}>
              <span className="sheet-title" style={{ color: accentColor }}>
                <Leaf size={16} /> {ROLE_LABELS[role]} MENU
              </span>
              <button className="sheet-close" onClick={() => setMobileMenuOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="sheet-nav">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isPrimary = item.primary;
                return (
                  <div key={item.to} className="sheet-nav-group">
                    <Link
                      to={item.to}
                      className={`sheet-link ${isActive(item.to) ? 'active' : ''} ${isPrimary ? 'sheet-link-primary' : ''}`}
                      onClick={() => !item.children && setMobileMenuOpen(false)}
                      style={isPrimary ? { background: accentColor } : {}}
                    >
                      <Icon size={20} />
                      <span>{item.label}</span>
                      {item.children && <ChevronDown size={14} />}
                    </Link>
                    {item.children && item.children.map((child) => (
                      <Link
                        key={child.to}
                        to={child.to}
                        className={`sheet-link sheet-link-child ${isActive(child.to) ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <span>{child.label}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </nav>
            <div className="sheet-footer">
              <div className="sheet-user">
                <div className="user-avatar-sm" style={{ background: `linear-gradient(135deg, ${accentColor}, var(--accent-dark))` }}>
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <span>{user?.username} · {ROLE_LABELS[role]}</span>
              </div>
              <div className="sheet-footer-actions">
                <LanguageSwitcher />
                <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <Link className="sheet-link" to={homeLink} onClick={() => setMobileMenuOpen(false)}>
                  <LayoutDashboard size={18} /> <span>Dashboard</span>
                </Link>
                <Link className="sheet-link" to="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <Settings size={18} /> <span>Settings</span>
                </Link>
                <button className="sheet-link" onClick={logout}>
                  <LogOut size={18} /> <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
