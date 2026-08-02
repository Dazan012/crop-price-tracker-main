/**
 * networkStatus.js — Online / offline detection & smart sync.
 *
 * Provides a simple event-based system so any component can react
 * to connectivity changes without duplicating listeners.
 */

const listeners = new Set();

let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

// ── Public API ────────────────────────────────────────────────────────

export function isOnline() {
  return _isOnline;
}

/**
 * Subscribe to connectivity changes.
 * @param {function} fn  — callback receiving (isOnline: boolean)
 * @returns {function} unsubscribe
 */
export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(_isOnline); } catch { /* swallow */ }
  });
}

// ── Browser event wiring (runs once) ─────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _isOnline = true;
    notify();
  });

  window.addEventListener('offline', () => {
    _isOnline = false;
    notify();
  });
}

// ── Sync helper ───────────────────────────────────────────────────────

/**
 * Run a sync function when the app comes back online.
 * If already online, runs immediately.
 * @param {function} syncFn — async function to call on reconnect
 * @returns {function} unsubscribe
 */
export function syncOnReconnect(syncFn) {
  return onStatusChange((online) => {
    if (online) {
      try { syncFn(); } catch { /* swallow */ }
    }
  });
}
