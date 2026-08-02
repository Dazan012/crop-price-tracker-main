import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellOff, X, Check, CheckCheck, TrendingDown, TrendingUp, Truck, AlertCircle, Filter, Smartphone, MessageSquare } from 'lucide-react';
import { notificationAPI, authAPI } from '../services/api';
import { useAuth } from '../services/AuthContext';

/* ── Priority color map ────────────────────────────────── */
const PRIORITY_COLORS = {
  high: { bg: 'rgba(220, 38, 38, 0.16)', border: 'var(--danger, #dc2626)', text: 'var(--danger, #dc2626)', dot: 'var(--danger, #dc2626)' },
  medium: { bg: 'rgba(245, 158, 11, 0.16)', border: 'var(--warning, #d97706)', text: 'var(--warning, #d97706)', dot: 'var(--warning, #d97706)' },
  low: { bg: 'rgba(59, 130, 246, 0.16)', border: 'var(--info, #3b82f6)', text: 'var(--info, #3b82f6)', dot: 'var(--info, #3b82f6)' },
};

const TYPE_ICONS = {
  price_alert: TrendingDown,
  opportunity: TrendingUp,
  transport: Truck,
  system: AlertCircle,
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'price_alert', label: 'Price' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'transport', label: 'Transport' },
];

const POLL_INTERVAL = 30000; // 30 seconds

/* ── Group notifications by Today / Yesterday / Earlier ── */
function groupByTime(notifications) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (d >= today) groups.Today.push(n);
    else if (d >= yesterday) groups.Yesterday.push(n);
    else groups.Earlier.push(n);
  }
  return groups;
}

/* ── Toast popup for HIGH priority ─────────────────────── */
function ToastPopup({ notification, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!notification) return null;
  const colors = PRIORITY_COLORS[notification.priority] || PRIORITY_COLORS.medium;
  const Icon = TYPE_ICONS[notification.type] || AlertCircle;

  return (
    <div
      className="notification-toast"
      style={{
        position: 'fixed',
        top: 70,
        right: 20,
        zIndex: 10000,
        background: 'var(--card-bg, #1e293b)',
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: 12,
        padding: '14px 18px',
        maxWidth: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        animation: 'toastSlideIn 0.3s ease-out',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: colors.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: `1px solid ${colors.border}33`,
      }}>
        <Icon size={18} color={colors.text} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #f1f5f9)', marginBottom: 2 }}>
          {notification.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
          {notification.message}
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary, #94a3b8)', padding: 2, flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Single notification item ──────────────────────────── */
function NotificationItem({ notification, onMarkRead }) {
  const colors = PRIORITY_COLORS[notification.priority] || PRIORITY_COLORS.medium;
  const Icon = TYPE_ICONS[notification.type] || AlertCircle;
  const isUnread = !notification.read;

  return (
    <div
      className={`notification-item ${isUnread ? 'unread' : ''}`}
      onClick={() => isUnread && onMarkRead(notification.id)}
      style={{
        display: 'flex',
        gap: 10,
        padding: '12px 14px',
        cursor: isUnread ? 'pointer' : 'default',
        borderBottom: '1px solid var(--border-color, #334155)',
        background: isUnread ? colors.bg : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Priority dot + icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: colors.bg, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
        border: `1px solid ${colors.border}33`,
      }}>
        <Icon size={16} color={colors.text} />
        {isUnread && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 8, height: 8, borderRadius: '50%',
            background: colors.dot, border: '2px solid var(--card-bg, #1e293b)',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: isUnread ? 600 : 500,
          color: 'var(--text-primary, #f1f5f9)',
          marginBottom: 2, lineHeight: 1.3,
        }}>
          {notification.title}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--text-secondary, #94a3b8)',
          lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {notification.message}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '1px 6px',
            borderRadius: 4, background: colors.bg, color: colors.text,
            border: `1px solid ${colors.border}40`,
          }}>
            {notification.priority_display || notification.priority}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary, #64748b)' }}>
            {notification.time_ago}
          </span>
          {notification.sms_sent && <Smartphone size={10} style={{ color: 'var(--accent, #3b82f6)' }} title="SMS sent" />}
          {notification.whatsapp_sent && <MessageSquare size={10} style={{ color: '#25D366' }} title="WhatsApp sent" />}
        </div>
      </div>

      {/* Read indicator */}
      {isUnread && (
        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
          <Check size={14} color="var(--text-tertiary, #64748b)" />
        </div>
      )}
    </div>
  );
}

