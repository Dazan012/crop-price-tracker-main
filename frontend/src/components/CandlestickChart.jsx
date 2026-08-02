/**
 * CandlestickChart.jsx
 * Smart Crops Market Price Tracker — Tanzania
 *
 * Full OHLC candlestick chart with volume histogram,
 * moving averages, hover crosshair, animated entry,
 * timeframe selector, chart-type switcher, and crop selector.
 *
 * Features:
 *   • Canvas-rendered — zero external chart dependencies
 *   • OHLC candlestick bodies + wicks, green/red colour coded
 *   • Volume histogram pane below main chart
 *   • MA7  overlay (amber solid line)
 *   • MA30 overlay (blue dashed line)
 *   • Current-price horizontal line with floating label
 *   • Hover: crosshair + full OHLC tooltip
 *   • Entry animation — candles cascade left→right on mount
 *   • Scroll-to-zoom (mouse wheel / trackpad pinch)
 *   • Timeframe selector: 1W · 2W · 1M · 3M · ALL
 *   • Chart type:  Candlestick · Area · Line
 *   • Crop selector: 4 Tanzania crops
 *   • Stat cards: Open · High · Low · Close · Volume · Change
 *   • Responsive via ResizeObserver
 *   • Reduced-motion respected
 *   • Dark green theme: #071A0A background, #00c96b accent
 *
 * Dependencies:  React 18+  (nothing else needed)
 *
 * Usage:
 *   import CandlestickChart from './CandlestickChart';
 *   <CandlestickChart />                      // defaults
 *   <CandlestickChart crop="nyanya" days={90} />
 */

import React, {
  useRef, useEffect, useState, useMemo, useCallback,
} from 'react';

// ─────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────
function buildTheme(isDark) {
  return isDark ? {
    bg:       '#071A0A',
    surface:  '#0d2310',
    grid:     'rgba(0,201,107,0.07)',
    gridMid:  'rgba(0,201,107,0.13)',
    axis:     'rgba(176,196,177,0.45)',
    text:     'rgba(176,196,177,0.65)',
    textBrt:  'rgba(200,220,200,0.9)',
    accent:   '#00c96b',
    up:       '#22c55e',
    dn:       '#ef4444',
    upFill:   'rgba(34,197,94,0.85)',
    dnFill:   '#ef4444',
    ma7:      '#f59e0b',
    ma30:     '#3b82f6',
    white:    'rgba(255,255,255,0.88)',
    border:   'rgba(0,201,107,0.18)',
    btnBg:    'rgba(255,255,255,0.04)',
    btnActive:'rgba(0,201,107,0.2)',
    btnText:  'rgba(176,196,177,0.5)',
    btnActiveText: '#00c96b',
    cardBg:   'rgba(255,255,255,0.03)',
    cardBorder: 'rgba(0,201,107,0.12)',
    labelColor: 'rgba(176,196,177,0.5)',
    valColor: '#e5ede5',
  } : {
    bg:       '#ffffff',
    surface:  '#f0f7f1',
    grid:     'rgba(5,150,105,0.08)',
    gridMid:  'rgba(5,150,105,0.15)',
    axis:     'rgba(0,0,0,0.25)',
    text:     'rgba(0,0,0,0.50)',
    textBrt:  'rgba(0,0,0,0.85)',
    accent:   '#059669',
    up:       '#16a34a',
    dn:       '#dc2626',
    upFill:   'rgba(22,163,74,0.85)',
    dnFill:   '#dc2626',
    ma7:      '#d97706',
    ma30:     '#2563eb',
    white:    'rgba(0,0,0,0.85)',
    border:   'rgba(5,150,105,0.2)',
    btnBg:    'rgba(0,0,0,0.03)',
    btnActive:'rgba(5,150,105,0.12)',
    btnText:  'rgba(0,0,0,0.45)',
    btnActiveText: '#059669',
    cardBg:   'rgba(0,0,0,0.02)',
    cardBorder: 'rgba(5,150,105,0.15)',
    labelColor: 'rgba(0,0,0,0.45)',
    valColor: '#1a2e1f',
  };
}

