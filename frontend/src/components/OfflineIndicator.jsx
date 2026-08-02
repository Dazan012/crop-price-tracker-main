import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { isOnline, onStatusChange } from '../services/networkStatus';
import { getLastSyncTime, formatLastSync } from '../services/offlineStorage';

/**
 * OfflineIndicator — sticky banner shown when the user is offline.
 * Displays connection status and "last updated" timestamp.
 */
export default function OfflineIndicator() {
  const [online, setOnline] = useState(isOnline());
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [lastSync, setLastSync] = useState(getLastSyncTime());
  const [dismissed, setDismissed] = useState(false);

  // Listen for connectivity changes
  useEffect(() => {
    const unsub = onStatusChange((nowOnline) => {
      const wasOffline = !nowOnline && online;
      setOnline(nowOnline);
      setDismissed(false);

      // Refresh last-sync timestamp when coming back online
      if (nowOnline) {
        setLastSync(getLastSyncTime());
        // Briefly show "just synced" banner
        if (wasOffline || !online) {
          setShowSyncBanner(true);
          setTimeout(() => setShowSyncBanner(false), 4000);
        }
      }
    });
    return unsub;
  }, [online]);

  // Nothing to show when online and no sync banner
  if (online && !showSyncBanner) return null;
  if (dismissed) return null;

  const syncLabel = formatLastSync(lastSync);

  // ── "Just synced" banner (brief green flash after reconnect) ────────
  if (online && showSyncBanner) {
    return (
      <div
        className="offline-indicator offline-indicator--synced"
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'rgba(34, 197, 94, 0.15)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
          color: '#22c55e',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          animation: 'offlineSlideDown 0.3s ease-out',
        }}
      >
        <RefreshCw size={14} />
        <span>Data synced — updated just now</span>
        <button
          onClick={() => setShowSyncBanner(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#22c55e',
            padding: 2,
            marginLeft: 8,
            display: 'flex',
          }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // ── Offline banner ──────────────────────────────────────────────────
  return (
    <div
      className="offline-indicator offline-indicator--offline"
      role="status"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'rgba(239, 68, 68, 0.12)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
        color: '#f87171',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        animation: 'offlineSlideDown 0.3s ease-out',
      }}
    >
      <WifiOff size={14} />
      <span>You're offline</span>
      {syncLabel && (
        <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 12 }}>
          — last updated {syncLabel}
        </span>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#f87171',
          padding: 2,
          marginLeft: 8,
          display: 'flex',
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes offlineSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
        }
        [data-theme="light"] .offline-indicator--offline {
          background: rgba(239, 68, 68, 0.08) !important;
          border-bottom-color: rgba(239, 68, 68, 0.15) !important;
          color: #dc2626 !important;
        }
        [data-theme="light"] .offline-indicator--synced {
          background: rgba(34, 197, 94, 0.08) !important;
          border-bottom-color: rgba(34, 197, 94, 0.15) !important;
          color: #16a34a !important;
        }
      `}</style>
    </div>
  );
}