/* ── Main NotificationBell ─────────────────────────────── */
export default function NotificationBell({ accentColor }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [seenIds, setSeenIds] = useState(new Set());
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const panelRef = useRef(null);
  const bellRef = useRef(null);
  const pollRef = useRef(null);
  const seededRef = useRef(false);

  /* ── Check notification preferences on mount ──────────── */
  useEffect(() => {
    if (!isAuthenticated) return;
    authAPI.getPreferences().then((res) => {
      setNotificationsEnabled(res.data.notifications_enabled !== false);
    }).catch(() => {});
  }, [isAuthenticated]);

  /* ── Fetch notifications ─────────────────────────────── */
  const fetchNotifications = useCallback(async (isPoll = false) => {
    if (!isAuthenticated) return;
    try {
      if (!isPoll) setLoading(true);
      const params = { limit: 20 };
      if (activeFilter !== 'all') params.type = activeFilter;

      const res = await notificationAPI.list(params);
      const data = res.data;

      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);

      // Detect new high-priority notifications for toast
      if (data.notifications) {
        const newHighPriority = data.notifications.filter(
          (n) => n.priority === 'high' && !n.read && !seenIds.has(n.id)
        );
        if (newHighPriority.length > 0 && !isPoll) {
          // Only show toasts on initial load if truly new
        } else if (newHighPriority.length > 0 && isPoll) {
          setToasts((prev) => [...prev, ...newHighPriority]);
        }
        setSeenIds((prev) => {
          const next = new Set(prev);
          data.notifications.forEach((n) => next.add(n.id));
          return next;
        });
      }
    } catch (err) {
      console.warn('Notification fetch failed:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeFilter, seenIds]);

  /* ── Fetch summary (lightweight, for badge only) ─────── */
  const fetchSummary = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationAPI.summary();
      const newCount = res.data.unread_count || 0;
      setUnreadCount(newCount);

      // If count increased, fetch full list for toasts
      if (newCount > unreadCount && unreadCount > 0) {
        fetchNotifications(true);
      }
    } catch (err) {
      // silent
    }
  }, [isAuthenticated, unreadCount, fetchNotifications]);

  /* ── Polling ─────────────────────────────────────────── */
  useEffect(() => {
    if (!isAuthenticated || !notificationsEnabled) {
      // Clear any existing poll when disabled
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    // Initial fetch
    fetchNotifications(false);

    // Poll summary every 30s (lightweight)
    pollRef.current = setInterval(() => {
      fetchSummary();
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAuthenticated, notificationsEnabled, fetchNotifications, fetchSummary]);

  /* ── Auto-seed demo notifications if empty on first load ── */
  useEffect(() => {
    if (!isAuthenticated || seededRef.current) return;
    if (notifications.length === 0 && !loading) {
      seededRef.current = true;
      notificationAPI.seedDemo().then((res) => {
        if (res.data?.count > 0) fetchNotifications(false);
      }).catch(() => {});
    }
  }, [isAuthenticated, notifications, loading, fetchNotifications]);

  /* ── Re-fetch when filter changes ────────────────────── */
  useEffect(() => {
    if (panelOpen) fetchNotifications(false);
  }, [activeFilter, panelOpen]);

  /* ── Click outside to close ──────────────────────────── */
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    }
    if (panelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [panelOpen]);

  /* ── Mark single as read ─────────────────────────────── */
  const handleMarkRead = useCallback(async (id) => {
    try {
      await notificationAPI.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Mark read failed:', err?.message);
    }
  }, []);

  /* ── Mark all as read ────────────────────────────────── */
  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Mark all read failed:', err?.message);
    }
  }, []);

  /* ── Dismiss toast ───────────────────────────────────── */
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (!isAuthenticated) return null;

  const grouped = groupByTime(notifications);

  /* ── Muted state: notifications disabled ─────────────── */
  if (!notificationsEnabled) {
    return (
      <button
        className="header-icon-btn"
        title="Notifications are disabled — enable in Settings"
        onClick={() => { window.location.href = '/settings'; }}
        style={{ position: 'relative', opacity: 0.4 }}
      >
        <BellOff size={18} />
      </button>
    );
  }

  return (
    <>
      {/* ── Bell Button ─────────────────────────────── */}
      <button
        ref={bellRef}
        className="header-icon-btn"
        title="Notifications"
        onClick={() => setPanelOpen(!panelOpen)}
        style={{ position: 'relative' }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid var(--header-bg, #0f172a)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Toast Popups ────────────────────────────── */}
      {toasts.map((toast, i) => (
        <div key={toast.id} style={{ position: 'fixed', top: 70 + i * 90, right: 20, zIndex: 10000 }}>
          <ToastPopup
            notification={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        </div>
      ))}

      {/* ── Notification Panel ──────────────────────── */}
      {panelOpen && (
        <div
          ref={panelRef}
          className="notification-panel"
          style={{
            position: 'absolute',
            top: 56,
            right: 60,
            width: 'min(400px, calc(100vw - 24px))',
            maxHeight: 'min(80vh, 640px)',
            background: 'var(--bg-card, var(--field, #1e293b))',
            border: '1px solid var(--border, var(--border-color, #334155))',
            borderRadius: 14,
            boxShadow: 'var(--shadow-md, 0 12px 48px rgba(0,0,0,0.4))',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'panelFadeIn 0.2s ease-out',
            color: 'var(--text-primary, #f1f5f9)',
          }}
        >
          {/* Panel Header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid var(--border, var(--border-color, #334155))',
            background: 'var(--bg-card, var(--field, #1e293b))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={16} color={accentColor || '#3b82f6'} />
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #f1f5f9)' }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '1px 8px',
                    borderRadius: 10, background: '#ef444420', color: '#ef4444',
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: accentColor || '#3b82f6', fontSize: 12,
                      fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <CheckCheck size={14} /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setPanelOpen(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary, #94a3b8)', padding: 2,
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: activeFilter === tab.key ? 600 : 400,
                    background: activeFilter === tab.key
                      ? `${accentColor || '#3b82f6'}20`
                      : 'transparent',
                    color: activeFilter === tab.key
                      ? accentColor || '#3b82f6'
                      : 'var(--text-secondary, #94a3b8)',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification List */}
          <div style={{
            overflowY: 'auto',
            flex: 1,
            maxHeight: 'calc(80vh - 120px)',
          }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #94a3b8)' }}>
                <div className="spinner" style={{ margin: '0 auto 8px' }} />
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--text-secondary, #94a3b8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: 'var(--accent-glow, rgba(59, 130, 246, 0.16))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent, #3b82f6)',
                }}>
                  <Bell size={22} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #f1f5f9)' }}>No notifications</div>
                <div style={{ fontSize: 12, marginTop: 2, maxWidth: 240, lineHeight: 1.5 }}>
                  {activeFilter !== 'all' ? 'Try a different filter to see more updates.' : 'You are all caught up!'}
                </div>
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => {
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div style={{
                      padding: '8px 16px 4px',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--text-secondary, #64748b)',
                      background: 'var(--bg-secondary, #0f172a)',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}>
                      {group}
                    </div>
                    {items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onMarkRead={handleMarkRead}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Inline animation styles ─────────────────── */}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .notification-item:hover {
          background: var(--bg-card-hover, rgba(15, 23, 42, 0.08)) !important;
        }
        .notification-item.unread:hover {
          background: var(--accent-glow, rgba(59, 130, 246, 0.16)) !important;
        }
        .notification-panel {
          scrollbar-width: thin;
          scrollbar-color: var(--border-color, #334155) transparent;
        }
        .notification-panel::-webkit-scrollbar {
          width: 6px;
        }
        .notification-panel::-webkit-scrollbar-track {
          background: transparent;
        }
        .notification-panel::-webkit-scrollbar-thumb {
          background: var(--border-color, #334155);
          border-radius: 3px;
        }
        [data-theme="light"] .notification-panel {
          background: var(--bg-card, #fff);
          border-color: var(--border, #e2e8f0);
          box-shadow: var(--shadow-md, 0 12px 48px rgba(0,0,0,0.12));
        }
        [data-theme="light"] .notification-item {
          border-bottom-color: var(--border, #f1f5f9) !important;
        }
        [data-theme="light"] .notification-toast {
          background: var(--bg-card, #fff) !important;
          box-shadow: var(--shadow-md, 0 8px 32px rgba(0,0,0,0.12)) !important;
        }
      `}</style>
    </>
  );
}
