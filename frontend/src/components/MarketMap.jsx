import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { createTanzaniaMap, createMarketMarker, REGION_COORDS, haversineDistance, getCurrentPosition } from '../services/MapsService';
import { MapPin, Locate } from 'lucide-react';

const MARKET_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
  unknown: '#6b7280',
};

export default function MarketMap({ markets = [], prices = [], height = '400px', onMarketSelect }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const userLocationRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = createTanzaniaMap(mapRef.current, { zoom: 6 });
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !markets.length) return;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    const bounds = [];

    markets.forEach((market) => {
      const region = (market.region_name || market.region || '').toLowerCase().trim();
      const coords = market.latitude && market.longitude
        ? [market.latitude, market.longitude]
        : REGION_COORDS[region];
      if (!coords) return;

      const marketPrices = prices.filter(
        p => (p.market === market.id || p.market_name === market.name)
      );
      const avgPrice = marketPrices.length
        ? (marketPrices.reduce((s, p) => s + p.price, 0) / marketPrices.length).toFixed(0)
        : null;

      let category = 'unknown';
      if (avgPrice) {
        const allPrices = prices.map(p => p.price);
        const mean = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
        category = avgPrice < mean * 0.85 ? 'low' : avgPrice > mean * 1.15 ? 'high' : 'medium';
      }

      const priceInfo = avgPrice
        ? `<span style="font-weight:600;color:${MARKET_COLORS[category]}">
            TZS ${Number(avgPrice).toLocaleString()}</span>`
        : 'No price data';

      const marker = createMarketMarker(map, coords, market.name, priceInfo, {
        color: MARKET_COLORS[category],
        label: market.name.charAt(0),
      });

      if (onMarketSelect) {
        marker.on('click', () => onMarketSelect(market));
      }

      markersRef.current.push(marker);
      bounds.push(coords);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.2));
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 8);
    }
  }, [markets, prices, onMarketSelect]);

  const handleLocateMe = async () => {
    try {
      const pos = await getCurrentPosition();
      const map = mapInstance.current;
      if (!map) return;
      map.setView([pos.lat, pos.lng], 8);

      if (userLocationRef.current) {
        map.removeLayer(userLocationRef.current);
      }
      const icon = L.divIcon({
        className: 'user-location',
        html: '<div style="width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(59,130,246,0.5);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      userLocationRef.current = L.marker([pos.lat, pos.lng], { icon })
        .bindPopup('<b>Your Location</b>')
        .addTo(map);

      const nearest = markets
        .map(m => {
          const region = (m.region_name || m.region || '').toLowerCase().trim();
          const coords = m.latitude && m.longitude
            ? [m.latitude, m.longitude]
            : REGION_COORDS[region];
          if (!coords) return null;
          return { ...m, distance: haversineDistance(pos.lat, pos.lng, coords[0], coords[1]) };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);

      if (nearest.length) {
        nearest.forEach((m, i) => {
          setTimeout(() => {
            const region = (m.region_name || m.region || '').toLowerCase().trim();
            const coords = m.latitude && m.longitude
              ? [m.latitude, m.longitude]
              : REGION_COORDS[region];
            if (coords) {
              const marker = createMarketMarker(map, coords, m.name,
                `<b>Nearest Market #${i + 1}</b><br/>Distance: ${m.distance.toFixed(1)} km`,
                { color: '#f59e0b', label: `${i + 1}` }
              );
              markersRef.current.push(marker);
            }
          }, i * 300);
        });
      }
    } catch {
      /* fallback if GPS denied */
    }
  };

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div ref={mapRef} style={{ height, width: '100%', background: '#1a1a2e' }} />

      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <button onClick={handleLocateMe} title="Find nearby markets"
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
          <Locate size={16} />
        </button>
      </div>

      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
        padding: '6px 14px', borderRadius: 20, fontSize: '0.72rem',
        fontWeight: 600, color: '#00d4aa',
        border: '1px solid rgba(0,212,170,0.2)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <MapPin size={12} /> {markets.length} Markets
      </div>

      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
        display: 'flex', gap: 10, fontSize: '0.7rem',
      }}>
        {Object.entries(MARKET_COLORS).map(([key, color]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
