import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { dataAPI } from '../services/api';
import {
  Sprout, TrendingUp, Shield, ArrowRight, ArrowLeft,
  Check, User, Phone, MapPin, CreditCard,
} from 'lucide-react';

const ROLE_OPTIONS = [
  {
    key: 'farmer', label: 'Farmer', icon: Sprout,
    color: '#22c55e',
    desc: 'Track crop prices, find best markets, get forecasts',
    features: ['Real-time market prices', 'Best market finder', 'Price forecasts', 'Transport cost calculator'],
  },
  {
    key: 'trader', label: 'Trader', icon: TrendingUp,
    color: '#3b82f6',
    desc: 'Monitor spreads, track supply, find opportunities',
    features: ['Spread analysis', 'Supply chain tracking', 'Market intelligence', 'Price alerts'],
  },
  {
    key: 'agent', label: 'Market Agent', icon: Shield,
    color: '#f59e0b',
    desc: 'Submit prices, manage market data, serve your community',
    features: ['Submit daily prices', 'Track submissions', 'Market oversight', 'Community service'],
  },
];

const MOBILE_MONEY_OPTIONS = [
  { value: '', label: 'Select provider' },
  { value: 'mpesa', label: 'Vodacom M-Pesa' },
  { value: 'tigo', label: 'Tigo Pesa' },
  { value: 'airtel', label: 'Airtel Money' },
  { value: 'halopesa', label: 'Halopesa' },
  { value: 'none', label: 'None' },
];