// ─────────────────────────────────────────────────────────────
// CROP CONFIGURATIONS
// ─────────────────────────────────────────────────────────────
export const CROPS = {
  maize:    { name: 'Maize',      unit: 'TZS/kg', base: 480, trend: 0.55, vol: 2.2, seed: 42,  color: '#22c55e' },
  rice:     { name: 'Rice',       unit: 'TZS/kg', base: 2200, trend: 0.18, vol: 1.8, seed: 13,  color: '#ef4444' },
  beans:    { name: 'Beans',      unit: 'TZS/kg', base: 1500, trend: 0.28, vol: 1.6, seed: 99, color: '#8b5cf6' },
  sorghum:  { name: 'Sorghum',    unit: 'TZS/kg', base: 800, trend: 0.35, vol: 2.0, seed: 55, color: '#f59e0b' },
  potatoes: { name: 'Potatoes',   unit: 'TZS/kg', base: 310, trend: 0.48, vol: 2.0, seed: 77, color: '#06b6d4' },
  cassava:  { name: 'Cassava',    unit: 'TZS/kg', base: 250, trend: 0.22, vol: 1.4, seed: 33, color: '#ec4899' },
};

const CROP_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#3b82f6', '#84cc16'];

const TIMEFRAMES = [
  { label: '1W',  days: 7  },
  { label: '2W',  days: 14 },
  { label: '1M',  days: 30 },
  { label: '3M',  days: 60 },
  { label: 'ALL', days: null },
];

const CHART_TYPES = ['Candle', 'Area', 'Line'];

// ─────────────────────────────────────────────────────────────
// SEEDED RNG
// ─────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ─────────────────────────────────────────────────────────────
// OHLC DATA GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Generate N days of realistic OHLC + volume data.
 * Guarantees: low <= min(open,close) and high >= max(open,close).
 */
export function generateOHLC(cropCfg, totalDays = 90) {
  const { base, trend, vol, seed } = cropCfg;
  const r   = seededRng(seed);
  const data = [];
  let close  = base;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - totalDays);

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const open    = close;
    const change  = (r() - 0.47) * vol * open / 100;
    close         = Math.max(base * 0.65, Math.min(base * 1.55, open + change));

    const body    = Math.abs(close - open);
    const wickMul = 0.4 + r() * 1.2;
    const high    = Math.max(open, close) + body * wickMul + r() * base * 0.003;
    const low     = Math.min(open, close) - body * wickMul - r() * base * 0.003;

    const volBase = 800 + r() * 3200;
    const volume  = Math.round(volBase + Math.abs(change) * 120);

    data.push({
      date,
      dateLabel: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      open:   Math.round(open),
      high:   Math.round(high),
      low:    Math.round(Math.max(1, low)),
      close:  Math.round(close),
      volume,
      isUp:   close >= open,
    });
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
// MOVING AVERAGES
// ─────────────────────────────────────────────────────────────
function calcMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return Math.round(closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period);
  });
}

// ─────────────────────────────────────────────────────────────
// EASING
// ─────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ─────────────────────────────────────────────────────────────
// CANVAS SETUP
// ─────────────────────────────────────────────────────────────

/**
 * Resize canvas to match container width × given height at device pixel ratio.
 * Returns { ctx, W, H, dpr }.
 */
function setupCanvas(canvas, container, H) {
  const dpr = window.devicePixelRatio || 1;
  const W   = container.clientWidth || 680;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W, H, dpr };
}

// ─────────────────────────────────────────────────────────────
// DRAWING FUNCTIONS
// ─────────────────────────────────────────────────────────────

const CANVAS_H  = 480;
const PAD       = { t: 22, r: 76, b: 30, l: 10 };

function buildLayout(H) {
  const avail  = H - PAD.t - PAD.b;
  const chartH = avail * 0.71;
  const gap    = avail * 0.05;
  const volH   = avail * 0.19;
  const volTop = PAD.t + chartH + gap;
  return { chartH, volH, volTop };
}

function buildCoords(W, viewData, layout, animProgress) {
  const { chartH, volH, volTop } = layout;
  const n          = viewData.length;
  const chartW     = W - PAD.l - PAD.r;
  const candleSpacing = chartW / n;
  const bodyW      = Math.max(2, Math.min(18, candleSpacing * 0.62));

  const highs  = viewData.map(d => d.high);
  const lows   = viewData.map(d => d.low);
  const maxVol = Math.max(...viewData.map(d => d.volume));
  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const range  = rawMax - rawMin || 10;
  const maxP   = rawMax + range * 0.06;
  const minP   = rawMin - range * 0.04;

  const px = i => PAD.l + i * candleSpacing + candleSpacing / 2;
  const py = v => PAD.t + chartH - ((v - minP) / (maxP - minP)) * chartH;
  const vy = v => volTop + volH - (v / maxVol) * volH;

  // Cascade progress: each candle i becomes visible proportionally
  const candleProgress = (i) => {
    if (animProgress >= 1) return 1;
    const start = (i / n) * 0.7;
    return Math.min(1, Math.max(0, (animProgress - start) / 0.3));
  };

  return { n, chartW, candleSpacing, bodyW, maxP, minP, maxVol, px, py, vy, candleProgress };
}

