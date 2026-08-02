import { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Activity,
  ArrowUpRight, ArrowDownRight, Bell, BellRing,
  CheckCircle, AlertCircle,
} from 'lucide-react';
import CandlestickChartCanvas from '../components/CandlestickChart';
import RadialPriceWeb from '../components/RadialPriceWeb';
import { StatCard, LoadingSpinner, PageCard } from '../components/Shared';
import { useDataWithFallback } from '../services/DataContext';
import { priceAPI, dataAPI, alertAPI } from '../services/api';

/* ================================================================== */
/*  HELPERS — safely extract id/name from API objects or plain strings */
/* ================================================================== */
const getItemId = (item) =>
  typeof item === 'object' && item !== null
    ? (item.id ?? item.pk ?? item.value ?? item)
    : item;

const getItemName = (item) =>
  typeof item === 'object' && item !== null
    ? (item.name ?? item.label ?? item.title ?? item.id ?? String(item))
    : String(item);

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function CandlestickChart() {
  const { crops: globalCrops, regions, loading: dataLoading } = useDataWithFallback();
  const [crops, setCrops] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeView, setActiveView] = useState('candlestick'); // 'candlestick' | 'radial'

  /* ---- Region -> Crop selector state ---- */
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [ohlcData, setOhlcData] = useState(null);
  const [ohlcLoading, setOhlcLoading] = useState(false);

  /* ---- Price Alert form state ---- */
  const [alertType, setAlertType] = useState('price_rise');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState(null); // { type: 'success'|'error', message: '' }

  /* ---- Heatmap data for RadialPriceWeb ---- */
  const [heatmapData, setHeatmapData] = useState(null);
  const [radialCrops, setRadialCrops] = useState(null);
  const [radialRegions, setRadialRegions] = useState(null);
  const [radialRegionsShort, setRadialRegionsShort] = useState(null);

  /* ---- Use global crops when no region selected ---- */
  useEffect(() => {
    if (!selectedRegion && globalCrops.length > 0) {
      setCrops(globalCrops);
    }
  }, [globalCrops, selectedRegion]);

  /* ---- load dashboard stats as fallback when no OHLC selection is active ---- */
  useEffect(() => {
    priceAPI.list({ limit: 50 })
      .then((r) => {
        const prices = r.data || [];
        if (prices.length > 0) {
          const avgPrice = prices.reduce((s, p) => s + Number(p.price), 0) / prices.length;
          const maxPrice = Math.max(...prices.map(p => Number(p.price)));
          const minPrice = Math.min(...prices.map(p => Number(p.price)));
          const latest = prices[0];
          const prev = prices[1] || latest;
          const changePct = prev
            ? (((Number(latest.price) - Number(prev.price)) / Number(prev.price)) * 100).toFixed(1)
            : '0.0';
          setStats({
            current_price: Math.round(avgPrice),
            period_high: Math.round(maxPrice),
            period_low: Math.round(minPrice),
            change_pct: changePct,
            total_entries: prices.length,
          });
        }
      })
      .catch(() => {});
  }, []);

  /* ---- when region changes, fetch region-specific crops & clear downstream state ---- */
  useEffect(() => {
    if (selectedRegion) {
      const regionObj = regions.find((r) => String(getItemId(r)) === String(selectedRegion));
      const regionName = regionObj ? getItemName(regionObj) : selectedRegion;
      dataAPI.regionCrops(regionName)
        .then((res) => setCrops(res.data || []))
        .catch(() => setCrops([]));
    } else {
      setCrops(globalCrops);
    }
    setSelectedCrop('');
    setOhlcData(null);
  }, [selectedRegion]);

  /* ---- when both region + crop selected, fetch OHLC data ---- */
  useEffect(() => {
    if (selectedRegion && selectedCrop) {
      setOhlcLoading(true);
      priceAPI.ohlc({ crop: selectedCrop, region: selectedRegion, days: 90 })
        .then((res) => {
          const raw = Array.isArray(res.data)
            ? res.data
            : (res.data?.data || res.data?.results || []);
          setOhlcData(raw.length > 0 ? raw : null);
        })
        .catch(() => setOhlcData(null))
        .finally(() => setOhlcLoading(false));
    } else {
      setOhlcData(null);
    }
  }, [selectedRegion, selectedCrop]);

  /* ---- update stat cards from real OHLC data when available ---- */
  useEffect(() => {
    if (ohlcData && ohlcData.length > 0) {
      const first = ohlcData[0];
      const last  = ohlcData[ohlcData.length - 1];
      const high  = Math.max(...ohlcData.map(d => Number(d.high)));
      const low   = Math.min(...ohlcData.map(d => Number(d.low)));
      const openPrice  = Number(first.open);
      const closePrice = Number(last.close);
      const changePct  = openPrice
        ? (((closePrice - openPrice) / openPrice) * 100).toFixed(1)
        : '0.0';
      setStats({
        current_price: Math.round(closePrice),
        period_high:   Math.round(high),
        period_low:    Math.round(low),
        change_pct:    changePct,
        total_entries: ohlcData.length,
      });
    }
  }, [ohlcData]);

  /* ---- Fetch heatmap data for RadialPriceWeb ---- */
  useEffect(() => {
    const CROP_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#3b82f6', '#84cc16'];
    priceAPI.heatmap({})
      .then((res) => {
        const data = res.data;
        if (!data?.regions || !data?.crops) return;

        const regionNames = data.regions.map(r => r.name || r.region);
        const regionShort = regionNames.map(n => {
          const parts = n.split(' ');
          return parts.length > 1 && n.length > 8 ? parts.map(p => p[0]).join('') : n.slice(0, 5);
        });

        // Build crop objects with per-region price arrays
        const cropObjs = data.crops
          .map((cropName, i) => ({
            id: cropName.toLowerCase().replace(/\s+/g, '_'),
            name: cropName,
            nameShort: cropName.length > 10 ? cropName.slice(0, 8) + '..' : cropName,
            color: CROP_COLORS[i % CROP_COLORS.length],
            unit: 'TZS/kg',
            values: regionNames.map((_, rIdx) => {
              const regionData = data.regions[rIdx];
              const cell = regionData?.prices?.[cropName];
              return cell?.price || 0;
            }),
          }))
          .filter(c => c.values.some(v => v > 0));

        // If a region is selected, filter to show only that region's crops
        if (selectedRegion) {
          const regionIdx = regionNames.findIndex(n => n === selectedRegion || n.includes(selectedRegion));
          if (regionIdx >= 0) {
            const filtered = cropObjs.filter(c => c.values[regionIdx] > 0);
            setRadialCrops(filtered.length > 0 ? filtered : cropObjs);
          } else {
            setRadialCrops(cropObjs);
          }
        } else {
          setRadialCrops(cropObjs);
        }

        setRadialRegions(regionNames);
        setRadialRegionsShort(regionShort);
        setHeatmapData(data);
      })
      .catch(() => {});
  }, [selectedRegion]);

  /* ---- derive stat card values ---- */
  const changePct = parseFloat(stats?.change_pct || 0);
  const isPositiveChange = changePct >= 0;

  /* ---- derive selected crop object for the chart component ---- */
  const selectedCropObj = selectedCrop
    ? crops.find((c) => String(getItemId(c)) === String(selectedCrop)) || null
    : null;

  /* ---- handle price alert creation ---- */
  const handleCreateAlert = async () => {
    if (!selectedCrop) {
      setAlertFeedback({ type: 'error', message: 'Please select a region and crop first.' });
      return;
    }
    if (!alertThreshold || Number(alertThreshold) <= 0) {
      setAlertFeedback({ type: 'error', message: 'Please enter a valid threshold price.' });
      return;
    }
    setAlertSubmitting(true);
    setAlertFeedback(null);
    try {
      await alertAPI.create({
        crop: selectedCrop,
        alert_type: alertType,
        threshold: Number(alertThreshold),
        region: selectedRegion || null,
      });
      setAlertFeedback({ type: 'success', message: `Alert created! You'll be notified when the price ${alertType === 'price_rise' ? 'rises above' : 'drops below'} TZS ${Number(alertThreshold).toLocaleString()}/kg.` });
      setAlertThreshold('');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to create alert. Please try again.';
      setAlertFeedback({ type: 'error', message: msg });
    } finally {
      setAlertSubmitting(false);
    }
  };

  /* ---- loading guard ---- */
  if (dataLoading) return <LoadingSpinner message="Loading charts..." />;

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header fade-in">
        <div>
          <h1><BarChart3 size={28} /> Price Charts</h1>
          <p>Interactive candlestick and radial charts for technical analysis of crop prices across Tanzania.</p>
        </div>
      </div>

      {/* Region -> Crop selector */}
      <div
        className="filters-bar fade-in"
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        {/* Region dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            htmlFor="region-select"
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-muted, #888)',
              whiteSpace: 'nowrap',
            }}
          >
            Region
          </label>
          <select
            id="region-select"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid var(--border, #333)',
              background: 'var(--surface, #111)',
              color: 'var(--text, #eee)',
              fontSize: '0.85rem',
              minWidth: 160,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={getItemId(r)} value={getItemId(r)}>
                {getItemName(r)}
              </option>
            ))}
          </select>
        </div>

        {/* Crop dropdown (enabled only when a region is selected) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            htmlFor="crop-select"
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-muted, #888)',
              whiteSpace: 'nowrap',
            }}
          >
            Crop
          </label>
          <select
            id="crop-select"
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            disabled={!selectedRegion}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid var(--border, #333)',
              background: 'var(--surface, #111)',
              color: 'var(--text, #eee)',
              fontSize: '0.85rem',
              minWidth: 160,
              cursor: selectedRegion ? 'pointer' : 'not-allowed',
              opacity: selectedRegion ? 1 : 0.5,
              outline: 'none',
            }}
          >
            <option value="">Select Crop</option>
            {crops.map((c) => (
              <option key={getItemId(c)} value={getItemId(c)}>
                {getItemName(c)}
              </option>
            ))}
          </select>
        </div>

        {/* Loading indicator */}
        {ohlcLoading && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)' }}>
            Loading OHLC data...
          </span>
        )}

        {/* Status text */}
        {ohlcData && (
          <span style={{ fontSize: '0.78rem', color: 'var(--accent, #00d4aa)', marginLeft: 'auto' }}>
            Showing {ohlcData.length} days of API data
          </span>
        )}
        {!ohlcData && !ohlcLoading && selectedRegion && selectedCrop && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginLeft: 'auto' }}>
            No OHLC data available for this selection
          </span>
        )}
      </div>

      {/* Stat tiles */}
      {stats && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard
            label="Current Price"
            value={`${stats.current_price?.toLocaleString() || '--'} TZS`}
            icon={<Activity size={20} />}
            color="#00d4aa"
          />
          <StatCard
            label="Period High"
            value={`${stats.period_high?.toLocaleString() || '--'} TZS`}
            icon={<TrendingUp size={20} />}
            color="#22c55e"
          />
          <StatCard
            label="Period Low"
            value={`${stats.period_low?.toLocaleString() || '--'} TZS`}
            icon={<TrendingDown size={20} />}
            color="#ef4444"
          />
          <StatCard
            label="Change"
            value={`${isPositiveChange ? '+' : ''}${changePct.toFixed(1)}%`}
            icon={isPositiveChange ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
            color={isPositiveChange ? '#22c55e' : '#ef4444'}
          />
        </div>
      )}

      {/* View toggle */}
      <div className="filters-bar" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button
            className={`btn btn-sm ${activeView === 'candlestick' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('candlestick')}
            style={{ borderRadius: 0, padding: '8px 16px' }}
          >
            Candlestick Chart
          </button>
          <button
            className={`btn btn-sm ${activeView === 'radial' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('radial')}
            style={{ borderRadius: 0, padding: '8px 16px' }}
          >
            Regional Price Web
          </button>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {activeView === 'candlestick'
            ? 'OHLC candlestick with MA overlays · scroll to zoom · hover for tooltip'
            : 'Spider chart: regional price distribution · hover axes for details · click to lock focus'}
        </div>
      </div>

      {/* Chart views */}
      {activeView === 'candlestick' && (
        <div className="fade-in">
          <CandlestickChartCanvas
            externalData={ohlcData}
            availableCrops={crops}
            selectedCrop={selectedCropObj}
            onCropChange={(crop) => setSelectedCrop(getItemId(crop))}
          />
        </div>
      )}

      {activeView === 'radial' && (
        <div className="fade-in">
          <RadialPriceWeb
            crops={radialCrops || undefined}
            regions={radialRegions || undefined}
            regionsShort={radialRegionsShort || undefined}
            selectedCropName={selectedCropObj?.name || null}
          />
        </div>
      )}

      {/* ── Price Alert Form ─────────────────────────────── */}
      <div className="glass-card fade-in" style={{ marginTop: 32, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <BellRing size={20} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Set a Price Alert</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Get notified when the price of your selected crop reaches your target. Alerts are checked daily against live market data.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Current selection display */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Crop</label>
            <div style={{
              padding: '8px 14px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass-light, rgba(255,255,255,0.03))',
              color: selectedCrop ? 'var(--text-primary)' : 'var(--text-faint)',
              fontSize: '0.85rem', minWidth: 140,
            }}>
              {selectedCrop
                ? crops.find(c => String(c.id || c.pk) === String(selectedCrop))?.name || `Crop #${selectedCrop}`
                : 'Select a crop above'}
            </div>
          </div>

          {/* Alert type selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Alert When Price</label>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                onClick={() => setAlertType('price_rise')}
                style={{
                  padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                  background: alertType === 'price_rise' ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: alertType === 'price_rise' ? '#22c55e' : 'var(--text-muted)',
                  fontWeight: alertType === 'price_rise' ? 600 : 400,
                }}
              >
                <TrendingUp size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Rises Above
              </button>
              <button
                onClick={() => setAlertType('price_drop')}
                style={{
                  padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                  background: alertType === 'price_drop' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: alertType === 'price_drop' ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: alertType === 'price_drop' ? 600 : 400,
                }}
              >
                <TrendingDown size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Drops Below
              </button>
            </div>
          </div>

          {/* Threshold input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Target Price (TZS/kg)</label>
            <input
              type="number"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
              placeholder="e.g. 1500"
              min="1"
              style={{
                padding: '8px 14px', borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-input, rgba(255,255,255,0.05))',
                color: 'var(--text-primary)', fontSize: '0.85rem',
                width: 140, outline: 'none',
              }}
            />
          </div>

          {/* Submit button */}
          <button
            onClick={handleCreateAlert}
            disabled={alertSubmitting || !selectedCrop}
            className="btn btn-primary"
            style={{
              padding: '8px 24px', fontSize: '0.85rem',
              opacity: (!selectedCrop || alertSubmitting) ? 0.5 : 1,
              cursor: (!selectedCrop || alertSubmitting) ? 'not-allowed' : 'pointer',
            }}
          >
            <Bell size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {alertSubmitting ? 'Creating...' : 'Create Alert'}
          </button>
        </div>

        {/* Feedback messages */}
        {alertFeedback && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 10,
            background: alertFeedback.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${alertFeedback.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            {alertFeedback.type === 'success'
              ? <CheckCircle size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
              : <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
            <span style={{
              fontSize: '0.85rem',
              color: alertFeedback.type === 'success' ? '#22c55e' : '#ef4444',
            }}>
              {alertFeedback.message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
