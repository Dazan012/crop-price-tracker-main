/**
 * RadialPriceWeb.jsx
 * Smart Crops Market Price Tracker — Tanzania
 *
 * Radial (spider/radar) chart showing crop price distribution
 * across 8 Tanzania regions for 4 crops.
 *
 * Features:
 *   • Canvas-rendered — no chart library dependency
 *   • Entry animation: polygons draw from center outward
 *   • Hover: highlights single crop, dims others, shows tooltip
 *   • Click: locks focus on a crop polygon
 *   • Legend: click to toggle individual crop visibility
 *   • Tooltip: shows all prices per region OR all regions per crop
 *   • Stats row: spread % per crop with cheapest/most expensive region
 *   • Responsive: ResizeObserver redraws on container resize
 *   • Reduced-motion respected
 *   • Dark/light mode aware (auto-detects system preference)
 *
 * Dependencies: React 18+  (no other packages required)
 *
 * Usage:
 *   import RadialPriceWeb from './RadialPriceWeb';
 *   <RadialPriceWeb />
 *
 *   Or pass custom data:
 *   <RadialPriceWeb crops={CROPS} regions={REGIONS} />
 */

import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from 'react';

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

export const DEFAULT_REGIONS = [
  'Dar es Salaam',
  'Mbeya',
  'Arusha',
  'Kilimanjaro',
  'Dodoma',
  'Iringa',
  'Mwanza',
  'Tanga',
];

export const DEFAULT_REGIONS_SHORT = [
  'DSM', 'Mbeya', 'Arusha', 'Kili',
  'Dodoma', 'Iringa', 'Mwanza', 'Tanga',
];

export const DEFAULT_CROPS = [
  {
    id:        'mahindi',
    name:      'Mahindi (Maize)',
    nameShort: 'Mahindi',
    color:     '#22c55e',
    unit:      'Tsh/kg',
    // Prices per region (same order as REGIONS)
    values:    [600, 420, 510, 490, 460, 430, 540, 520],
    lastUpdated: '2025-06-01',
  },
  {
    id:        'nyanya',
    name:      'Nyanya (Tomatoes)',
    nameShort: 'Nyanya',
    color:     '#ef4444',
    unit:      'Tsh/kg',
    values:    [1100, 850, 980, 920, 890, 860, 1020, 960],
    lastUpdated: '2025-06-01',
  },
  {
    id:        'viazi',
    name:      'Viazi (Potatoes)',
    nameShort: 'Viazi',
    color:     '#f59e0b',
    unit:      'Tsh/kg',
    values:    [380, 310, 345, 330, 320, 305, 355, 340],
    lastUpdated: '2025-06-01',
  },
  {
    id:        'maharage',
    name:      'Maharage (Beans)',
    nameShort: 'Maharage',
    color:     '#8b5cf6',
    unit:      'Tsh/kg',
    values:    [1800, 1550, 1680, 1620, 1590, 1560, 1710, 1650],
    lastUpdated: '2025-06-01',
  },
];

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

/** Convert hex colour to rgba string */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Normalise an array of values to 0–1 range.
 * Min value → 0.15 (never fully collapse to center)
 * Max value → 1.0
 */
function normalise(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => 0.15 + ((v - min) / range) * 0.85);
}

/** Smooth cubic ease-in-out for animation */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Given n axis index and total N axes, compute angle in radians */
function axisAngle(i, N) {
  return -Math.PI / 2 + (i * Math.PI * 2) / N;
}

/** Compute (x, y) for a data point at axis i, normalised radius n */
function pointXY(cx, cy, maxR, i, N, n, progress) {
  const angle = axisAngle(i, N);
  const rad   = n * maxR * easeInOutCubic(progress);
  return { x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad };
}

/** Check if the system prefers reduced motion */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────

