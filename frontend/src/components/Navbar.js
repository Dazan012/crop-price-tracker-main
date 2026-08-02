import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import {
  LayoutDashboard, TrendingUp, PlusCircle, AlertTriangle,
  ClipboardCheck, LogOut, Menu, X, Leaf
} from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { user, logout, isAuthenticated, isAdmin, isAgent, canSubmit, canReview } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const navLinks = [];
  navLinks.push({ to: '/dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' });
  navLinks.push({ to: '/prices', icon: <TrendingUp size={16} />, label: 'Market Prices' });
  if (canSubmit) navLinks.push({ to: '/submit', icon: <PlusCircle size={16} />, label: 'Submit Price' });
  if (canReview) navLinks.push({ to: '/anomalies', icon: <AlertTriangle size={16} />, label: 'Anomalies' });
  if (canReview) navLinks.push({ to: '/reviews', icon: <ClipboardCheck size={16} />, label: 'Reviews' });

  const roleColors = {
    admin: '#ef4444', agent: '#f59e0b', trader: '#3b82f6',
    farmer: '#10b981', general: '#6b7280',
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon"><Leaf size={18} /></span>
          Smart Crops
        </Link>

        <div className={`navbar-links ${mobileOpen ? 'mobile-open' : ''}`}>
          {isAuthenticated && navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={isActive(link.to)}
              onClick={() => setMobileOpen(false)}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>

        <div className="navbar-user">
          {isAuthenticated ? (
            <>
              <div className="user-avatar" style={{ background: `linear-gradient(135deg, ${roleColors[user?.role] || '#6b7280'}, var(--accent-dark))` }}>
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.username || 'User'}</span>
                <span className="user-role" style={{ color: roleColors[user?.role] }}>
                  {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
                </span>
              </div>
              <button className="btn-icon" onClick={logout} title="Logout">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          )}
          <button className="btn-icon" style={{ display: 'none' }} onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </nav>
  );
}