function drawBackground(ctx, W, H, T) {
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
}

function drawGrid(ctx, W, layout, minP, maxP, T, steps = 6) {
  const { chartH } = layout;
  for (let i = 0; i <= steps; i++) {
    const y  = PAD.t + i * chartH / steps;
    const pr = maxP - i * (maxP - minP) / steps;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r + 2, y);
    ctx.strokeStyle = i === 0 || i === steps ? T.gridMid : T.grid;
    ctx.lineWidth   = 0.5;
    ctx.stroke();
    ctx.fillStyle   = T.text;
    ctx.font        = '10px -apple-system, sans-serif';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pr).toLocaleString(), W - PAD.r + 7, y);
  }
}

function drawVolumeDivider(ctx, W, layout, T) {
  const { volTop } = layout;
  ctx.beginPath();
  ctx.moveTo(PAD.l, volTop);
  ctx.lineTo(W - PAD.r, volTop);
  ctx.strokeStyle = T.grid;
  ctx.lineWidth   = 0.5;
  ctx.stroke();
  ctx.fillStyle   = T.text;
  ctx.font        = '9px sans-serif';
  ctx.textAlign   = 'left';
  ctx.fillText('VOL', PAD.l + 4, volTop + 10);
}

function drawDateLabels(ctx, W, H, viewData, px, n, T) {
  const step = Math.max(1, Math.ceil(n / 9));
  ctx.fillStyle  = T.text;
  ctx.font       = '10px -apple-system, sans-serif';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'top';
  viewData.forEach((d, i) => {
    if (i % step !== 0) return;
    ctx.fillText(d.dateLabel, px(i), H - PAD.b + 5);
  });
}

function drawVolumeBar(ctx, x, d, bodyW, volH, volTop, maxVol, progress) {
  if (progress <= 0) return;
  const h = (d.volume / maxVol) * volH * easeOutCubic(progress);
  ctx.fillStyle = d.isUp ? 'rgba(34,197,94,0.38)' : 'rgba(239,68,68,0.38)';
  ctx.fillRect(x - bodyW / 2, volTop + volH - h, bodyW, h);
}

function drawSingleCandle(ctx, x, d, bodyW, py, progress, T) {
  if (progress <= 0) return;
  const p   = easeOutCubic(progress);
  const col = d.isUp ? T.up : T.dn;

  const highY  = py(d.high);
  const lowY   = py(d.low);
  const openY  = py(d.open);
  const closeY = py(d.close);
  const bodyTop = Math.min(openY, closeY);
  const bodyBot = Math.max(openY, closeY);
  const bodyH   = Math.max(1.5, bodyBot - bodyTop);

  // Animate wick from center outward
  const centerY = (highY + lowY) / 2;
  const animHighY = centerY - (centerY - highY) * p;
  const animLowY  = centerY + (lowY - centerY) * p;

  // Wick
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, animHighY);
  ctx.lineTo(Math.round(x) + 0.5, animLowY);
  ctx.strokeStyle = col;
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Animated body height
  const midBody = (bodyTop + bodyBot) / 2;
  const animTop = midBody - (bodyH / 2) * p;
  const animH   = bodyH * p;

  if (d.isUp) {
    ctx.fillStyle   = T.upFill;
    ctx.fillRect(x - bodyW / 2, animTop, bodyW, animH);
    ctx.strokeStyle = T.up;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(x - bodyW / 2, animTop, bodyW, animH);
  } else {
    ctx.fillStyle = T.dnFill;
    ctx.fillRect(x - bodyW / 2, animTop, bodyW, animH);
  }
}

