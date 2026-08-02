import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import {
  LayoutDashboard, TrendingUp, PlusCircle, AlertTriangle,
  ClipboardCheck, LogOut, Leaf, BarChart3, Users,
  LineChart, Sprout, ShoppingCart, MapPin, ChevronLeft, ChevronRight,
  ShieldCheck, Lightbulb,
} from 'lucide-react';
import { useState } from 'react';

export default function Sidebar({ children }) {
  const { user, logout, isAuthenticated, isAdmin, isAgent, canSubmit, canReview, isApproved, role } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path) => location.pathname === path ? 'sidebar-link active' : 'sidebar-link';

  const roleColors = {
    admin: '#ef4444', agent: '#f59e0b', trader: '#3b82f6',
    farmer: '#10b981', general: '#6b7280',
  };

  const buildLinks = () => {
    const links = [];
    links.push({ to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' });
    links.push({ to: '/prices', icon: <TrendingUp size={18} />, label: 'Market Prices' });
    links.push({ to: '/forecast', icon: <LineChart size={18} />, label: 'Forecasting' });

    if (canSubmit) {
      links.push({ to: '/submit', icon: <PlusCircle size={18} />, label: 'Submit Price' });
    }
    if (canReview) {
      links.push({ to: '/anomalies', icon: <AlertTriangle size={18} />, label: 'Anomalies' });
      links.push({ to: '/reviews', icon: <ClipboardCheck size={18} />, label: 'Reviews' });
    }
    if (isAdmin) {
      links.push({ to: '/agents', icon: <ShieldCheck size={18} />, label: 'Agent Approval' });
    }
    if (isAuthenticated) {
      links.push({ to: '/recommendations', icon: <Lightbulb size={18} />, label: 'Recommendations' });
    }
    return links;
  };

  if (!isAuthenticated) {
    return (
      <div className="app-layout">
        <nav className="topbar">
          <Link to="/" className="topbar-brand">
            <span className="brand-icon"><Leaf size={18} /></span>
            Smart Crops
          </Link>
          <div className="topbar-actions">
            <Link to="/login" className="btn btn-secondary btn-sm">Sign In</Link>
            <Link to="/login" className="btn btn-primary btn-sm">Get Started</Link>
          </div>
        </nav>
        <main className="main-content">{children}</main>
      </div>
    );
  }

  const links = buildLinks();

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <span className="brand-icon"><Leaf size={18} /></span>
            {!collapsed && <span>Smart Crops</span>}
          </Link>
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar" style={{
            background: `linear-gradient(135deg, ${roleColors[role] || '#6b7280'}, var(--accent-dark))`,
            width: collapsed ? 36 : 40, height: collapsed ? 36 : 40,
            fontSize: collapsed ? '0.9rem' : '1rem',
          }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-name">{user?.username || 'User'}</span>
              <span className="user-role" style={{ color: roleColors[role] }}>
                {role?.charAt(0).toUpperCase() + role?.slice(1)}
                {!isApproved && role === 'agent' && (
                  <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.6rem' }}>Pending</span>
                )}
              </span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={isActive(link.to)}>
              {link.icon}
              {!collapsed && <span>{link.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={logout}>
            <LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