function buildTheme(isDark) {
  return {
    bg:         isDark ? '#071a0a' : '#f0f7f1',
    surface:    isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    containerBg: isDark ? '#0a1f0e' : '#ffffff',
    containerBorder: isDark ? 'rgba(0,201,107,0.18)' : 'rgba(5,150,105,0.2)',
    text:       isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
    textMid:    isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.72)',
    textBright: isDark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.92)',
    heading:    isDark ? '#ffffff' : '#1a2e1f',
    subtitle:   isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
    badge:      isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
    badgeBg:    isDark ? 'rgba(0,201,107,0.08)' : 'rgba(5,150,105,0.08)',
    badgeBorder: isDark ? 'rgba(0,201,107,0.15)' : 'rgba(5,150,105,0.2)',
    grid:       isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.06)',
    gridStrong: isDark ? 'rgba(255,255,255,0.12)'  : 'rgba(0,0,0,0.12)',
    border:     isDark ? 'rgba(255,255,255,0.08)'  : 'rgba(0,0,0,0.08)',
    accent:     '#00c96b',
    accentDim:  isDark ? 'rgba(0,201,107,0.15)'   : 'rgba(0,201,107,0.12)',
    cardBg:     isDark ? 'rgba(255,255,255,0.04)'  : 'rgba(0,0,0,0.03)',
    shadow:     isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.12)',
  };
}

// ─────────────────────────────────────────────────────────────
// CANVAS DRAWING FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Draw concentric ring grid and radial axis lines.
 */
function drawGrid(ctx, cx, cy, maxR, N, rings, T) {
  const FONT = `10px -apple-system, "Inter", sans-serif`;

  // Faint inner fill (avoids pure void center)
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  innerGrad.addColorStop(0,   T.accentDim);
  innerGrad.addColorStop(0.6, 'transparent');
  innerGrad.addColorStop(1,   'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // Rings
  for (let r = 1; r <= rings; r++) {
    const rad = (maxR * r) / rings;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.strokeStyle = r === rings ? T.gridStrong : T.grid;
    ctx.lineWidth   = r === rings ? 0.75 : 0.5;
    ctx.stroke();
  }

  // Ring percentage labels — placed at top (12 o'clock axis)
  ctx.font        = FONT;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 1; r <= rings; r++) {
    const y   = cy - (maxR * r) / rings;
    const pct = `${r * 20}%`;
    // Small pill background
    ctx.fillStyle = T.surface;
    ctx.fillRect(cx - 14, y - 7, 28, 13);
    ctx.fillStyle = T.text;
    ctx.fillText(pct, cx, y);
  }

  // Axis lines
  for (let i = 0; i < N; i++) {
    const angle = axisAngle(i, N);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.strokeStyle = T.border;
    ctx.lineWidth   = 0.6;
    ctx.stroke();
  }
}

/**
 * Draw region name labels at the tips of each axis.
 * Highlighted region gets accent colour + bold.
 */
function drawRegionLabels(ctx, cx, cy, maxR, N, regionsShort, hoveredRegion, T) {
  const LABEL_R = maxR + 26;
  ctx.textBaseline = 'middle';

  regionsShort.forEach((label, i) => {
    const angle   = axisAngle(i, N);
    const lx      = cx + Math.cos(angle) * LABEL_R;
    const ly      = cy + Math.sin(angle) * LABEL_R;
    const isHov   = hoveredRegion === i;

    ctx.font      = isHov
      ? `bold 11px -apple-system, "Inter", sans-serif`
      : `10px -apple-system, "Inter", sans-serif`;
    ctx.fillStyle  = isHov ? T.accent : T.textMid;
    ctx.textAlign  = 'center';

    if (isHov) {
      // Subtle glow behind hovered label
      ctx.shadowColor = T.accent;
      ctx.shadowBlur  = 8;
    }
    ctx.fillText(label, lx, ly);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  });
}

/**
 * Draw one crop polygon.
 * normValues: array of 0–1 normalised prices per region.
 * progress:   0–1 animation progress.
 * isHighlighted: this crop is hovered or selected.
 * isDimmed:   another crop is highlighted, dim this one.
 */
