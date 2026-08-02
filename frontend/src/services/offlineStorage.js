/**
 * offlineStorage.js — localStorage-based persistence for offline data.
 *
 * Saves API responses so the app can render cached data when offline.
 * Each entry is stored with a timestamp so the UI can show
 * "Last updated: ..." indicators.
 *
 * Keys are prefixed with "sc-" to avoid collisions.
 */

const PREFIX = 'sc-';
const LAST_SYNC_KEY = 'smart-crops-last-sync';

// ── Core helpers ──────────────────────────────────────────────────────

/**
 * Save data to localStorage with a timestamp.
 * @param {string} key  - Logical data key (e.g. "prices", "crops").
 * @param {*} data      - JSON-serialisable data.
 */
export function saveOffline(key, data) {
  try {
    const entry = JSON.stringify({ data, ts: Date.now() });
    localStorage.setItem(PREFIX + key, entry);
    // Track the most recent sync time across all keys
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    // localStorage may be full — silently drop
    console.warn('[offlineStorage] save failed:', key, err?.message);
  }
}

/**
 * Retrieve cached data from localStorage.
 * @param {string} key
 * @returns {{ data: *, ts: number } | null}
 */
export function loadOffline(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Remove a specific cached entry.
 */
export function clearOffline(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch { /* ignore */ }
}

/**
 * Remove ALL Smart Crops cached data.
 */
export function clearAllOffline() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch { /* ignore */ }
}

// ── Convenience: last-sync timestamp ──────────────────────────────────

/**
 * Get the ISO timestamp of the last successful data sync.
 * @returns {string|null}
 */
export function getLastSyncTime() {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

/**
 * Format a timestamp into a human-friendly relative string.
 * E.g. "2 minutes ago", "Yesterday at 14:30"
 */
export function formatLastSync(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Convenience: specific data helpers ────────────────────────────────

export function savePrices(data) {
  saveOffline('prices', data);
}

export function loadPrices() {
  return loadOffline('prices');
}

export function saveCrops(data) {
  saveOffline('crops', data);
}

export function loadCrops() {
  return loadOffline('crops');
}

export function saveRegions(data) {
  saveOffline('regions', data);
}

export function loadRegions() {
  return loadOffline('regions');
}

export function saveMarkets(data) {
  saveOffline('markets', data);
}

export function loadMarkets() {
  return loadOffline('markets');
}

export function saveDashboard(data) {
  saveOffline('dashboard', data);
}

export function loadDashboard() {
  return loadOffline('dashboard');
}
