import { useState } from 'react';
import { reportAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import { FileText, Download, FileSpreadsheet, File, Filter, Calendar, MapPin, Wheat } from 'lucide-react';

export default function Reports() {
  const { crops, regions, markets } = useDataWithFallback();
  const [filters, setFilters] = useState({
    crop: '', market: '', region: '', date_from: '', date_to: '',
  });
  const [downloading, setDownloading] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const activeFilters = Object.entries(filters).filter(([, v]) => v);

  const handleDownload = (fmt) => {
    const params = {};
    if (filters.crop) params.crop = filters.crop;
    if (filters.market) params.market = filters.market;
    if (filters.region) params.region = filters.region;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    setDownloading(fmt);
    reportAPI.download(fmt, params);
    setTimeout(() => setDownloading(null), 2000);
  };

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><FileText size={28} /> Reports</h1>
          <p>Export crop price data as CSV, Excel, or PDF</p>
        </div>
      </div>

      {/* Filter card */}
      <div className="glass-card fade-in" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Filter size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Filters</h3>
          {activeFilters.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({activeFilters.length} active)
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
              <Wheat size={12} /> Crop
            </label>
            <select className="form-control" name="crop" value={filters.crop} onChange={handleChange}>
              <option value="">All crops</option>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
              <MapPin size={12} /> Region
            </label>
            <select className="form-control" name="region" value={filters.region} onChange={handleChange}>
              <option value="">All regions</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
              <MapPin size={12} /> Market
            </label>
            <select className="form-control" name="market" value={filters.market} onChange={handleChange}>
              <option value="">All markets</option>
              {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
              <Calendar size={12} /> From
            </label>
            <input className="form-control" type="date" name="date_from" value={filters.date_from} onChange={handleChange} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>
              <Calendar size={12} /> To
            </label>
            <input className="form-control" type="date" name="date_to" value={filters.date_to} onChange={handleChange} />
          </div>
        </div>
      </div>

      {/* Download cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="glass-card fade-in" style={{ padding: 24, textAlign: 'center' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 12, color: '#22c55e' }}>
            <FileSpreadsheet size={48} style={{ display: 'inline' }} />
          </div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>CSV</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Open in Excel, Google Sheets, or any spreadsheet app
          </p>
          <button className="btn btn-primary" onClick={() => handleDownload('csv')} disabled={downloading === 'csv'}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Download size={14} /> {downloading === 'csv' ? 'Downloading...' : 'Download CSV'}
          </button>
        </div>

        <div className="glass-card fade-in" style={{ padding: 24, textAlign: 'center' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 12, color: '#3b82f6' }}>
            <FileText size={48} style={{ display: 'inline' }} />
          </div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>Excel</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Formatted .xlsx with styled headers and auto-fit columns
          </p>
          <button className="btn btn-primary" onClick={() => handleDownload('xlsx')} disabled={downloading === 'xlsx'}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Download size={14} /> {downloading === 'xlsx' ? 'Downloading...' : 'Download Excel'}
          </button>
        </div>

        <div className="glass-card fade-in" style={{ padding: 24, textAlign: 'center' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 12, color: '#ef4444' }}>
            <File size={48} style={{ display: 'inline' }} />
          </div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>PDF</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Print-ready report with table formatting and metadata
          </p>
          <button className="btn btn-primary" onClick={() => handleDownload('pdf')} disabled={downloading === 'pdf'}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Download size={14} /> {downloading === 'pdf' ? 'Downloading...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Summary report */}
      <div className="glass-card fade-in" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Price Summary Report</h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Aggregated summary with average, min, max prices per crop-market-region
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => {
            const params = {};
            if (filters.crop) params.crop = filters.crop;
            if (filters.region) params.region = filters.region;
            if (filters.date_from) params.date_from = filters.date_from;
            if (filters.date_to) params.date_to = filters.date_to;
            reportAPI.download('summary/csv', params);
          }}>
            <Download size={14} /> Download Summary CSV
          </button>
        </div>
      </div>
    </div>
  );
}