function drawCropPolygon(
  ctx, cx, cy, maxR, N,
  crop, normValues, progress,
  isHighlighted, isDimmed,
) {
  const alpha      = isDimmed ? 0.15 : 1;
  const strokeW    = isHighlighted ? 2.5 : 1.5;
  const dotR       = isHighlighted ? 5.5 : 3.5;
  const fillAlpha  = isHighlighted ? 0.22 : isDimmed ? 0.04 : 0.10;

  // Compute vertex points
  const pts = normValues.map((n, i) => pointXY(cx, cy, maxR, i, N, n, progress));

  // ── Filled polygon ──────────────────────────────────────
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = hexToRgba(crop.color, fillAlpha);
  ctx.fill();

  // ── Stroke polygon ──────────────────────────────────────
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.strokeStyle = hexToRgba(crop.color, alpha);
  ctx.lineWidth   = strokeW;

  if (isHighlighted) {
    ctx.shadowColor = crop.color;
    ctx.shadowBlur  = 12;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // ── Vertex dots ─────────────────────────────────────────
  pts.forEach(p => {
    // Outer dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(crop.color, alpha);
    ctx.fill();
    // Inner white dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  });

  return pts;   // returned for hit-testing
}

/**
 * Draw the center origin marker.
 */
function drawCenter(ctx, cx, cy, T) {
  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = T.accent;
  ctx.shadowColor = T.accent;
  ctx.shadowBlur  = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  // Inner dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = T.bg;
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────
// HIT-TESTING
// ─────────────────────────────────────────────────────────────

/**
 * Given a mouse position, find which region axis label the user
 * is nearest to (within LABEL_RADIUS pixels).
 * Returns region index or null.
 */
function hitTestRegion(mx, my, cx, cy, maxR, N) {
  const LABEL_R  = maxR + 26;
  const HIT_R    = 22;
  let nearest    = null;
  let nearestD   = HIT_R;

  for (let i = 0; i < N; i++) {
    const angle = axisAngle(i, N);
    const lx    = cx + Math.cos(angle) * LABEL_R;
    const ly    = cy + Math.sin(angle) * LABEL_R;
    const dist  = Math.hypot(mx - lx, my - ly);
    if (dist < nearestD) { nearestD = dist; nearest = i; }
  }
  return nearest;
}

/**
 * Given a mouse position, find which crop polygon vertex is
 * nearest (within 28px), or which polygon the mouse is inside.
 * Returns crop id or null.
 */
function hitTestCrop(mx, my, cx, cy, maxR, N, crops, activeCrops, progress) {
  const HIT_VERTEX = 28;
  let nearestCrop  = null;
  let nearestDist  = HIT_VERTEX;

  crops.filter(c => activeCrops.has(c.id)).forEach(crop => {
    const norm = normalise(crop.values);
    norm.forEach((n, i) => {
      const { x, y } = pointXY(cx, cy, maxR, i, N, n, progress);
      const dist     = Math.hypot(mx - x, my - y);
      if (dist < nearestDist) { nearestDist = dist; nearestCrop = crop.id; }
    });
  });

  if (!nearestCrop) {
    // Point-in-polygon test — check distance from center as rough proxy
    const distFromCenter = Math.hypot(mx - cx, my - cy);
    if (distFromCenter < maxR * 0.7) {
      // Find crop polygon that encloses this point (use winding number check)
      crops.filter(c => activeCrops.has(c.id)).forEach(crop => {
        const norm = normalise(crop.values);
        const pts  = norm.map((n, i) => pointXY(cx, cy, maxR, i, N, n, progress));
        if (pointInPolygon(mx, my, pts)) nearestCrop = crop.id;
      });
    }
  }
  return nearestCrop;
}

/** Standard point-in-polygon (ray casting) */
function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function Tooltip({ tooltip, T }) {
  if (!tooltip) return null;
  const { x, y, title, type, color, regionPrices, cropPrices } = tooltip;

  return (
    <div
      aria-live="polite"
      style={{
        position:     'absolute',
        left:         Math.min(Math.max(8, x + 14), 480),
        top:          Math.max(8, y - 10),
        background:   T.bg,
        border:       `1px solid ${hexToRgba('#00c96b', 0.35)}`,
        borderRadius: '8px',
        padding:      '10px 14px',
        fontSize:     '12px',
        pointerEvents:'none',
        zIndex:       20,
        minWidth:     '170px',
        maxWidth:     '220px',
        boxShadow:    T.shadow,
      }}
    >
      {/* Title */}
      <div style={{
        fontWeight:    600,
        fontSize:      '13px',
        color:         type === 'crop' ? color : '#00c96b',
        paddingBottom: '7px',
        marginBottom:  '7px',
        borderBottom:  `1px solid ${T.border}`,
      }}>
        {title}
      </div>

      {/* Region tooltip — show all active crop prices */}
      {type === 'region' && regionPrices?.map(p => (
        <div key={p.name} style={{
          display:        'flex',
          justifyContent: 'space-between',
          gap:            '12px',
          marginBottom:   '4px',
          opacity:        p.active ? 1 : 0.3,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: T.textMid }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 600, color: T.textBright }}>
            Tsh {p.price != null ? p.price.toLocaleString() : '--'}
          </span>
        </div>
      ))}

      {/* Crop tooltip — show price per region */}
      {type === 'crop' && cropPrices?.map(p => (
        <div key={p.region} style={{
          display:        'flex',
          justifyContent: 'space-between',
          gap:            '12px',
          marginBottom:   '4px',
        }}>
          <span style={{ color: T.textMid, fontSize: '11px' }}>{p.region}</span>
          <span style={{ fontWeight: 600, color: T.textBright, fontSize: '11px' }}>
            Tsh {p.price != null ? p.price.toLocaleString() : '--'}
          </span>
        </div>
      ))}
    </div>
  );
}

function LegendItem({ crop, isActive, isHighlighted, T, onToggle, onEnter, onLeave }) {
  return (
    <button
      onClick={onToggle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-pressed={isActive}
      aria-label={`${isActive ? 'Hide' : 'Show'} ${crop.name}`}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '6px',
        padding:        '5px 12px',
        borderRadius:   '100px',
        cursor:         'pointer',
        border:         `1px solid ${isHighlighted
          ? crop.color
          : isActive
            ? hexToRgba(crop.color, 0.4)
            : T.border}`,
        background:     isHighlighted
          ? hexToRgba(crop.color, 0.14)
          : isActive
            ? hexToRgba(crop.color, 0.07)
            : 'transparent',
        color:          isActive ? T.textBright : T.text,
        fontSize:       '12px',
        fontWeight:     isHighlighted ? 600 : 400,
        transition:     'all 0.15s ease',
        opacity:        isActive ? 1 : 0.5,
        outline:        'none',
      }}
    >
      <span style={{
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   isActive ? crop.color : T.text,
        flexShrink:   0,
        transition:   'background 0.15s',
      }} />
      {crop.nameShort}
    </button>
  );
}

function StatCard({ crop, isActive, regionsShort, T }) {
  const vals      = crop.values;
  const min       = Math.min(...vals);
  const max       = Math.max(...vals);
  const avg       = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const spread    = (((max - min) / min) * 100).toFixed(1);
  const minIdx    = vals.indexOf(min);
  const maxIdx    = vals.indexOf(max);

  return (
    <div style={{
      padding:      '10px 12px',
      background:   isActive ? hexToRgba(crop.color, 0.07) : T.cardBg,
      border:       `1px solid ${isActive ? hexToRgba(crop.color, 0.22) : T.border}`,
      borderRadius: '8px',
      opacity:      isActive ? 1 : 0.4,
      transition:   'opacity 0.2s, border-color 0.2s',
    }}>
      <div style={{ fontSize: '9px', letterSpacing: '.06em', textTransform: 'uppercase', color: crop.color, fontWeight: 700, marginBottom: '4px' }}>
        {crop.nameShort}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: T.textBright }}>
        {spread}%
        <span style={{ fontSize: '10px', fontWeight: 400, color: T.text, marginLeft: '3px' }}>spread</span>
      </div>
      <div style={{ fontSize: '10px', color: T.text, marginTop: '3px' }}>
        ↓ {regionsShort[minIdx]}  ·  ↑ {regionsShort[maxIdx]}
      </div>
      <div style={{ fontSize: '10px', color: T.textMid, marginTop: '2px' }}>
        Avg Tsh {avg.toLocaleString()}/kg
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

const RadialPriceWeb = ({
  crops      = DEFAULT_CROPS,
  regions    = DEFAULT_REGIONS,
  regionsShort = DEFAULT_REGIONS_SHORT,
  chartHeight: chartHeightProp = null,
  selectedCropName = null,
}) => {
  const canvasRef      = useRef(null);
  const containerRef   = useRef(null);
  const animRef        = useRef(null);
  const progressRef    = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Responsive chart height: smaller on mobile, default to 440 before measurement
  const chartHeight = chartHeightProp || (containerWidth === 0 ? 440 : containerWidth < 400 ? 300 : containerWidth < 600 ? 360 : 440);

  // Read theme from data-theme attribute (set by app header toggle)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      const theme = document.documentElement.getAttribute('data-theme');
      return theme !== 'light';
    }
    return true;
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDark(theme !== 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const T = useMemo(() => buildTheme(isDark), [isDark]);

  const [activeCrops,    setActiveCrops]    = useState(new Set(crops.map(c => c.id)));
  const [highlightedCrop, setHighlightedCrop] = useState(null);
  const [selectedCrop,   setSelectedCrop]   = useState(null);
  const [hoveredRegion,  setHoveredRegion]  = useState(null);
  const [tooltip,        setTooltip]        = useState(null);
  const [animProgress,   setAnimProgress]   = useState(0);

  // Sync selectedCropName prop → internal selectedCrop state
  useEffect(() => {
    if (selectedCropName) {
      const match = crops.find(c => c.name === selectedCropName || c.nameShort === selectedCropName);
      if (match) {
        setSelectedCrop(match.id);
        setHighlightedCrop(match.id);
      }
    } else {
      setSelectedCrop(null);
    }
  }, [selectedCropName, crops]);

  // Update activeCrops when crops prop changes (region filtering)
  useEffect(() => {
    setActiveCrops(new Set(crops.map(c => c.id)));
  }, [crops]);

  // The effective focused crop (selected takes priority over hovered)
  const focusedCrop = selectedCrop || highlightedCrop;

  // ── Full draw function ──────────────────────────────────
  const draw = useCallback((progress) => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = container.clientWidth;
    const H   = chartHeight;
    const N   = regions.length;

    // Resize canvas only when dimensions changed
    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width  = targetW;
      canvas.height = targetH;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    }

    const ctx  = canvas.getContext('2d');
    const cx   = W / 2;
    const cy   = H / 2 + 10;
    const maxR = Math.min(W / 2, H / 2) - (W < 500 ? 58 : 52);

    ctx.clearRect(0, 0, W, H);

    // Grid, axes, region labels
    drawGrid(ctx, cx, cy, maxR, N, 5, T);
    drawRegionLabels(ctx, cx, cy, maxR, N, regionsShort, hoveredRegion, T);

    // Crop polygons — inactive/dimmed ones drawn first
    const activeCropList = crops.filter(c => activeCrops.has(c.id));

    // Draw non-focused polygons first (behind)
    activeCropList.forEach(crop => {
      if (crop.id === focusedCrop) return;
      drawCropPolygon(
        ctx, cx, cy, maxR, N, crop,
        normalise(crop.values), progress,
        false,                  // isHighlighted
        focusedCrop !== null,   // isDimmed when another crop is focused
      );
    });

    // Draw focused polygon on top
    if (focusedCrop) {
      const fc = crops.find(c => c.id === focusedCrop);
      if (fc && activeCrops.has(fc.id)) {
        drawCropPolygon(ctx, cx, cy, maxR, N, fc, normalise(fc.values), progress, true, false);
      }
    }

    drawCenter(ctx, cx, cy, T);

    // Center label
    ctx.font         = `9px -apple-system, "Inter", sans-serif`;
    ctx.fillStyle    = T.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Center = national low', cx, cy + maxR / 5 / 1.5 + 2);
  }, [
    crops, regions, regionsShort, chartHeight,
    activeCrops, focusedCrop, hoveredRegion, T,
  ]);

  // ── Entry animation ────────────────────────────────────
  useEffect(() => {
    progressRef.current = 0;
    const instant = prefersReducedMotion();

    if (instant) {
      progressRef.current = 1;
      setAnimProgress(1);
      return;
    }

    const step = () => {
      progressRef.current = Math.min(1, progressRef.current + 0.028);
      setAnimProgress(progressRef.current);
      if (progressRef.current < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);   // run once on mount

  // Re-animate when active crops change
  useEffect(() => {
    if (prefersReducedMotion()) return;
    progressRef.current = 0;
    const step = () => {
      progressRef.current = Math.min(1, progressRef.current + 0.04);
      setAnimProgress(progressRef.current);
      if (progressRef.current < 1) animRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(step);
  }, [activeCrops]);

  // ── Redraw on any state change ─────────────────────────
  useEffect(() => {
    draw(Math.min(progressRef.current, animProgress));
  }, [draw, animProgress]);

  // ── ResizeObserver ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || el.clientWidth;
      setContainerWidth(w);
      draw(progressRef.current);
    });
    // Set initial width
    setContainerWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ── Geometry helpers (recomputed inside handlers) ─────
  const getGeometry = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const W  = container.clientWidth;
    const H  = chartHeight;
    return {
      cx:   W / 2,
      cy:   H / 2 + 10,
      maxR: Math.min(W / 2, H / 2) - (W < 500 ? 58 : 52),
      N:    regions.length,
    };
  }, [chartHeight, regions.length]);

  // ── Mouse move ─────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const geo   = getGeometry();
    if (!geo) return;
    const { cx, cy, maxR, N } = geo;
    const p = progressRef.current;

    // Region label hit
    const rHit = hitTestRegion(mx, my, cx, cy, maxR, N);
    setHoveredRegion(rHit);

    // Crop polygon hit (only when no region hit)
    const cHit = rHit === null
      ? hitTestCrop(mx, my, cx, cy, maxR, N, crops, activeCrops, p)
      : null;

    if (!selectedCrop) setHighlightedCrop(cHit);

    // Build tooltip
    if (rHit !== null) {
      setTooltip({
        x:    mx, y: my,
        title: regions[rHit],
        type: 'region',
        regionPrices: crops.map(c => ({
          name:   c.nameShort,
          color:  c.color,
          price:  c.values[rHit] != null ? c.values[rHit] : null,
          active: activeCrops.has(c.id),
        })),
      });
    } else if (cHit) {
      const crop = crops.find(c => c.id === cHit);
      setTooltip(crop ? {
        x: mx, y: my,
        title:  crop.name,
        type:   'crop',
        color:  crop.color,
        cropPrices: regions.map((r, i) => ({
          region: regionsShort[i],
          price:  crop.values[i],
        })),
      } : null);
    } else {
      setTooltip(null);
    }
  }, [crops, regions, regionsShort, activeCrops, selectedCrop, getGeometry]);

  const handleMouseLeave = useCallback(() => {
    if (!selectedCrop) setHighlightedCrop(null);
    setHoveredRegion(null);
    setTooltip(null);
  }, [selectedCrop]);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const geo   = getGeometry();
    if (!geo) return;
    const { cx, cy, maxR, N } = geo;

    const cHit = hitTestCrop(mx, my, cx, cy, maxR, N, crops, activeCrops, progressRef.current);
    setSelectedCrop(prev => {
      const next = cHit === prev ? null : cHit;
      setHighlightedCrop(next);
      return next;
    });
  }, [crops, activeCrops, getGeometry]);

  // ── Touch handlers (mobile) ────────────────────────────
  const handleTouchStart = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = e.touches[0];
    const rect  = canvas.getBoundingClientRect();
    const mx    = touch.clientX - rect.left;
    const my    = touch.clientY - rect.top;
    const geo   = getGeometry();
    if (!geo) return;
    const { cx, cy, maxR, N } = geo;
    const p = progressRef.current;

    const rHit = hitTestRegion(mx, my, cx, cy, maxR, N);
    setHoveredRegion(rHit);

    const cHit = rHit === null
      ? hitTestCrop(mx, my, cx, cy, maxR, N, crops, activeCrops, p)
      : null;

    if (!selectedCrop) setHighlightedCrop(cHit);

    if (rHit !== null) {
      setTooltip({
        x: mx, y: my,
        title: regions[rHit],
        type: 'region',
        regionPrices: crops.map(c => ({
          name: c.nameShort, color: c.color,
          price: c.values[rHit], active: activeCrops.has(c.id),
        })),
      });
    } else if (cHit) {
      const crop = crops.find(c => c.id === cHit);
      setTooltip(crop ? {
        x: mx, y: my, title: crop.name, type: 'crop', color: crop.color,
        cropPrices: regions.map((r, i) => ({ region: regionsShort[i], price: crop.values[i] })),
      } : null);
      // Lock focus on tap
      setSelectedCrop(prev => {
        const next = cHit === prev ? null : cHit;
        setHighlightedCrop(next);
        return next;
      });
    } else {
      setTooltip(null);
    }
  }, [crops, regions, regionsShort, activeCrops, selectedCrop, getGeometry]);

  const handleTouchEnd = useCallback(() => {
    // Keep tooltip visible for 2s on mobile, then dismiss
    setTimeout(() => {
      if (!selectedCrop) setHighlightedCrop(null);
      setHoveredRegion(null);
      setTooltip(null);
    }, 2000);
  }, [selectedCrop]);

  // ── Toggle crop visibility ─────────────────────────────
  const toggleCrop = (cropId) => {
    setActiveCrops(prev => {
      const next = new Set(prev);
      if (next.has(cropId)) {
        // Never hide all crops
        if (next.size > 1) next.delete(cropId);
      } else {
        next.add(cropId);
      }
      return next;
    });
    // Clear focus if toggled crop was focused
    if (focusedCrop === cropId) {
      setHighlightedCrop(null);
      setSelectedCrop(null);
    }
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' }}>

      {/* Chart container */}
      <div
        style={{
          background:   T.containerBg,
          borderRadius: '12px',
          padding:      containerWidth < 500 ? '14px 12px 12px' : '20px 20px 16px',
          border:       `1px solid ${T.containerBorder}`,
        }}
      >

        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <h3 style={{ margin: 0, color: T.heading, fontSize: '15px', fontWeight: 600, letterSpacing: '-.01em' }}>
              Regional Price Web
            </h3>
            <span style={{ fontSize: '11px', color: T.badge, background: T.badgeBg, padding: '2px 8px', borderRadius: '100px', border: `1px solid ${T.badgeBorder}` }}>
              Live · {regions.length} regions · {crops.length} crops
            </span>
          </div>
          <p style={{ margin: '5px 0 0', color: T.subtitle, fontSize: '12px', lineHeight: 1.5 }}>
            Normalised per crop — shape shows regional price inequality.&nbsp;
            Hover axis labels to compare by region · Click polygon to lock focus.
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
          {crops.map(crop => (
            <LegendItem
              key={crop.id}
              crop={crop}
              isActive={activeCrops.has(crop.id)}
              isHighlighted={focusedCrop === crop.id}
              T={T}
              onToggle={() => toggleCrop(crop.id)}
              onEnter={() => { if (!selectedCrop) setHighlightedCrop(crop.id); }}
              onLeave={() => { if (!selectedCrop) setHighlightedCrop(null); }}
            />
          ))}
          {focusedCrop && (
            <button
              onClick={() => { setSelectedCrop(null); setHighlightedCrop(null); }}
              style={{
                padding: '5px 10px', borderRadius: '100px', cursor: 'pointer',
                border: `1px solid ${T.border}`, background: 'transparent',
                color: T.text, fontSize: '11px', outline: 'none',
              }}
            >
              Clear focus ✕
            </button>
          )}
        </div>

        {/* Canvas + Tooltip */}
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', cursor: 'crosshair', touchAction: 'manipulation' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="img"
            aria-label={
              `Radial chart showing price distribution across ${regions.length} Tanzania regions ` +
              `for ${crops.map(c => c.nameShort).join(', ')}. ` +
              `Polygons further from center indicate higher relative price in that region.`
            }
          />
          <Tooltip tooltip={tooltip} T={T} />
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${containerWidth < 500 ? '130px' : '140px'}, 1fr))`,
          gap: '8px',
          marginTop: '16px',
          paddingTop: '14px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {crops.map(crop => (
            <StatCard
              key={crop.id}
              crop={crop}
              isActive={activeCrops.has(crop.id)}
              regionsShort={regionsShort}
              T={T}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

export default RadialPriceWeb;
