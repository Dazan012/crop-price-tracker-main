/**
 * DataCache — In-memory cache for reference data that rarely changes.
 * Prevents re-fetching regions, crops, and markets on every page mount.
 * TTL: 5 minutes.
 */

import { dataAPI } from './api';

const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedData(key, fetchFn) {
  const now = Date.now();
  if (cache[key] && (now - cache[key].timestamp) < CACHE_TTL) {
    return cache[key].data;
  }
  const data = await fetchFn();
  cache[key] = { data, timestamp: now };
  return data;
}

export function clearCache(key) {
  if (key) {
    delete cache[key];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}

export const cachedAPI = {
  regions: () => getCachedData('regions', () => dataAPI.regions().then(r => r.data)),

  crops: (category) => getCachedData(`crops_${category || 'all'}`, () => dataAPI.crops(category).then(r => r.data)),

  markets: (regionId) => getCachedData(`markets_${regionId || 'all'}`, () => dataAPI.markets(regionId).then(r => r.data)),

  regionCrops: (region) => getCachedData(`regionCrops_${region || 'all'}`, () => dataAPI.regionCrops(region).then(r => r.data)),
};
