import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* Tanzania region centroids for map markers and route visualization */
export const REGION_COORDS = {
  'dar es salaam': [-6.79, 39.28],
  'dodoma':        [-6.17, 35.74],
  'arusha':        [-3.39, 36.69],
  'mwanza':        [-2.52, 32.90],
  'mbeya':         [-8.91, 33.46],
  'tanga':         [-5.07, 39.10],
  'morogoro':      [-6.82, 37.66],
  'kilimanjaro':   [-3.13, 37.57],
  'iringa':        [-7.77, 35.70],
  'tabora':        [-5.02, 32.83],
  'pwani':         [-7.27, 38.84],
  'mara':          [-1.77, 34.10],
  'shinyanga':     [-3.67, 33.43],
  'singida':       [-4.82, 34.74],
  'lindi':         [-9.24, 38.72],
  'mtwara':        [-10.27, 40.18],
  'kigoma':        [-4.88, 29.63],
  'rukwa':         [-7.78, 31.15],
  'katavi':        [-6.28, 30.65],
  'njombe':        [-9.34, 34.77],
  'songwe':        [-8.28, 32.60],
  'geita':         [-2.89, 31.93],
  'simiyu':        [-2.83, 34.18],
  'manyara':       [-4.31, 36.95],
  'ruvuma':        [-10.68, 36.28],
  'kagera':        [-1.67, 31.15],
  'zanzibar':      [-6.16, 39.19],
};

/* Get browser GPS location */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

/* Calculate distance between two coordinates (Haversine) in km */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* Create a Leaflet map centered on Tanzania */
export function createTanzaniaMap(container, options = {}) {
  const map = L.map(container, {
    center: options.center || [-6.3, 34.8],
    zoom: options.zoom || 6,
    zoomControl: options.zoomControl !== false,
    attributionControl: true,
    ...options,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);
  return map;
}

/* Create a market marker */
export function createMarketMarker(map, coords, marketName, priceInfo = '', options = {}) {
  const color = options.color || '#10b981';
  const icon = L.divIcon({
    className: 'market-marker',
    html: `<div style="
      background:${color};
      width:${options.size || 24}px;height:${options.size || 24}px;
      border-radius:50%;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:${options.fontSize || '10px'};font-weight:700;color:#fff;
    ">${options.label || 'M'}</div>`,
    iconSize: [options.size || 24, options.size || 24],
    iconAnchor: [(options.size || 24) / 2, (options.size || 24) / 2],
  });
  const marker = L.marker(coords, { icon }).bindPopup(`
    <b>${marketName}</b><br/>
    ${priceInfo ? `${priceInfo}<br/>` : ''}
    <span style="font-size:11px;color:#666;">
      ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}
    </span>
  `);
  marker.addTo(map);
  return marker;
}
