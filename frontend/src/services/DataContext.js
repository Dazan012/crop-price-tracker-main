import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { dataAPI } from './api';
import { saveOffline, loadOffline } from './offlineStorage';
import { isOnline, onStatusChange } from './networkStatus';
import { useAuth } from './AuthContext';

const DataContext = createContext({
  crops: [],
  regions: [],
  markets: [],
  loading: true,
  isOffline: false,
});

export function DataProvider({ children }) {
  const { token } = useAuth();
  const [crops, setCrops] = useState([]);
  const [regions, setRegions] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const syncedRef = useRef(false);

  // ── Fetch from API and persist offline ────────────────────────────────
  const fetchData = async () => {
    try {
      const [cropsData, regionsData, marketsData] = await Promise.all([
        dataAPI.crops().then(r => r.data || []).catch(() => null),
        dataAPI.regions().then(r => r.data || []).catch(() => null),
        dataAPI.markets().then(r => r.data || []).catch(() => null),
      ]);

      // Use API data if available, else fall back to cached data
      const finalCrops = cropsData ?? loadOffline('crops')?.data ?? [];
      const finalRegions = regionsData ?? loadOffline('regions')?.data ?? [];
      const finalMarkets = marketsData ?? loadOffline('markets')?.data ?? [];

      setCrops(finalCrops);
      setRegions(finalRegions);
      setMarkets(finalMarkets);

      // Persist to localStorage for offline access
      if (cropsData) saveOffline('crops', cropsData);
      if (regionsData) saveOffline('regions', regionsData);
      if (marketsData) saveOffline('markets', marketsData);

      syncedRef.current = true;
    } catch {
      // Full offline fallback
      const fallback = {
        crops: loadOffline('crops')?.data ?? [],
        regions: loadOffline('regions')?.data ?? [],
        markets: loadOffline('markets')?.data ?? [],
      };
      setCrops(fallback.crops);
      setRegions(fallback.regions);
      setMarkets(fallback.markets);
    } finally {
      setLoading(false);
    }
  };

  // ── Initial fetch ──────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);

  // ── React to connectivity changes ──────────────────────────────────
  useEffect(() => {
    const unsub = onStatusChange((online) => {
      setIsOffline(!online);
      if (online && syncedRef.current) {
        // Re-sync reference data when coming back online
        fetchData();
      }
    });
    return unsub;
  }, []);

  return (
    <DataContext.Provider value={{ crops, regions, markets, loading, isOffline }}>
      {children}
    </DataContext.Provider>
  );
}

/**
 * Basic context hook — returns whatever the DataProvider has loaded.
 * Dropdowns may be empty until the provider finishes.
 */
export function useData() {
  return useContext(DataContext);
}

/**
 * Parallel-loading hook — fires direct API calls immediately, context is backup.
 *
 * How it works:
 *   1. On mount, immediately fires crops / regions / markets API calls directly.
 *   2. If the DataProvider already has data → return it instantly (no fetch needed).
 *   3. Whichever resolves first (direct API or context) provides the data.
 *   4. The slower source is discarded (no double-render).
 *
 * Direct API calls are the primary path — no delay, no grace period.
 * Context data serves as the backup that can win the race if it loaded first.
 */
export function useDataWithFallback() {
  const ctx = useContext(DataContext);

  const [localCrops, setLocalCrops] = useState(null);
  const [localRegions, setLocalRegions] = useState(null);
  const [localMarkets, setLocalMarkets] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    // ── Fast path: context already has data, skip the fetch ─────────────
    if (!ctx.loading && (ctx.crops.length > 0 || ctx.regions.length > 0 || ctx.markets.length > 0)) {
      resolvedRef.current = true;
      return;
    }
    // ── Already resolved by a previous run ────────────────────────────
    if (resolvedRef.current) return;

    let cancelled = false;

    // ── Primary path: fire direct API calls immediately ───────────────
    setLocalLoading(true);

    Promise.all([
      dataAPI.crops().then(r => r.data || []).catch(() => null),
      dataAPI.regions().then(r => r.data || []).catch(() => null),
      dataAPI.markets().then(r => r.data || []).catch(() => null),
    ]).then(([cropsData, regionsData, marketsData]) => {
      if (cancelled || resolvedRef.current) return;
      resolvedRef.current = true;

      setLocalCrops(cropsData ?? loadOffline('crops')?.data ?? []);
      setLocalRegions(regionsData ?? loadOffline('regions')?.data ?? []);
      setLocalMarkets(marketsData ?? loadOffline('markets')?.data ?? []);
    }).catch(() => {
      if (!cancelled && !resolvedRef.current) {
        resolvedRef.current = true;
        setLocalCrops(loadOffline('crops')?.data ?? []);
        setLocalRegions(loadOffline('regions')?.data ?? []);
        setLocalMarkets(loadOffline('markets')?.data ?? []);
      }
    }).finally(() => {
      if (!cancelled) setLocalLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [ctx.loading, ctx.crops, ctx.regions, ctx.markets]);

  // ── Determine which source to serve ─────────────────────────────────
  const fallbackReady = localCrops !== null || localRegions !== null || localMarkets !== null;
  const contextReady = !ctx.loading && (ctx.crops.length > 0 || ctx.regions.length > 0 || ctx.markets.length > 0);

  // Primary: direct API result (fires first, usually wins)
  if (fallbackReady) {
    return { crops: localCrops ?? [], regions: localRegions ?? [], markets: localMarkets ?? [], loading: false, isOffline: ctx.isOffline };
  }
  // Backup: context data if it already loaded before our fetch finished
  if (contextReady) {
    return { crops: ctx.crops, regions: ctx.regions, markets: ctx.markets, loading: false, isOffline: ctx.isOffline };
  }
  // Both still loading
  return { crops: [], regions: [], markets: [], loading: localLoading || ctx.loading, isOffline: ctx.isOffline };
}
