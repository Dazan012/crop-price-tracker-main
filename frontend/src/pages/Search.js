import { useState, useEffect, useCallback, useRef } from 'react';
import { searchAPI } from '../services/api';
import { useDataWithFallback } from '../services/DataContext';
import {
  Search as SearchIcon, Mic, MicOff, X, Sliders, Wheat, MapPin,
  Filter,
} from 'lucide-react';

export default function Search() {
  const { crops, regions, markets } = useDataWithFallback();
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    type: 'all', crop: '', region: '', market: '',
    min_price: '', max_price: '',
  });
  const [activeTab, setActiveTab] = useState('all');
  const [voiceError, setVoiceError] = useState('');
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const hasFilters = Object.entries(filters).some(([k, v]) => k !== 'type' && v);

  const doSearch = useCallback(async (searchQuery, searchFilters) => {
    const q = (searchQuery || query).trim();
    const f = searchFilters || filters;
    if (!q && !hasFilters) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const params = { q, ...f };
      Object.keys(params).forEach(k => { if (!params[k] || params[k] === 'all') delete params[k]; });
      const res = await searchAPI.search(params);
      setResults(res.data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [query, filters, hasFilters]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(), 400);
    return () => clearTimeout(timer);
  }, [query, filters, doSearch]);

  // Voice search — bilingual (English + Swahili) dual-recognizer
  const toggleListening = () => {
    if (listening) {
      if (recognitionRef.current) {
        recognitionRef.current.forEach(r => { try { r.stop(); } catch {} });
      }
      setListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice search requires Chrome, Edge, or Safari.');
      return;
    }
    setVoiceError('');

    let done = false;
    let ended = 0;
    const recognizers = [];

    const createRecognizer = (lang) => {
      const r = new SpeechRecognition();
      r.lang = lang;
      r.interimResults = false;
      r.continuous = false;
      r.onresult = (event) => {
        if (done) return;
        done = true;
        setQuery(event.results[0][0].transcript);
        setListening(false);
        recognizers.forEach(other => { if (other !== r) try { other.stop(); } catch {} });
      };
      r.onend = () => {
        if (done) return;
        ended++;
        if (ended >= recognizers.length) setListening(false);
      };
      return r;
    };

    recognizers.push(createRecognizer('en-US'), createRecognizer('sw-TZ'));
    recognitionRef.current = recognizers;
    recognizers.forEach(r => r.start());
    setListening(true);
  };

  // Cleanup recognizers on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.forEach(r => { try { r.abort(); } catch {} });
      }
    };
  }, []);

  const filteredPrices = results?.prices || [];
  const filteredCrops = results?.crops || [];
  const filteredMarkets = results?.markets || [];
  const filteredRegions = results?.regions || [];

  const TABS = [
    { key: 'all', label: `All (${results?.total_count || 0})` },
    { key: 'prices', label: `Prices (${filteredPrices.length})` },
    { key: 'crops', label: `Crops (${filteredCrops.length})` },
    { key: 'markets', label: `Markets (${filteredMarkets.length})` },
    { key: 'regions', label: `Regions (${filteredRegions.length})` },
  ];

  return (
    <div className="page">
      {/* Search header */}
      <div className="page-header fade-in">
        <div>
          <h1><SearchIcon size={28} /> Search</h1>
          <p>Search crops, markets, prices, and regions across Tanzania</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="glass-card fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              className="form-control"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crops, markets, regions, prices..."
              style={{ paddingLeft: 36, paddingRight: listening ? 80 : 40, width: '100%' }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ position: 'absolute', right: listening ? 76 : 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                <X size={14} />
              </button>
            )}
            {listening && (
              <span style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: 'var(--danger)', animation: 'pulse 1s infinite' }}>
                LISTENING
              </span>
            )}
          </div>
          <button
            className={`btn btn-sm ${listening ? 'btn-danger' : 'btn-secondary'}`}
            onClick={toggleListening}
            title={listening ? 'Stop listening' : 'Voice search'}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Sliders size={14} /> Filters
          </button>
        </div>

        {/* Voice search hint */}
        {listening && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <Mic size={12} style={{ marginRight: 4 }} /> Speak now... (English & Swahili)
          </div>
        )}
        {voiceError && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--danger)' }}>
            {voiceError}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Filters sidebar */}
        {showFilters && (
          <div className="glass-card fade-in" style={{ width: 240, flexShrink: 0, padding: 16, alignSelf: 'flex-start', position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Filter size={14} /> Filters
              </h3>
              {hasFilters && (
                <button className="btn btn-sm" onClick={() => setFilters({ type: 'all', crop: '', region: '', market: '', min_price: '', max_price: '' })}
                  style={{ fontSize: '0.7rem', padding: '2px 6px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear all
                </button>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 3, display: 'block' }}>Search Type</label>
              <select className="form-control" name="type" value={filters.type} onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px' }}>
                <option value="all">All Types</option>
                <option value="prices">Prices</option>
                <option value="crops">Crops</option>
                <option value="markets">Markets</option>
                <option value="regions">Regions</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 3, display: 'block' }}><Wheat size={12} /> Crop</label>
              <select className="form-control" name="crop" value={filters.crop} onChange={(e) => setFilters(prev => ({ ...prev, crop: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px' }}>
                <option value="">All crops</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 3, display: 'block' }}><MapPin size={12} /> Region</label>
              <select className="form-control" name="region" value={filters.region} onChange={(e) => setFilters(prev => ({ ...prev, region: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px' }}>
                <option value="">All regions</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 3, display: 'block' }}><MapPin size={12} /> Market</label>
              <select className="form-control" name="market" value={filters.market} onChange={(e) => setFilters(prev => ({ ...prev, market: e.target.value }))} style={{ fontSize: '0.78rem', padding: '4px 6px' }}>
                <option value="">All markets</option>
                {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.72rem', marginBottom: 3, display: 'block' }}>Price Range (TZS)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="form-control" type="number" name="min_price" value={filters.min_price} onChange={(e) => setFilters(prev => ({ ...prev, min_price: e.target.value }))} placeholder="Min" style={{ fontSize: '0.78rem', padding: '4px 6px', width: '50%' }} />
                <input className="form-control" type="number" name="max_price" value={filters.max_price} onChange={(e) => setFilters(prev => ({ ...prev, max_price: e.target.value }))} placeholder="Max" style={{ fontSize: '0.78rem', padding: '4px 6px', width: '50%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div style={{ flex: 1 }}>
          {/* Tab bar */}
          {results && (
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px 6px 0 0',
                    border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500,
                    background: activeTab === tab.key ? 'rgba(0,212,170,0.1)' : 'transparent',
                    color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
              Searching...
            </div>
          )}

          {/* No query state */}
          {!query && !hasFilters && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <SearchIcon size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
              <p style={{ fontSize: '0.9rem', margin: '0 0 4px' }}>Type to search crops, markets, prices, and regions</p>
              <p style={{ fontSize: '0.78rem', margin: 0 }}>Use the mic button for voice search (English & Swahili)</p>
            </div>
          )}

          {/* No results */}
          {results && results.total_count === 0 && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <X size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: '0.85rem' }}>No results found for "{query}"</p>
              {hasFilters && <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Try adjusting filters</p>}
            </div>
          )}

          {/* Price Results */}
          {results && !loading && (activeTab === 'all' || activeTab === 'prices') && filteredPrices.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {(activeTab === 'all') && <h3 style={{ fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)' }}>Prices ({filteredPrices.length})</h3>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredPrices.map(p => (
                  <div key={p.id} className="glass-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(0,212,170,0.1)', padding: '4px 8px', borderRadius: 4, minWidth: 60, textAlign: 'center' }}>
                      TZS {Number(p.price).toLocaleString()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.crop}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <MapPin size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} /> {p.market}, {p.region}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {p.date}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Crop Results */}
          {results && !loading && (activeTab === 'all' || activeTab === 'crops') && filteredCrops.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {(activeTab === 'all') && <h3 style={{ fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)' }}>Crops ({filteredCrops.length})</h3>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {filteredCrops.map(c => (
                  <div key={c.id} className="glass-card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.category} · {c.unit}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market Results */}
          {results && !loading && (activeTab === 'all' || activeTab === 'markets') && filteredMarkets.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {(activeTab === 'all') && <h3 style={{ fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)' }}>Markets ({filteredMarkets.length})</h3>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                {filteredMarkets.map(m => (
                  <div key={m.id} className="glass-card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {m.region} · {m.district} · {m.market_type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Region Results */}
          {results && !loading && (activeTab === 'all' || activeTab === 'regions') && filteredRegions.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {(activeTab === 'all') && <h3 style={{ fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)' }}>Regions ({filteredRegions.length})</h3>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {filteredRegions.map(r => (
                  <div key={r.id} className="glass-card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.zone}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
