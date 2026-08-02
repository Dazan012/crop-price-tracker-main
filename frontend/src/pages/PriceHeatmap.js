import { useState, useEffect } from 'react';
import { priceAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import { StatCard, LoadingSpinner, PageCard } from '../components/Shared';
import {
  Map, Wheat, Filter, TrendingUp, TrendingDown, Database, MapPin,
} from 'lucide-react';
import RadialPriceWeb from '../components/RadialPriceWeb.jsx';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIER_CONFIG = {
  low:  { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  label: 'Low Price',  border: 'rgba(239,68,68,0.35)' },
  mid:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Mid Price',  border: 'rgba(245,158,11,0.3)' },
  high: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  label: 'High Price', border: 'rgba(34,197,94,0.35)' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTZS(value) {
  if (value == null) return '--';
  return Number(value).toLocaleString('en-TZ');
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function PriceHeatmap() {
  const { crops, loading: dataLoading } = useDataWithFallback();
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState('');
  const [hoveredCell, setHoveredCell] = useState(null); // { crop, region, price, count, tier, x, y }

  /* ---- set default crop from context ---- */
  useEffect(() => {
    if (crops.length > 0 && !selectedCrop) {
      setSelectedCrop(String(crops[0].id || crops[0].crop_id || ''));
    }
  }, [crops]);

  /* ---- load heatmap ---- */
  useEffect(() => {
    if (!selectedCrop) return;
    setLoading(true);
    priceAPI.heatmap({ crop: selectedCrop })
      .then((r) => setHeatmapData(r.data))
      .catch(() => setHeatmapData(null))
      .finally(() => setLoading(false));
  }, [selectedCrop]);

  /* ---- derived stats ---- */
  const regions = heatmapData?.regions || [];
  const cropNames = heatmapData?.crops || [];

  let highestPrice = 0;
  let lowestPrice = Infinity;
  let totalEntries = 0;

  regions.forEach((region) => {
    Object.values(region.prices || {}).forEach((p) => {
      if (!p) return;
      const price = p.price || 0;
      if (price > highestPrice) highestPrice = price;
      if (price > 0 && price < lowestPrice) lowestPrice = price;
      totalEntries += p.count || 0;
    });
  });

  if (lowestPrice === Infinity) lowestPrice = 0;

  /* ---- transform heatmap data for RadialPriceWeb ---- */
  const CROP_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#ec4899', '#06b6d4', '#84cc16'];
  const radialRegionNames = regions.map(r => r.name || r.region);
  const radialRegionShort = radialRegionNames.map(n => {
    const parts = n.split(' ');
    return parts.length > 1 && n.length > 8 ? parts.map(p => p[0]).join('') : n.slice(0, 5);
  });
  const radialCrops = cropNames.map((cropName, i) => ({
    id: cropName.toLowerCase().replace(/\s+/g, '_'),
    name: cropName,
    nameShort: cropName.length > 10 ? cropName.slice(0, 8) + '..' : cropName,
    color: CROP_COLORS[i % CROP_COLORS.length],
    unit: 'TZS/kg',
    values: radialRegionNames.map((_, rIdx) => {
      const regionData = regions[rIdx];
      const cell = regionData?.prices?.[cropName];
      return cell?.price || 0;
    }),
  })).filter(c => c.values.some(v => v > 0));

  /* ---- loading guard ---- */
  if ((loading || dataLoading) && !heatmapData) return <LoadingSpinner message="Loading price heatmap..." />;

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header fade-in">
        <div>
          <h1><Map size={28} /> Regional Price Heatmap</h1>
          <p>Compare crop prices across Tanzanian regions. See where prices are highest and lowest.</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard label="Crops Tracked" value={cropNames.length} icon={<Wheat size={20} />} color="#00d4aa" />
        <StatCard label="Regions" value={regions.length} icon={<MapPin size={20} />} color="#3b82f6" />
        <StatCard label="Highest Price" value={`${formatTZS(highestPrice)} TZS`} icon={<TrendingUp size={20} />} color="#22c55e" />
        <StatCard label="Lowest Price" value={`${formatTZS(lowestPrice)} TZS`} icon={<TrendingDown size={20} />} color="#ef4444" />
      </div>

      {/* Crop filter */}
      <div className="filters-bar" style={{ marginBottom: 24 }}>
        <span className="filter-label"><Filter size={14} /> Crop</span>
        <select
          className="form-control"
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">All Crops</option>
          {crops.map((c) => (
            <option key={c.id || c.crop_id} value={c.id || c.crop_id}>{c.name}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <Database size={12} /> {totalEntries} total entries
        </span>
      </div>

      {/* Heatmap grid */}
      {regions.length > 0 && cropNames.length > 0 ? (
        <PageCard title="Price Grid" icon={<Map size={18} />}>
          <div className="heatmap-scroll-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
            <table className="data-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--bg-surface, #0d1f12)', zIndex: 2, minWidth: 160 }}>
                    Region
                  </th>
                  {cropNames.map((crop) => (
                    <th key={crop} style={{ textAlign: 'center', minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Wheat size={12} style={{ color: '#00d4aa' }} />
                        {crop}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => (
                  <tr key={region.name || region.region_id}>
                    <td style={{
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-surface, #0d1f12)',
                      zIndex: 1,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={12} style={{ color: '#00d4aa' }} />
                        {region.name || region.region}
                      </div>
                    </td>
                    {cropNames.map((crop) => {
                      const cell = region.prices?.[crop];
                      if (!cell || cell.price == null) {
                        return (
                          <td key={crop} style={{ textAlign: 'center' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>--</span>
                          </td>
                        );
                      }

                      const tier = cell.tier || 'mid';
                      const cfg = TIER_CONFIG[tier] || TIER_CONFIG.mid;

                      return (
                        <td
                          key={crop}
                          style={{
                            textAlign: 'center',
                            background: cfg.bg,
                            borderLeft: `1px solid ${cfg.border}`,
                            borderRight: `1px solid ${cfg.border}`,
                            padding: '10px 8px',
                            cursor: 'default',
                          }}
                          onMouseEnter={(e) => {
                            setHoveredCell({
                              crop,
                              region: region.name || region.region,
                              price: cell.price,
                              count: cell.count || 0,
                              tier: cell.tier || 'mid',
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onMouseMove={(e) => {
                            setHoveredCell((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                            onTouchStart={(e) => {
                              const touch = e.touches[0];
                              setHoveredCell({
                                crop,
                                region: region.name || region.region,
                                price: cell.price,
                                count: cell.count || 0,
                                tier: cell.tier || 'mid',
                                x: touch.clientX,
                                y: touch.clientY,
                              });
                            }}
                            onTouchEnd={() => {
                              setTimeout(() => setHoveredCell(null), 2000);
                            }}
                        >
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: cfg.color,
                            marginBottom: 2,
                          }}>
                            {formatTZS(cell.price)}
                          </div>
                          <div style={{
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                          }}>
                            {cell.count || 0} entries
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(0,212,170,0.08)' }}>
            {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }} />
                <span style={{ fontSize: '0.78rem', color: cfg.color, fontWeight: 600 }}>
                  {cfg.label}
                </span>
              </div>
            ))}
          </div>
        </PageCard>
      ) : (
        <PageCard title="Price Grid" icon={<Map size={18} />}>
          <div className="empty-state">
            <div className="empty-icon">🗺️</div>
            <p>No heatmap data available. Try selecting a different crop or check back later.</p>
          </div>
        </PageCard>
      )}

      {/* Regional Price Web — visual radar chart */}
      <div style={{ marginTop: 32 }} className="fade-in">
        {radialCrops.length > 0 && radialRegionNames.length > 0 ? (
          <RadialPriceWeb
            crops={radialCrops}
            regions={radialRegionNames}
            regionsShort={radialRegionShort}
          />
        ) : (
          <RadialPriceWeb />
        )}
      </div>

      {/* Hover tooltip popup */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(hoveredCell.x + 14, window.innerWidth - 200),
            top: Math.max(8, Math.min(hoveredCell.y - 10, window.innerHeight - 140)),
            zIndex: 9999,
            pointerEvents: 'none',
            padding: '12px 16px',
            borderRadius: 'var(--radius, 10px)',
            background: 'rgba(13, 31, 18, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 212, 170, 0.18)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            minWidth: 180,
            maxWidth: 260,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Wheat size={14} style={{ color: '#00d4aa' }} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #e0e0e0)' }}>
              {hoveredCell.crop}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary, #aaa)' }}>
            <MapPin size={12} />
            {hoveredCell.region}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: '1rem',
            color: (TIER_CONFIG[hoveredCell.tier] || TIER_CONFIG.mid).color,
            marginBottom: 6,
          }}>
            {formatTZS(hoveredCell.price)} TZS
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted, #777)' }}>
            <span>{hoveredCell.count} entries</span>
            <span style={{
              color: (TIER_CONFIG[hoveredCell.tier] || TIER_CONFIG.mid).color,
              fontWeight: 600,
            }}>
              {hoveredCell.tier.charAt(0).toUpperCase() + hoveredCell.tier.slice(1)} tier
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* end of file */
