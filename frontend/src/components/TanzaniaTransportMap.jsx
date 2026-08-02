import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ────────────────────────────────────────────────────────
   Tanzania Region Coordinates (approximate centroids)
   Used for route visualization on the transport map
   ──────────────────────────────────────────────────────── */
const REGION_COORDS = {
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
};

/* ── Transport mode icons (simple colored markers) ── */
function makeIcon(color, label) {
  return L.divIcon({
    className: 'transport-map-icon',
    html: `<div style="
      background:${color};
      width:28px;height:28px;
      border-radius:50%;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;color:#fff;
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const MODE_ICONS = {
  truck:      makeIcon('#3b82f6', 'T'),
  bus:        makeIcon('#22c55e', 'B'),
  motorcycle: makeIcon('#f59e0b', 'M'),
  pickup:     makeIcon('#8b5cf6', 'P'),
  punda:      makeIcon('#d97706', '🫏'),
  toyo:       makeIcon('#06b6d4', '🛒'),
  binadamu:   makeIcon('#ef4444', '🚶'),
  origin:     makeIcon('#10b981', 'A'),
  destination:makeIcon('#ef4444', 'B'),
};

/* ── Route line colors by transport mode ── */
const MODE_COLORS = {
  truck:      '#3b82f6',
  bus:        '#22c55e',
  motorcycle: '#f59e0b',
  pickup:     '#8b5cf6',
  farm_leg:   '#d97706',
  default:    '#00d4aa',
};

/**
 * TanzaniaTransportMap — Leaflet-based route visualization
 *
 * Props:
 *   origin: string — origin region name
 *   destination: string — destination region name
 *   route: string[] — list of region names along the route path
 *   distance_km: number — total distance
 *   results: object — transport mode results from API
 *   selectedMode: string — currently highlighted transport mode
 *   destinationType: string — one of DESTINATION_TYPES keys
 *   stages: array — multi-stage transport stages (optional)
 *   height: string — CSS height (default '400px')
 */
export default function TanzaniaTransportMap({
  origin,
  destination,
  route = [],
  distance_km = 0,
  results = {},
  selectedMode = 'truck',
  destinationType = 'region_to_region',
  stages = [],
  height = '400px',
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layersRef = useRef([]);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [-6.3, 34.8],  // Tanzania center
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap tiles (free, no API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update map when props change
  const updateMap = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous layers
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];

    const addLayer = (layer) => {
      layer.addTo(map);
      layersRef.current.push(layer);
    };

    // Resolve coordinates for route
    const routeCoords = [];
    const regionNames = route.length > 0 ? route : [origin, destination].filter(Boolean);

    regionNames.forEach(name => {
      const key = (name || '').toLowerCase().trim();
      const coords = REGION_COORDS[key];
      if (coords) routeCoords.push(coords);
    });

    // Draw route polyline
    if (routeCoords.length >= 2) {
      const color = MODE_COLORS[selectedMode] || MODE_COLORS.default;

      // Dashed line for the full route
      const polyline = L.polyline(routeCoords, {
        color: color,
        weight: 4,
        opacity: 0.8,
        dashArray: selectedMode === 'motorcycle' ? '10, 8' : null,
      });
      addLayer(polyline);

      // Animated dashed overlay for selected mode
      const dashedOverlay = L.polyline(routeCoords, {
        color: '#fff',
        weight: 2,
        opacity: 0.4,
        dashArray: '5, 10',
      });
      addLayer(dashedOverlay);

      // Origin marker
      if (routeCoords[0]) {
        addLayer(L.marker(routeCoords[0], { icon: MODE_ICONS.origin })
          .bindPopup(`<b>From:</b> ${origin || 'Origin'}`));
      }

      // Destination marker
      const lastIdx = routeCoords.length - 1;
      if (routeCoords[lastIdx]) {
        addLayer(L.marker(routeCoords[lastIdx], { icon: MODE_ICONS.destination })
          .bindPopup(`<b>To:</b> ${destination || 'Destination'}`));
      }

      // Intermediate waypoints
      for (let i = 1; i < routeCoords.length - 1; i++) {
        const wpIcon = L.divIcon({
          className: 'transport-waypoint',
          html: `<div style="
            width:10px;height:10px;
            background:${color};
            border-radius:50%;
            border:2px solid #fff;
            box-shadow:0 1px 3px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        addLayer(L.marker(routeCoords[i], { icon: wpIcon })
          .bindPopup(regionNames[i] || `Waypoint ${i}`));
      }

      // Distance label at midpoint
      if (routeCoords.length >= 2 && distance_km > 0) {
        const midIdx = Math.floor(routeCoords.length / 2);
        const midCoords = routeCoords[midIdx];
        const distLabel = L.marker(midCoords, {
          icon: L.divIcon({
            className: 'transport-distance-label',
            html: `<div style="
              background:rgba(0,0,0,0.75);
              color:#00d4aa;
              padding:3px 10px;
              border-radius:12px;
              font-size:11px;
              font-weight:700;
              white-space:nowrap;
              font-family:monospace;
              border:1px solid rgba(0,212,170,0.3);
            ">${distance_km} km</div>`,
            iconSize: [80, 24],
            iconAnchor: [40, 12],
          }),
        });
        addLayer(distLabel);
      }

      // Fit bounds to route
      map.fitBounds(L.latLngBounds(routeCoords).pad(0.3));
    }

    // Draw farm leg (if destination type includes it)
    if (stages.length > 0) {
      const farmStage = stages.find(s => s.stage === 1);
      if (farmStage && routeCoords[0]) {
        // Draw a small dashed line from farm point to road (offset slightly)
        const [lat, lng] = routeCoords[0];
        const farmPoint = [lat + 0.15, lng - 0.1]; // Simulated farm position
        const farmLine = L.polyline([farmPoint, routeCoords[0]], {
          color: '#d97706',
          weight: 3,
          dashArray: '6, 6',
          opacity: 0.8,
        });
        addLayer(farmLine);

        // Farm marker
        addLayer(L.marker(farmPoint, { icon: MODE_ICONS.punda })
          .bindPopup(`<b>Shamba (Farm)</b><br>${farmStage.display || ''}<br>Distance: ${farmStage.distance_km || '?'} km`));

        // Label
        const farmLabel = L.marker([(farmPoint[0] + routeCoords[0][0]) / 2, (farmPoint[1] + routeCoords[0][1]) / 2], {
          icon: L.divIcon({
            className: 'farm-leg-label',
            html: `<div style="
              background:rgba(217,119,6,0.9);
              color:#fff;
              padding:2px 8px;
              border-radius:8px;
              font-size:10px;
              font-weight:600;
              white-space:nowrap;
            ">${farmStage.distance_km || '?'}km farm road</div>`,
            iconSize: [90, 20],
            iconAnchor: [45, 10],
          }),
        });
        addLayer(farmLabel);
      }
    }

    // Add mode comparison markers at destination
    if (routeCoords.length >= 2 && Object.keys(results).length > 0) {
      const destCoords = routeCoords[routeCoords.length - 1];
      let yOffset = 0;
      Object.entries(results).forEach(([mode, data]) => {
        const offsetCoords = [destCoords[0] + yOffset * 0.08, destCoords[1] + 0.2];
        const modeIcon = MODE_ICONS[mode] || MODE_ICONS.truck;
        const marker = L.marker(offsetCoords, { icon: modeIcon })
          .bindPopup(`
            <b>${data.display || mode}</b><br>
            Cost: TZS ${(data.cost || 0).toLocaleString()}<br>
            Time: ${data.time || '--'}<br>
            ${data.distance_tier ? `Tier: ${data.distance_tier}` : ''}
          `);
        addLayer(marker);
        yOffset++;
      });
    }
  }, [origin, destination, route, distance_km, results, selectedMode, destinationType, stages]);

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      {/* Map container */}
      <div
        ref={mapRef}
        style={{
          height: height,
          width: '100%',
          background: '#1a1a2e',
        }}
      />

      {/* Overlay: destination type badge */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: '0.72rem',
        fontWeight: 600,
        color: '#00d4aa',
        border: '1px solid rgba(0,212,170,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: '#00d4aa',
          display: 'inline-block',
        }} />
        {destinationType === 'region_to_region' ? 'Mkoa → Mkoa' :
         destinationType === 'shamba_to_road' ? 'Shamba → Barabara' :
         destinationType === 'shamba_to_warehouse' ? 'Shamba → Ghala' :
         destinationType === 'road_to_market' ? 'Barabara → Soko' :
         destinationType === 'shamba_to_market' ? 'Shamba → Soko' :
         destinationType}
      </div>

      {/* Overlay: route summary (bottom) */}
      {origin && destination && distance_km > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          right: 10,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          padding: '8px 16px',
          borderRadius: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-secondary, #aaa)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontWeight: 700, color: '#10b981' }}>{origin}</span>
          <span style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: '#00d4aa',
            background: 'rgba(0,212,170,0.1)',
            padding: '2px 10px',
            borderRadius: 8,
          }}>{distance_km} km</span>
          <span style={{ fontWeight: 700, color: '#ef4444' }}>{destination}</span>
        </div>
      )}
    </div>
  );
}
