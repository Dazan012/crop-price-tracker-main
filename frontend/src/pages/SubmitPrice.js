import { useState, useEffect } from 'react';
import { priceAPI } from '../services/api';
import { cachedAPI } from '../services/DataCache';
import { useDataWithFallback } from '../services/DataContext';
import { useAuth } from '../services/AuthContext';
import { LoadingSpinner, PageCard } from '../components/Shared';
import { PlusCircle, AlertTriangle, CheckCircle, Info, MapPin, Wheat, DollarSign, Calendar, Shield, Navigation } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function SubmitPrice() {
  const { canSubmit, user, isApproved, role } = useAuth();
  const { crops, regions, loading: dataLoading } = useDataWithFallback();
  const [markets, setMarkets] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    crop: '', market: '', price: '', quantity: '', price_date: new Date().toISOString().split('T')[0],
  });
  const [gpsStatus, setGpsStatus] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus({ error: 'Geolocation not supported' });
      return;
    }
    setGpsLoading(true);
    setGpsStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGpsStatus({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsStatus({ error: err.code === 1 ? 'Location permission denied' : 'Unable to get location' });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (form.region) {
      cachedAPI.markets(form.region).then(data => setMarkets(data)).catch(console.error);
    }
  }, [form.region]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.crop || !form.market || !form.price || !form.price_date) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await priceAPI.submit({
        crop: parseInt(form.crop),
        market: parseInt(form.market),
        price: parseFloat(form.price),
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        price_date: form.price_date,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      });
      setResult({
          success: true,
          anomaly: res.data.anomaly_detected,
          score: res.data.anomaly_score,
          zScore: res.data.z_score,
          validationStatus: res.data.validation_status,
          message: res.data.message,
          entry: res.data.entry,
        });
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.detail || err.message || 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canSubmit) {
    if (role === 'agent' && !isApproved) {
      return (
        <div className="page">
          <div className="glass-card fade-in" style={{ padding: 60, textAlign: 'center', maxWidth: 500, margin: '80px auto' }}>
            <Shield size={48} style={{ color: 'var(--warning)', opacity: 0.6, marginBottom: 16 }} />
            <h2>Approval Pending</h2>
            <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
              Your agent account is awaiting admin approval. You'll be able to submit prices once approved.
            </p>
            <a href="/dashboard" className="btn btn-secondary" style={{ marginTop: 20 }}>Back to Dashboard</a>
          </div>
        </div>
      );
    }
    return <Navigate to="/dashboard" />;
  }

  if (dataLoading) return <LoadingSpinner message="Loading form data..." />;

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><PlusCircle size={28} /> Submit Price</h1>
          <p>Report current crop prices from your local market</p>
        </div>
      </div>

      <div className="grid-2">
        <PageCard title="Price Entry Form" icon={<PlusCircle size={18} />}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="submit-crop"><Wheat size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Crop</label>
              <select className="form-control" id="submit-crop" name="crop" value={form.crop} onChange={handleChange} required>
                <option value="">Select a crop...</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name} ({c.category})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="submit-region"><MapPin size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Region</label>
              <select className="form-control" id="submit-region" name="region" value={form.region || ''} onChange={handleChange} required>
                <option value="">Select a region...</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.zone})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="submit-market"><MapPin size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Market</label>
              <select className="form-control" id="submit-market" name="market" value={form.market} onChange={handleChange} required disabled={!form.region}>
                <option value="">Select a market...</option>
                {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="submit-price"><DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Price (TZS per kg)</label>
              <input className="form-control" id="submit-price" type="number" name="price" value={form.price} onChange={handleChange} min="1" step="0.01" placeholder="e.g. 1500" required />
            </div>

            <div className="form-group">
              <label htmlFor="submit-quantity">Quantity (optional)</label>
              <input className="form-control" id="submit-quantity" type="number" name="quantity" value={form.quantity} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 100" />
            </div>

            <div className="form-group">
              <label>GPS Location <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(optional)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={captureLocation} disabled={gpsLoading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Navigation size={14} style={{ color: gpsLoading ? 'var(--text-muted)' : form.latitude ? 'var(--success)' : 'var(--accent)' }} />
                  {gpsLoading ? 'Locating...' : form.latitude ? 'Recapture GPS' : 'Capture GPS'}
                </button>
                {gpsStatus && !gpsStatus.error && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {gpsStatus.lat}, {gpsStatus.lng} (±{gpsStatus.accuracy}m)
                  </span>
                )}
                {gpsStatus?.error && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                    {gpsStatus.error}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="submit-date"><Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Price Date</label>
              <input className="form-control" id="submit-date" type="date" name="price_date" value={form.price_date} onChange={handleChange} required />
            </div>

            <button className="btn btn-primary btn-lg" type="submit" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Submitting...' : 'Submit Price'}
            </button>
          </form>
        </PageCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {result && (
            <div className="glass-card fade-in submission-result" style={{ padding: 24 }}>
              {result.success ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    {result.validationStatus === 'approved' ? (
                      <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                    ) : result.validationStatus === 'rejected' ? (
                      <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
                    ) : (
                      <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
                    )}
                    <h3>
                      {result.validationStatus === 'approved'
                        ? 'Price Approved & Published'
                        : result.validationStatus === 'rejected'
                          ? 'Price Rejected'
                          : 'Submission Under Review'}
                    </h3>
                  </div>

                  {/* Mini Pipeline Visualization */}
                  <div className="submission-pipeline-mini" style={{ marginBottom: 16 }}>
                    <span className="mini-step done">
                      <CheckCircle size={10} /> Submitted
                    </span>
                    <span className="mini-arrow">→</span>
                    <span className={`mini-step ${result.validationStatus === 'rejected' && result.zScore > 3 ? 'done' : result.validationStatus === 'approved' ? 'done' : 'current'}`}>
                      {result.zScore != null ? (
                        <>Z-Score: {Number(result.zScore).toFixed(1)}</>
                      ) : (
                        <>Validated</>
                      )}
                    </span>
                    <span className="mini-arrow">→</span>
                    {result.validationStatus === 'approved' ? (
                      <span className="mini-step done">
                        <CheckCircle size={10} /> Published
                      </span>
                    ) : result.validationStatus === 'rejected' ? (
                      <span className="mini-step" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        <AlertTriangle size={10} /> Rejected
                      </span>
                    ) : (
                      <span className="mini-step current">
                        Under Review
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.875rem', marginBottom: 12, color: 'var(--text-secondary)' }}>
                    {result.message || 'Your submission has been processed.'}
                  </p>
                  {result.entry && (
                    <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem' }}>
                      <div>Crop: <strong>{result.entry.crop_name}</strong></div>
                      <div>Market: <strong>{result.entry.market_name}</strong></div>
                      <div>Price: <strong>TZS {Number(result.entry.price).toLocaleString()}</strong></div>
                      <div>Date: <strong>{result.entry.price_date}</strong></div>
                      <div style={{ marginTop: 4 }}>
                        Status:{' '}
                        <strong style={{
                          color: result.validationStatus === 'approved' ? 'var(--success)'
                            : result.validationStatus === 'rejected' ? 'var(--danger)'
                            : 'var(--warning)',
                        }}>
                          {result.entry.status || 'Pending'}
                        </strong>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
                  <div>
                    <h3 style={{ color: 'var(--danger)' }}>Submission Failed</h3>
                    <p style={{ fontSize: '0.875rem' }}>{result.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
