import { useState, useEffect, useRef } from 'react';
import { notificationAPI } from '../services/api';
import {
  Bell, BellRing, CheckCheck, AlertTriangle, Truck, Info,
  TrendingUp, MessageSquare, Smartphone, X,
} from 'lucide-react';

const TYPE_CONFIG = {
  price_alert: { icon: <TrendingUp size={14} />, color: '#f59e0b' },
  opportunity: { icon: <BellRing size={14} />, color: '#22c55e' },
  transport: { icon: <Truck size={14} />, color: '#3b82f6' },
  system: { icon: <Info size={14} />, color: '#8b5cf6' },
};

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = () => {
    notificationAPI.list({ limit: 15 }).then((res) => {
      if (res.data) {
        setNotifications(res.data.notifications || res.data || []);
        setUnreadCount(res.data.unread_count ?? 0);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const notifList = Array.isArray(notifications) ? notifications : [];

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm btn-secondary"
        onClick={() => setOpen(!open)}
        style={{ position: 'relative', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {unreadCount > 0 ? <BellRing size={16} style={{ color: 'var(--warning)' }} /> : <Bell size={16} />}
        <span style={{ fontSize: '0.78rem' }}>Notifications</span>
        {unreadCount > 0 && (
          <span style={{
            background: 'var(--danger)', color: '#fff', borderRadius: '50%',
            width: 18, height: 18, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700,
            position: 'absolute', top: -4, right: -4,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 380, maxHeight: 480, overflowY: 'auto',
          background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button className="btn btn-sm" onClick={handleMarkAllRead}
                style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifList.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <Bell size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0 }}>No notifications yet</p>
            </div>
          ) : (
            notifList.map((n) => {
              const tc = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
              return (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  style={{
                    display: 'flex', gap: 10, padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: n.read ? 'transparent' : 'rgba(0,212,170,0.04)',
                    cursor: n.read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ color: tc.color, marginTop: 2, flexShrink: 0 }}>{tc.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: n.read ? 400 : 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {n.message}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.6 }}>{n.time_ago || ''}</span>
                      {n.sms_sent && <Smartphone size={10} style={{ color: 'var(--accent)' }} title="SMS sent" />}
                      {n.whatsapp_sent && <MessageSquare size={10} style={{ color: '#25D366' }} title="WhatsApp sent" />}
                    </div>
                  </div>
                  {!n.read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