function drawAreaLine(ctx, W, viewData, layout, px, py, animProgress, T) {
  const { chartH } = layout;
  const baseY  = PAD.t + chartH;
  const n      = viewData.length;
  const visibleN = Math.round(n * easeOutCubic(Math.min(1, animProgress * 1.5)));

  if (visibleN < 2) return;
  const pts = viewData.slice(0, visibleN).map((d, i) => ({ x: px(i), y: py(d.close) }));

  // Gradient fill
  const g = ctx.createLinearGradient(0, PAD.t, 0, baseY);
  g.addColorStop(0,   'rgba(0,201,107,0.28)');
  g.addColorStop(0.6, 'rgba(0,201,107,0.08)');
  g.addColorStop(1,   'rgba(0,201,107,0.01)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  pts.forEach((p, i) => {
    if (i === 0) { ctx.lineTo(p.x, p.y); return; }
    const mx = (pts[i-1].x + p.x) / 2;
    const my = (pts[i-1].y + p.y) / 2;
    ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
  });
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // Line on top
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) { ctx.moveTo(p.x, p.y); return; }
    const mx = (pts[i-1].x + p.x) / 2;
    const my = (pts[i-1].y + p.y) / 2;
    ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
  });
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.strokeStyle = T.accent;
  ctx.lineWidth   = 2.2;
  ctx.stroke();
}

function drawSimpleLine(ctx, viewData, layout, px, py, animProgress, T) {
  const n = viewData.length;
  const vis = Math.round(n * easeOutCubic(Math.min(1, animProgress * 1.5)));
  if (vis < 2) return;
  const pts = viewData.slice(0, vis).map((d, i) => ({ x: px(i), y: py(d.close) }));
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) { ctx.moveTo(p.x, p.y); return; }
    const mx = (pts[i-1].x + p.x) / 2;
    const my = (pts[i-1].y + p.y) / 2;
    ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
  });
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.strokeStyle = T.accent;
  ctx.lineWidth   = 2;
  ctx.stroke();
}

function drawMALine(ctx, closes, period, color, dashed, px, py, n) {
  const values = calcMA(closes, period);
  ctx.beginPath();
  let started = false;
  values.forEach((v, i) => {
    if (v === null) return;
    const x = px(i), y = py(v);
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.6;
  if (dashed) ctx.setLineDash([5, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCurrentPriceLine(ctx, W, lastClose, py, T) {
  const y = py(lastClose);
  ctx.beginPath();
  ctx.moveTo(PAD.l, y);
  ctx.lineTo(W - PAD.r, y);
  ctx.strokeStyle = T.accent + '80';
  ctx.lineWidth   = 0.75;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label pill
  const txt   = `Tsh ${lastClose.toLocaleString()}`;
  const tW    = ctx.measureText(txt).width + 12;
  const pillX = W - PAD.r + 2, pillY = y - 9, pillW = tW + 4, pillH = 18, pillR = 3;
  ctx.fillStyle = T.accent;
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR, pillR);
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH, pillR);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR, pillR);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.arcTo(pillX, pillY, pillX + pillR, pillY, pillR);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle  = T.bg;
  ctx.font       = 'bold 10px -apple-system, sans-serif';
  ctx.textAlign  = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, W - PAD.r + 7, y);
}

function drawCrosshair(ctx, W, layout, hoverIdx, px, py, vy, viewData, T) {
  if (hoverIdx < 0 || hoverIdx >= viewData.length) return;
  const d = viewData[hoverIdx];
  const x = px(hoverIdx);
  const y = py(d.close);
  const { chartH, volTop, volH } = layout;

  // Vertical line through full chart height
  ctx.beginPath();
  ctx.moveTo(x, PAD.t);
  ctx.lineTo(x, volTop + volH);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Horizontal line at close price
  ctx.beginPath();
  ctx.moveTo(PAD.l, y);
  ctx.lineTo(W - PAD.r, y);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 0.75;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label on y-axis at close
  const txt = Math.round(d.close).toLocaleString();
  const tW  = ctx.measureText(txt).width + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(W - PAD.r + 2, y - 9, tW, 18);
  ctx.fillStyle    = T.textBrt;
  ctx.font         = '10px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, W - PAD.r + 7, y);

  // Date label on x-axis
  ctx.fillStyle  = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 22, CANVAS_H - PAD.b, 44, 16);
  ctx.fillStyle  = T.textBrt;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(d.dateLabel, x, CANVAS_H - PAD.b + 2);

  // Dot on the line
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle   = T.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle   = T.bg;
  ctx.fill();

  // Volume bar highlight ring
  const volY = vy(d.volume);
  ctx.beginPath();
  ctx.arc(x, volY, 3, 0, Math.PI * 2);
  ctx.fillStyle = d.isUp ? T.up : T.dn;
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────
function StatCard({ label, value, delta, up, T }) {
  return (
    <div style={{
      padding:      '9px 12px',
      background:   T.cardBg,
      border:       `1px solid ${T.cardBorder}`,
      borderRadius: '6px',
    }}>
      <div style={{ fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: T.labelColor, marginBottom: 3, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.valColor, lineHeight: 1.1 }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 10, marginTop: 2, color: up ? T.up : T.dn, fontWeight: 500 }}>
          {up ? '▲' : '▼'} {delta}
        </div>
      )}
    </div>
  );
}