export default function Onboarding() {
  const { completeOnboarding } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [regions, setRegions] = useState([]);
  const [crops, setCrops] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [form, setForm] = useState({
    role: '',
    first_name: '', last_name: '',
    phone: '', region: '', nida_number: '', gender: '',
    // Farmer
    main_crops: '', farm_size: '', preferred_markets: '', mobile_money_provider: '', mobile_money_number: '',
    // Trader
    operating_regions: '', crops_of_interest: '', transport_capacity: '',
    // Agent
    assigned_market: '', experience: '',
  });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleTag = (key, name) => {
    const cur = (form[key] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (cur.includes(name)) set(key, cur.filter(n => n !== name).join(', '));
    else set(key, [...cur, name].join(', '));
  };

  useEffect(() => {
    dataAPI.regions().then(r => setRegions(r.data || [])).catch(() => {});
    dataAPI.crops().then(r => setCrops(r.data || [])).catch(() => {});
    dataAPI.markets().then(r => setMarkets(r.data || [])).catch(() => {});
  }, []);

  const totalSteps = 3; // role, personal, role-fields = indices 0-2
  const canGoNext = () => {
    if (step === 0) return !!form.role;
    if (step === 1) return form.first_name && form.last_name && form.phone;
    if (step === 2) return true;
    return true;
  };

  const validatePhone = (phone) => {
    const clean = phone.replace(/\s/g, '');
    return /^(?:\+255|0)[67]\d{8}$/.test(clean);
  };

  const validateNida = (nida) => {
    if (!nida) return true; // optional
    return /^\d{20}$/.test(nida);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const data = { ...form };
      if (data.phone && !data.phone.startsWith('+')) {
        data.phone = `+255${data.phone.replace(/^0+/, '')}`;
      }
      const res = await completeOnboarding(data);
      if (res?.onboarding_complete) {
        if (res?.has_password === false) {
          localStorage.removeItem('skip_password_setup');
          navigate('/setup-password', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        navigate('/verify-email', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="glass-card auth-card fade-in-up" style={{ maxWidth: 520 }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* ── Step 0: Role Selection ── */}
        {step === 0 && (
          <div>
            <h3 style={{ marginBottom: 4 }}>What describes you best?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              Choose the role that fits how you'll use Smart Crops.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ROLE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = form.role === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => set('role', opt.key)}
                    className="btn"
                    style={{
                      width: '100%', justifyContent: 'flex-start', padding: '14px 16px',
                      background: selected ? 'var(--bg-surface)' : 'transparent',
                      border: `2px solid ${selected ? opt.color : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)', textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                      background: `${opt.color}20`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: opt.color, marginRight: 12, flexShrink: 0,
                    }}>
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 2, color: 'var(--text)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                    </div>
                    {selected && <Check size={18} style={{ color: opt.color, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 1: Personal Info ── */}
        {step === 1 && (
          <div>
            <h3 style={{ marginBottom: 4 }}>Personal Information</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              Help us set up your profile.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label><User size={12} style={{ marginRight: 4 }} />First Name</label>
                <input className="form-control" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="John" required />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Last Name</label>
                <input className="form-control" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Doe" required />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label><Phone size={12} style={{ marginRight: 4 }} />Phone Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{
                  padding: '10px 10px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                }}>🇹🇿 +255</span>
                <input className="form-control" type="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^\d\s]/g, ''))} placeholder="7XX XXX XXX" required style={{ flex: 1 }} />
              </div>
              {form.phone && !validatePhone(form.phone) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Must be a valid Tanzanian number (6X or 7X)</span>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label><MapPin size={12} style={{ marginRight: 4 }} />Region</label>
              <select className="form-control" value={form.region} onChange={e => set('region', e.target.value)} required>
                <option value="">Select Region...</option>
                {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label><CreditCard size={12} style={{ marginRight: 4 }} />NIDA Number <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(optional)</span></label>
              <input className="form-control" value={form.nida_number} onChange={e => set('nida_number', e.target.value.replace(/\D/g, ''))} placeholder="20-digit national ID" maxLength={20} />
              {form.nida_number && !validateNida(form.nida_number) && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>NIDA must be exactly 20 digits</span>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Gender <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(optional)</span></label>
              <select className="form-control" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Step 2: Role-specific fields ── */}
        {step === 2 && form.role === 'farmer' && (
          <div>
            <h3 style={{ marginBottom: 4 }}>Farmer Details</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              Tell us about your farming activity.
            </p>
<div className="form-group" style={{ marginBottom: 12 }}>
                <label>Main Crops</label>
                <div className="reg-tag-list">
                  {crops.map(c => {
                    const active = (form.main_crops || '').split(',').map(s => s.trim()).includes(c.name);
                    return (
                      <button key={c.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                        style={active ? { background: '#22c55e', color: '#000', borderColor: '#22c55e' } : {}}
                        onClick={() => toggleTag('main_crops', c.name)}>
                        {active && <Check size={10} />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to select multiple</span>
              </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Farm Size (acres)</label>
              <input className="form-control" type="number" value={form.farm_size} onChange={e => set('farm_size', e.target.value)} placeholder="e.g. 5" min="0" step="0.5" />
            </div>
<div className="form-group" style={{ marginBottom: 12 }}>
                <label>Preferred Markets</label>
                <div className="reg-tag-list">
                  {markets
                    .filter(m => !form.region || (m.region_name || m.region) === form.region)
                    .slice(0, 15)
                    .map(m => {
                      const active = (form.preferred_markets || '').split(',').map(s => s.trim()).includes(m.name);
                      return (
                        <button key={m.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                          style={active ? { background: '#22c55e', color: '#000', borderColor: '#22c55e' } : {}}
                          onClick={() => toggleTag('preferred_markets', m.name)}>
                          {active && <Check size={10} />}
                          {m.name}
                        </button>
                      );
                    })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to select multiple</span>
              </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mobile Money Provider</label>
              <select className="form-control" value={form.mobile_money_provider} onChange={e => set('mobile_money_provider', e.target.value)}>
                {MOBILE_MONEY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && form.role === 'trader' && (
          <div>
            <h3 style={{ marginBottom: 4 }}>Trader Details</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              Tell us about your trading activity.
            </p>
<div className="form-group" style={{ marginBottom: 12 }}>
                <label>Operating Regions</label>
                <div className="reg-tag-list">
                  {regions.map(r => {
                    const active = (form.operating_regions || '').split(',').map(s => s.trim()).includes(r.name);
                    return (
                      <button key={r.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                        style={active ? { background: '#3b82f6', color: '#000', borderColor: '#3b82f6' } : {}}
                        onClick={() => toggleTag('operating_regions', r.name)}>
                        {active && <Check size={10} />}
                        {r.name}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to select multiple</span>
              </div>
<div className="form-group" style={{ marginBottom: 12 }}>
                <label>Crops of Interest</label>
                <div className="reg-tag-list">
                  {crops.map(c => {
                    const active = (form.crops_of_interest || '').split(',').map(s => s.trim()).includes(c.name);
                    return (
                      <button key={c.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                        style={active ? { background: '#3b82f6', color: '#000', borderColor: '#3b82f6' } : {}}
                        onClick={() => toggleTag('crops_of_interest', c.name)}>
                        {active && <Check size={10} />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to select multiple</span>
              </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Transport Capacity</label>
              <input className="form-control" value={form.transport_capacity} onChange={e => set('transport_capacity', e.target.value)} placeholder="e.g. 5 tons, pickup truck" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mobile Money Provider</label>
              <select className="form-control" value={form.mobile_money_provider} onChange={e => set('mobile_money_provider', e.target.value)}>
                {MOBILE_MONEY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && form.role === 'agent' && (
          <div>
            <h3 style={{ marginBottom: 4 }}>Agent Details</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
              Tell us about your market assignment.
            </p>
<div className="form-group" style={{ marginBottom: 12 }}>
                <label>Assigned Market</label>
                <div className="reg-tag-list">
                  {markets
                    .filter(m => !form.region || (m.region_name || m.region) === form.region)
                    .slice(0, 15)
                    .map(m => {
                      const active = String(form.assigned_market) === String(m.id);
                      return (
                        <button key={m.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                          style={active ? { background: '#f59e0b', color: '#000', borderColor: '#f59e0b' } : {}}
                          onClick={() => set('assigned_market', active ? '' : m.id)}>
                          {active && <Check size={10} />}
                          {m.name}
                        </button>
                      );
                    })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Select your assigned market</span>
              </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Experience</label>
              <textarea className="form-control" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="Describe your experience as a market agent..." rows={3} />
            </div>
          </div>
        )}

        {/* ── Step 2: Submit button (last step) ── */}
        {step === 2 && (
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            >
              {loading ? 'Saving your profile...' : 'Save & Continue'}
            </button>
          </div>
        )}

        {/* Navigation (steps 0 and 1) */}
        {step < 2 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button
                onClick={() => { setStep(step - 1); setError(''); }}
                className="btn"
                style={{
                  flex: 1, justifyContent: 'center',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <button
              onClick={() => {
                if (step === 1 && !validatePhone(form.phone)) {
                  setError('Please enter a valid phone number.');
                  return;
                }
                if (step === 1 && !validateNida(form.nida_number)) {
                  setError('NIDA must be exactly 20 digits.');
                  return;
                }
                setError('');
                setStep(step + 1);
              }}
              disabled={!canGoNext()}
              className="btn btn-primary"
              style={{ flex: 2, justifyContent: 'center' }}
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