function OHLCTooltip({ d, cropCfg, visible, x, y, containerW, T }) {
  if (!d || !visible) return null;
  const chg    = ((d.close - d.open) / d.open * 100).toFixed(2);
  const isUp   = d.close >= d.open;
  const tipW   = 175;
  let left     = x + 14;
  if (left + tipW > containerW) left = x - tipW - 12;

  return (
    <div style={{
      position:     'absolute',
      left:         Math.max(4, left),
      top:          Math.max(4, y - 20),
      background:   T.surface,
      border:       `1px solid ${T.border}`,
      borderRadius: 8,
      padding:      '10px 14px',
      fontSize:     12,
      pointerEvents:'none',
      zIndex:       20,
      width:        tipW,
      boxShadow:    T.bg === '#ffffff' ? '0 8px 28px rgba(0,0,0,0.15)' : '0 8px 28px rgba(0,0,0,0.55)',
    }}>
      <div style={{ fontWeight: 600, color: cropCfg.color, marginBottom: 7, fontSize: 13 }}>
        {d.dateLabel} · {cropCfg.name.split(' ')[0]}
      </div>
      {[
        ['Open',   d.open,   null],
        ['High',   d.high,   T.up],
        ['Low',    d.low,    T.dn],
        ['Close',  d.close,  isUp ? T.up : T.dn],
      ].map(([lbl, val, col]) => (
        <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: T.text }}>{lbl}</span>
          <span style={{ fontWeight: 600, color: col || T.valColor }}>
            Tsh {val.toLocaleString()}
          </span>
        </div>
      ))}
      <div style={{
        marginTop: 7, paddingTop: 7,
        borderTop: `1px solid ${T.grid}`,
        display:   'flex', justifyContent: 'space-between',
      }}>
        <span style={{ color: T.text }}>Change</span>
        <span style={{ fontWeight: 700, color: isUp ? T.up : T.dn }}>
          {isUp ? '▲ +' : '▼ '}{chg}%
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ color: T.text }}>Volume</span>
        <span style={{ color: T.valColor }}>{d.volume.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const CandlestickChart = ({
  crop:   initCrop = 'maize',
  days:   totalDays = 90,
  externalData = null,
  availableCrops = null,
  selectedCrop = null,
  onCropChange = null,
}) => {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const animRef      = useRef(null);
  const progressRef  = useRef(0);

  // Theme: respond to data-theme attribute on <html>
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') !== 'light';
    }
    return true;
  });
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  const T = useMemo(() => buildTheme(isDark), [isDark]);

  const [cropKey,    setCropKey]    = useState(initCrop);
  const [chartType,  setChartType]  = useState('Candle');
  const [tfIdx,      setTfIdx]      = useState(3);          // default 3M
  const [hoverIdx,   setHoverIdx]   = useState(-1);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [animProg,   setAnimProg]   = useState(0);
  const [containerW, setContainerW] = useState(680);

  // ── Controlled mode: build dynamic crop configs from availableCrops ──
  const isControlled = Array.isArray(availableCrops) && availableCrops.length > 0;

  const dynamicCrops = useMemo(() => {
    if (!isControlled) return null;
    const map = {};
    availableCrops.forEach((crop, idx) => {
      const id = crop.id ?? crop.pk ?? idx;
      map[id] = {
        name:  crop.name || `Crop ${id}`,
        unit:  'TZS/kg',
        base:  500,
        trend: 0.3,
        vol:   2.0,
        seed:  (crop.id || idx) * 7 + 11,
        color: CROP_COLORS[idx % CROP_COLORS.length],
      };
    });
    return map;
  }, [availableCrops, isControlled]);

  // Resolve the active crop config — controlled mode uses selectedCrop, standalone uses cropKey
  const cropCfg = useMemo(() => {
    if (isControlled && selectedCrop && dynamicCrops) {
      const id = typeof selectedCrop === 'object'
        ? (selectedCrop.id ?? selectedCrop.pk)
        : selectedCrop;
      return dynamicCrops[id] || dynamicCrops[Object.keys(dynamicCrops)[0]] || CROPS.maize;
    }
    return CROPS[cropKey] || CROPS.maize;
  }, [isControlled, selectedCrop, dynamicCrops, cropKey]);
  const allData  = useMemo(() => {
    if (externalData && externalData.length > 0) {
      return externalData.map(d => {
        const rawDate = d.date || d.time;
        const date  = rawDate instanceof Date ? rawDate : new Date(rawDate);
        const open  = Number(d.open);
        const close = Number(d.close);
        return {
          date,
          dateLabel: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          open:   Math.round(open),
          high:   Math.round(Number(d.high)),
          low:    Math.round(Math.max(1, Number(d.low))),
          close:  Math.round(close),
          volume: Number(d.volume) || 0,
          isUp:   close >= open,
        };
      });
    }
    return generateOHLC(cropCfg, totalDays);
  }, [cropCfg, totalDays, externalData]);

  const viewData = useMemo(() => {
    const tf = TIMEFRAMES[tfIdx];
    if (!tf.days) return allData;
    return allData.slice(-tf.days);
  }, [allData, tfIdx]);

  const closes   = useMemo(() => viewData.map(d => d.close), [viewData]);
  const ma7data  = useMemo(() => calcMA(closes, 7),  [closes]);
  const ma30data = useMemo(() => calcMA(closes, 30), [closes]);

  // ── Stat card values ──────────────────────────────────────
  const stats = useMemo(() => {
    if (!viewData.length) return {};
    const first = viewData[0];
    const last  = viewData[viewData.length - 1];
    const hi    = Math.max(...viewData.map(d => d.high));
    const lo    = Math.min(...viewData.map(d => d.low));
    const chgPct = ((last.close - first.open) / first.open * 100).toFixed(1);
    return { first, last, hi, lo, chgPct, isUp: last.close >= first.open };
  }, [viewData]);

  // ── Animate entry ─────────────────────────────────────────
  const startAnimation = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    progressRef.current = 0;
    setAnimProg(0);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progressRef.current = 1;
      setAnimProg(1);
      return;
    }

    const step = () => {
      progressRef.current = Math.min(1, progressRef.current + 0.022);
      setAnimProg(progressRef.current);
      if (progressRef.current < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    startAnimation();
    return () => cancelAnimationFrame(animRef.current);
  }, [cropKey, tfIdx, chartType, externalData, selectedCrop]);   // re-animate on crop/timeframe/type/data change

  // ── Main draw ─────────────────────────────────────────────
  const draw = useCallback((progress) => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { ctx, W } = setupCanvas(canvas, container, CANVAS_H);
    const layout     = buildLayout(CANVAS_H);
    const coords     = buildCoords(W, viewData, layout, progress);
    const { n, bodyW, px, py, vy, candleProgress } = coords;

    drawBackground(ctx, W, CANVAS_H, T);
    drawGrid(ctx, W, layout, coords.minP, coords.maxP, T);
    drawVolumeDivider(ctx, W, layout, T);
    drawDateLabels(ctx, W, CANVAS_H, viewData, px, n, T);

    // Volume bars
    viewData.forEach((d, i) => {
      const p = chartType === 'Candle' ? candleProgress(i) : easeOutCubic(Math.min(1, progress * 1.5));
      drawVolumeBar(ctx, px(i), d, bodyW, layout.volH, layout.volTop, coords.maxVol, p);
    });

    // Price chart
    if (chartType === 'Candle') {
      viewData.forEach((d, i) => {
        drawSingleCandle(ctx, px(i), d, bodyW, py, candleProgress(i), T);
      });
    } else if (chartType === 'Area') {
      drawAreaLine(ctx, W, viewData, layout, px, py, progress, T);
    } else {
      drawSimpleLine(ctx, viewData, layout, px, py, progress, T);
    }

    // MA overlays (only after animation is mostly done to avoid clutter)
    if (progress > 0.5) {
      const maAlpha = Math.min(1, (progress - 0.5) * 4);
      ctx.globalAlpha = maAlpha;
      drawMALine(ctx, closes, 7,  T.ma7,  false, px, py, n);
      drawMALine(ctx, closes, 30, T.ma30, true,  px, py, n);
      ctx.globalAlpha = 1;
    }

    // Current price line
    if (viewData.length && progress > 0.4) {
      drawCurrentPriceLine(ctx, W, viewData[n - 1].close, py, T);
    }

    // Crosshair & hover
    if (hoverIdx >= 0) {
      drawCrosshair(ctx, W, layout, hoverIdx, px, py, vy, viewData, T);
    }

    // Axis label: y-axis unit
    ctx.fillStyle    = T.text;
    ctx.font         = '9px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Tsh / kg`, W - PAD.r + 5, PAD.t + layout.chartH - 2);
  }, [viewData, closes, chartType, hoverIdx, T]);

  // Redraw on state change
  useEffect(() => {
    draw(progressRef.current >= 1 ? 1 : animProg);
  }, [draw, animProg]);

  // ── ResizeObserver ────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
      draw(progressRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ── Scroll-to-zoom ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      const zoomIn = e.deltaY < 0;
      const current = TIMEFRAMES[tfIdx].days || allData.length;
      const next = zoomIn
        ? Math.max(7, Math.round(current * 0.82))
        : Math.min(allData.length, Math.round(current * 1.2));

      // Find the nearest timeframe or stay on ALL
      if (next >= allData.length) { setTfIdx(TIMEFRAMES.length - 1); return; }
      const found = [...TIMEFRAMES].reverse().findIndex(tf => tf.days && tf.days <= next);
      if (found >= 0) setTfIdx(TIMEFRAMES.length - 1 - found);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [tfIdx, allData.length]);

  // ── Mouse events ──────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const W    = container.clientWidth;
    const cW   = W - PAD.l - PAD.r;
    const n    = viewData.length;

    // Only respond within chart area
    const layout = buildLayout(CANVAS_H);
    if (my < PAD.t || my > layout.volTop + layout.volH) {
      setHoverIdx(-1);
      return;
    }

    const i = Math.round((mx - PAD.l) / (cW / n) - 0.5);
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
    setTooltipPos({ x: mx, y: my });
  }, [viewData]);

  const handleMouseLeave = useCallback(() => setHoverIdx(-1), []);

  // ── Keyboard accessibility ────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft')  setHoverIdx(p => Math.max(0, p - 1));
    if (e.key === 'ArrowRight') setHoverIdx(p => Math.min(viewData.length - 1, p + 1));
    if (e.key === 'Escape')     setHoverIdx(-1);
  }, [viewData.length]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{
      background:   T.bg,
      borderRadius: '12px',
      padding:      '18px 18px 14px',
      border:       `1px solid ${T.border}`,
      fontFamily:   '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      userSelect:   'none',
    }}>

      {/* ── Header row ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>

        {/* Crop selector — dynamic bubbles from API (controlled mode) or hardcoded (standalone) */}
        {(!externalData || isControlled) && (
          <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {isControlled
                ? /* ── Controlled mode: render bubbles from availableCrops ── */
                  availableCrops.map((crop, idx) => {
                    const id   = crop.id ?? crop.pk ?? idx;
                    const cfg  = dynamicCrops?.[id] || { name: crop.name, color: CROP_COLORS[idx % CROP_COLORS.length] };
                    const isActive = selectedCrop
                      ? String(typeof selectedCrop === 'object' ? (selectedCrop.id ?? selectedCrop.pk) : selectedCrop) === String(id)
                      : false;
                    return (
                      <button
                        key={id}
                        onClick={() => onCropChange ? onCropChange(crop) : setCropKey(String(id))}
                        style={{
                          padding:      '5px 11px',
                          borderRadius: '100px',
                          border:       `1px solid ${isActive ? cfg.color : T.border}`,
                          background:   isActive ? `${cfg.color}22` : 'transparent',
                          color:        isActive ? cfg.color : T.btnText,
                          fontSize:     12,
                          fontWeight:   isActive ? 600 : 400,
                          cursor:       'pointer',
                          transition:   'all .15s',
                          outline:      'none',
                        }}
                      >
                        {(cfg.name || crop.name).split(' ')[0]}
                      </button>
                    );
                  })
                : /* ── Standalone mode: render hardcoded CROPS bubbles ── */
                  Object.entries(CROPS).map(([key, cfg]) => {
                    const active = key === cropKey;
                    return (
                      <button
                        key={key}
                        onClick={() => setCropKey(key)}
                        style={{
                          padding:      '5px 11px',
                          borderRadius: '100px',
                          border:       `1px solid ${active ? cfg.color : T.border}`,
                          background:   active ? `${cfg.color}22` : 'transparent',
                          color:        active ? cfg.color : T.btnText,
                          fontSize:     12,
                          fontWeight:   active ? 600 : 400,
                          cursor:       'pointer',
                          transition:   'all .15s',
                          outline:      'none',
                        }}
                      >
                        {cfg.name.split(' ')[0]}
                      </button>
                    );
                  })
              }
            </div>

            {/* Right controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Chart type */}
              <div style={{ display: 'flex', background: T.btnBg, borderRadius: 6, padding: 2, gap: 1 }}>
                {CHART_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    style={{
                      padding:      '4px 9px',
                      borderRadius: 4,
                      border:       'none',
                      background:   chartType === type ? T.btnActive : 'transparent',
                      color:        chartType === type ? T.btnActiveText : T.btnText,
                      fontSize:     11,
                      fontWeight:   chartType === type ? 600 : 400,
                      cursor:       'pointer',
                      outline:      'none',
                      transition:   'all .12s',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Timeframe */}
              <div style={{ display: 'flex', gap: 3 }}>
                {TIMEFRAMES.map((tf, idx) => (
                  <button
                    key={tf.label}
                    onClick={() => setTfIdx(idx)}
                    style={{
                      padding:      '4px 8px',
                      borderRadius: 4,
                      border:       `1px solid ${tfIdx === idx ? T.accent : T.border}`,
                      background:   tfIdx === idx ? T.btnActive : 'transparent',
                      color:        tfIdx === idx ? T.btnActiveText : T.btnText,
                      fontSize:     11,
                      fontWeight:   tfIdx === idx ? 600 : 400,
                      cursor:       'pointer',
                      outline:      'none',
                      transition:   'all .12s',
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Stat cards ─────────────────────────────────── */}
      {stats.last && (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap:                 6,
          marginBottom:        14,
        }}>
          <StatCard label="Open"   value={`Tsh ${stats.first.open.toLocaleString()}`} T={T} />
          <StatCard label="High"   value={`Tsh ${stats.hi.toLocaleString()}`} delta="Period high" up T={T} />
          <StatCard label="Low"    value={`Tsh ${stats.lo.toLocaleString()}`}  delta="Period low" up={false} T={T} />
          <StatCard label="Close"  value={`Tsh ${stats.last.close.toLocaleString()}`} T={T} />
          <StatCard label="Volume" value={stats.last.volume.toLocaleString()} T={T} />
          <StatCard
            label="Change"
            value={`${stats.isUp ? '+' : ''}${stats.chgPct}%`}
            delta={`vs period open`}
            up={stats.isUp}
            T={T}
          />
        </div>
      )}

      {/* ── Canvas ─────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%' }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="img"
          aria-label={
            `OHLC candlestick chart for ${cropCfg.name} in Tanzania. ` +
            `Showing ${viewData.length} days of price data. ` +
            `Current price: Tsh ${stats.last?.close?.toLocaleString() || '—'} per kg. ` +
            `Use arrow keys to navigate data points.`
          }
        />

        {/* OHLC Tooltip */}
        <OHLCTooltip
          d={hoverIdx >= 0 ? viewData[hoverIdx] : null}
          cropCfg={cropCfg}
          visible={hoverIdx >= 0}
          x={tooltipPos.x}
          y={tooltipPos.y}
          containerW={containerW}
          T={T}
        />
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${T.grid}` }}>
        {[
          { color: T.up,  label: 'Bullish',  dash: false, fill: true  },
          { color: T.dn,  label: 'Bearish',  dash: false, fill: true  },
          { color: T.ma7,  label: 'MA 7-day',  dash: false, fill: false },
          { color: T.ma30, label: 'MA 30-day', dash: true,  fill: false },
          { color: T.accent,label: 'Current price', dash: true, fill: false },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {item.fill ? (
              <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 18, height: 0,
                borderTop: `2px ${item.dash ? 'dashed' : 'solid'} ${item.color}`,
                flexShrink: 0,
              }} />
            )}
            <span style={{ fontSize: 11, color: T.labelColor }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: T.text }}>
          Scroll to zoom · Arrow keys to inspect
        </div>
      </div>

    </div>
  );
};

export default CandlestickChart;
