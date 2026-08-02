import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { cachedAPI } from '../services/DataCache';
import {
  UserPlus, Leaf, Eye, EyeOff, Sprout, TrendingUp, MapPin, Shield,
  ChevronRight, ChevronLeft, Check, Phone, CreditCard, User, Mail,
  Lock, Globe, Truck, Briefcase, Award, AlertCircle,
} from 'lucide-react';

/* ================================================================== */
/*  CONSTANTS                                                          */
/* ================================================================== */

const ROLES = {
  farmer: {
    icon: <Sprout size={36} />,
    color: '#10b981',
    glow: 'rgba(16,185,129,0.25)',
    title: 'Farmer',
    subtitle: 'Smallholder & Commercial',
    desc: 'Track market prices, get best-market recommendations, and know when to sell your harvest.',
    features: ['Compare crop prices across markets', 'Best-market sell recommendations', 'Price trend alerts & forecasts', 'Mobile money payment tracking'],
    steps: ['Account', 'Farm Details', 'Verify & Submit'],
  },
  trader: {
    icon: <TrendingUp size={36} />,
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.25)',
    title: 'Trader',
    subtitle: 'Crop Buyer & Seller',
    desc: 'Access market analytics, identify arbitrage opportunities, and track price movements.',
    features: ['Full market analytics dashboard', 'Arbitrage opportunity detection', 'Multi-region price tracking', 'Transport & logistics planning'],
    steps: ['Account', 'Trade Profile', 'Logistics', 'Verify & Submit'],
  },
  agent: {
    icon: <Shield size={36} />,
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.25)',
    title: 'Market Agent',
    subtitle: 'Official Data Collector',
    desc: 'Submit official market prices, review flagged entries, and ensure data quality for your region.',
    features: ['Submit & review price entries', 'Anomaly detection tools', 'Data quality dashboards', 'Admin approval workflow'],
    steps: ['Account', 'Agent Profile', 'Credentials', 'Verify & Submit'],
  },
};

const CROP_TAGS = [
  'Maize', 'Rice', 'Beans', 'Cassava', 'Potatoes', 'Tomatoes', 'Onions',
  'Bananas', 'Wheat', 'Sorghum', 'Millet', 'Groundnuts', 'Sunflower',
  'Sesame', 'Cashew', 'Coffee', 'Cotton', 'Tobacco', 'Tea', 'Sugarcane',
];

const MOBILE_PROVIDERS = [
  { value: 'mpesa', label: 'M-Pesa (Vodacom)' },
  { value: 'tigopesa', label: 'Mixx by Yas' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'halopesa', label: 'Halo Pesa' },
  { value: 'none', label: 'No mobile money' },
];

const TRANSPORT_OPTIONS = [
  { value: 'none', label: 'No transport', icon: '\u{1F6B6}' },
  { value: 'bicycle', label: 'Bicycle', icon: '\u{1F6B2}' },
  { value: 'motorcycle', label: 'Motorcycle (Bodaboda)', icon: '\u{1F3CD}' },
  { value: 'pickup', label: 'Pickup Truck', icon: '\u{1F6FB}' },
  { value: 'truck', label: 'Truck', icon: '\u{1F69B}' },
  { value: 'large_truck', label: 'Large Truck / Trailer', icon: '\u{1F69A}' },
];

/* -- Tanzania Validation -- */

function validateTzPhone(phone) {
  if (!phone) return 'Phone number is required';
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (/^\+255[67]\d{8}$/.test(cleaned)) return null;
  if (/^0[67]\d{8}$/.test(cleaned)) return null;
  if (/^255[67]\d{8}$/.test(cleaned)) return null;
  return 'Enter a valid Tanzanian number: +255 6X/7X XXX XXXX or 06X/07X XXX XXXX';
}

function validateNida(nida) {
  if (!nida || !nida.trim()) return 'NIDA number is required';
  const cleaned = nida.replace(/[\s\-]/g, '');
  if (/^\d{20}$/.test(cleaned)) return null;
  if (/^NIDA\d{10,20}$/i.test(cleaned)) return null;
  return 'NIDA should be 20 digits (e.g. 19950101123456789012)';
}

/* ================================================================== */
/*  STEP PROGRESS BAR                                                  */
/* ================================================================== */

function StepProgress({ steps, current, color }) {
  return (
    <div className="reg-step-progress">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={label} className="reg-step-item">
            <div
              className={`reg-step-dot ${done ? 'done' : ''} ${active ? 'active' : ''}`}
              style={active || done ? { borderColor: color, background: done ? color : 'transparent', color: done ? '#000' : color } : {}}
            >
              {done ? <Check size={14} /> : num}
            </div>
            <span
              className="reg-step-label"
              style={active ? { color: color, fontWeight: 600 } : {}}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className="reg-step-line"
                style={done ? { background: color } : {}}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  TAG INPUT (crop chips)                                             */
/* ================================================================== */

function CropTagInput({ value, onChange, suggestions, color }) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const toggle = (crop) => {
    if (selected.includes(crop)) {
      onChange(selected.filter(c => c !== crop).join(', '));
    } else {
      onChange([...selected, crop].join(', '));
    }
  };

  return (
    <div>
      <div className="reg-tag-list">
        {suggestions.map(crop => {
          const active = selected.includes(crop);
          return (
            <button
              key={crop}
              type="button"
              className={`reg-tag ${active ? 'active' : ''}`}
              style={active ? { background: color, color: '#000', borderColor: color } : {}}
              onClick={() => toggle(crop)}
            >
              {active && <Check size={10} />}
              {crop}
            </button>
          );
        })}
      </div>
      <input
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or type crop names separated by commas..."
        style={{ marginTop: 8, fontSize: '0.82rem' }}
      />
    </div>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function Register() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [role, setRole] = useState(null);
  const [step, setStep] = useState(1);
  const [crops, setCrops] = useState([]);
  const [regions, setRegions] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    const requestedRole = searchParams.get('role')?.toLowerCase();
    if (requestedRole && ROLES[requestedRole]) {
      setRole(requestedRole);
    }
  }, [searchParams]);

  const [form, setForm] = useState({
    username: '', email: '', password: '', first_name: '', last_name: '',
    phone: '', region: '',
    main_crops: '', farm_size: '', preferred_markets: '',
    operating_regions: '', crops_of_interest: '', transport_capacity: '',
    assigned_market: '', id_verification: '', id_type: '', experience: '',
    mobile_money_provider: '', nida_number: '',
  });

  useEffect(() => {
    Promise.all([
      cachedAPI.crops().then(data => setCrops(data || [])).catch(() => {}),
      cachedAPI.regions().then(data => setRegions(data || [])).catch(() => {}),
      cachedAPI.markets().then(data => setMarkets(data || [])).catch(() => {}),
    ]).finally(() => setDropdownsLoading(false));
  }, []);

  const cropSuggestions = crops.length > 0
    ? crops.map(c => typeof c === 'string' ? c : c.name).filter(Boolean)
    : CROP_TAGS;

  const roleCfg = ROLES[role];
  const totalSteps = roleCfg ? roleCfg.steps.length : 1;

  const set = (name, val) => setForm(prev => ({ ...prev, [name]: val }));
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      // Reset assigned_market when region changes
      if (name === 'region') next.assigned_market = '';
      return next;
    });
  };

  const validateStep = useCallback(() => {
    const errs = {};

    if (step === 1) {
      if (!form.first_name.trim()) errs.first_name = 'Required';
      if (!form.last_name.trim()) errs.last_name = 'Required';
      if (!form.username.trim()) errs.username = 'Required';
      if (!form.email.trim()) errs.email = 'Required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
      if (!form.password) errs.password = 'Required';
      else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    }

    if (step === 2 || step === 3) {
      const phoneErr = validateTzPhone(form.phone);
      if (phoneErr) errs.phone = phoneErr;
    }

    if (role === 'farmer' && step === 2) {
      if (!form.region) errs.region = 'Select your region';
    }

    if (role === 'trader' && step === 2) {
      if (!form.operating_regions.trim()) errs.operating_regions = 'Enter at least one region';
    }

    if (role === 'agent' && step === 2) {
      if (!form.region) errs.region = 'Select your region';
      if (!form.assigned_market) errs.assigned_market = 'Select your assigned market';
    }

    // NIDA validation for all roles on steps where the field appears
    if ((role === 'agent' && step === 3) || (role === 'trader' && step === 3) || (role === 'farmer' && step === 2)) {
      const nidaErr = validateNida(form.nida_number);
      if (nidaErr) errs.nida_number = nidaErr;
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [step, role, form]);

  const nextStep = () => {
    if (validateStep()) {
      setStep(s => Math.min(s + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setFieldErrors({});
    setStep(s => Math.max(s - 1, 1));
  };

  if (isAuthenticated) return <Navigate to="/verify-email" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;

    setError('');
    setLoading(true);
    try {
      const data = { ...form, role };

      // Clean numeric fields: convert empty strings to null to avoid backend validation errors
      if (form.farm_size && form.farm_size !== '') {
        data.farm_size = parseFloat(form.farm_size);
      } else {
        delete data.farm_size;
      }

      if (form.assigned_market && form.assigned_market !== '') {
        data.assigned_market = parseInt(form.assigned_market);
      } else {
        delete data.assigned_market;
      }

      // Remove empty optional fields to prevent backend issues
      Object.keys(data).forEach(key => {
        if (data[key] === '' || data[key] === undefined) delete data[key];
      });

      // Re-add required fields that must always be present
      data.username = form.username;
      data.email = form.email;
      data.password = form.password;
      data.first_name = form.first_name;
      data.last_name = form.last_name;
      data.role = role;

      await register(data);
      // Redirect to email verification after successful registration
      navigate('/verify-email');
    } catch (err) {
      const respData = err.response?.data;
      if (respData && typeof respData === 'object') {
        const msgs = Object.values(respData).flat().join('. ');
        setError(msgs || 'Registration failed');
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const FieldError = ({ name }) =>
    fieldErrors[name] ? (
      <div className="reg-field-error">
        <AlertCircle size={12} /> {fieldErrors[name]}
      </div>
    ) : null;

  /* ================================================================== */
  /*  RENDER: ROLE SELECTION                                             */
  /* ================================================================== */

  if (!role) {
    return (
      <div className="auth-page">
        <div className="reg-role-selection fade-in">
          <div className="auth-header" style={{ marginBottom: 32 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: '#000',
            }}>
              <Leaf size={28} />
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Join Smart Crops</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
              Choose your account type. Each role gets a personalized dashboard with the tools they need.
            </p>
          </div>

          <div className="reg-role-cards">
            {Object.entries(ROLES).map(([key, r]) => (
              <button
                key={key}
                type="button"
                className="reg-role-card"
                onClick={() => { setRole(key); setStep(1); }}
                style={{ '--card-color': r.color, '--card-glow': r.glow }}
              >
                <div className="reg-role-icon" style={{ color: r.color, background: r.glow }}>
                  {r.icon}
                </div>
                <div className="reg-role-title">{r.title}</div>
                <div className="reg-role-subtitle" style={{ color: r.color }}>{r.subtitle}</div>
                <div className="reg-role-desc">{r.desc}</div>
                <ul className="reg-role-features">
                  {r.features.map((f, i) => (
                    <li key={i}><ChevronRight size={12} style={{ color: r.color, flexShrink: 0 }} /> {f}</li>
                  ))}
                </ul>
                <div className="reg-role-cta" style={{ color: r.color }}>
                  Select {r.title} <ChevronRight size={16} />
                </div>
              </button>
            ))}
          </div>

          <div className="auth-footer" style={{ marginTop: 32 }}>
            Already have an account? <Link to="/login">Sign In</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  RENDER: REGISTRATION FORM                                          */
  /* ================================================================== */

  const isLastStep = step === totalSteps;

  return (
    <div className="auth-page">
      <div className="glass-card auth-card fade-in" style={{ maxWidth: 560 }}>

        <button
          type="button"
          onClick={() => { setRole(null); setStep(1); setFieldErrors({}); setError(''); }}
          className="reg-back-roles"
        >
          <ChevronLeft size={14} /> Change role
        </button>

        <StepProgress steps={roleCfg.steps} current={step} color={roleCfg.color} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: roleCfg.glow, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: roleCfg.color,
          }}>
            {roleCfg.icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{roleCfg.title} Registration</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Step {step} of {totalSteps} &mdash; {roleCfg.steps[step - 1]}
            </div>
          </div>
        </div>

        {role === 'agent' && step === 1 && (
          <div className="reg-notice reg-notice-warning">
            <Shield size={14} />
            Agent accounts require admin approval before you can submit prices.
          </div>
        )}

        {error && (
          <div className="reg-notice reg-notice-error">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">

          {/* STEP 1: Account Info (all roles) */}
          {step === 1 && (
            <div className="reg-step fade-in">
              <div className="reg-field-row reg-field-2col">
                <div className="reg-field">
                  <label><User size={13} /> First Name</label>
                  <input className="form-control" name="first_name" value={form.first_name} onChange={handleChange} placeholder="e.g. Juma" required />
                  <FieldError name="first_name" />
                </div>
                <div className="reg-field">
                  <label><User size={13} /> Last Name</label>
                  <input className="form-control" name="last_name" value={form.last_name} onChange={handleChange} placeholder="e.g. Mwangi" required />
                  <FieldError name="last_name" />
                </div>
              </div>

              <div className="reg-field">
                <label><User size={13} /> Username</label>
                <input className="form-control" name="username" value={form.username} onChange={handleChange} placeholder="Choose a unique username" required />
                <FieldError name="username" />
              </div>

              <div className="reg-field">
                <label><Mail size={13} /> Email Address</label>
                <input className="form-control" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
                <FieldError name="email" />
              </div>

              <div className="reg-field">
                <label><Lock size={13} /> Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-control"
                    type={showPw ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    minLength={8}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="reg-pw-toggle">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password && (
                  <div className="reg-pw-requirements" style={{ marginTop: 8, fontSize: '0.72rem', lineHeight: 1.8 }}>
                    {[
                      { test: form.password.length >= 8, label: 'At least 8 characters' },
                      { test: /[A-Z]/.test(form.password), label: 'One uppercase letter (A-Z)' },
                      { test: /[a-z]/.test(form.password), label: 'One lowercase letter (a-z)' },
                      { test: /\d/.test(form.password), label: 'One number (0-9)' },
                      { test: /[^A-Za-z0-9]/.test(form.password), label: 'One special character (!@#$...)' },
                    ].map(({ test, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: test ? '#10b981' : 'var(--text-muted)' }}>
                        {test ? <Check size={11} /> : <AlertCircle size={11} />}
                        <span style={{ textDecoration: test ? 'none' : 'none' }}>{label}</span>
                      </div>
                    ))}
                    <div className="reg-pw-bar" style={{ marginTop: 6 }}>
                      <div
                        className="reg-pw-fill"
                        style={{
                          width: `${[form.password.length >= 8, /[A-Z]/.test(form.password), /[a-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length * 20}%`,
                          background: [form.password.length >= 8, /[A-Z]/.test(form.password), /[a-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length >= 4 ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                )}
                <FieldError name="password" />
              </div>
            </div>
          )}

          {/* STEP 2: Farmer -- Farm Details */}
          {role === 'farmer' && step === 2 && (
            <div className="reg-step fade-in">
              <div className="reg-field">
                <label><Phone size={13} /> Phone Number</label>
                <input className="form-control" name="phone" value={form.phone} onChange={handleChange} placeholder="+255 6X XXX XXXX" required />
                <FieldError name="phone" />
              </div>

              <div className="reg-field">
                <label><Globe size={13} /> Region</label>
                <select className="form-control" name="region" value={form.region} onChange={handleChange} required disabled={dropdownsLoading}>
                  <option value="">{dropdownsLoading ? 'Loading regions...' : 'Select your region...'}</option>
                  {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <FieldError name="region" />
              </div>

              <div className="reg-field">
                <label><Sprout size={13} /> Main Crops</label>
                <CropTagInput
                  value={form.main_crops}
                  onChange={(v) => set('main_crops', v)}
                  suggestions={cropSuggestions}
                  color={roleCfg.color}
                />
              </div>

              <div className="reg-field">
                <label><MapPin size={13} /> Farm Size (acres)</label>
                <input className="form-control" type="number" name="farm_size" value={form.farm_size} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 5" />
              </div>

              <div className="reg-field">
                <label><Briefcase size={13} /> Preferred Markets</label>
                <input className="form-control" name="preferred_markets" value={form.preferred_markets} onChange={handleChange} placeholder="e.g. Soko Kuu, Ilala Market" />
                {markets.length > 0 && (
                  <div className="reg-tag-list" style={{ marginTop: 6 }}>
                    {markets
                      .filter(m => !form.region || (m.region_name || m.region) === form.region)
                      .slice(0, 15)
                      .map(m => {
                        const selected = (form.preferred_markets || '').split(',').map(s => s.trim());
                        const active = selected.includes(m.name);
                        return (
                          <button key={m.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                            style={active ? { background: roleCfg.color, color: '#000', borderColor: roleCfg.color } : {}}
                            onClick={() => {
                              const cur = selected.filter(Boolean);
                              if (active) {
                                set('preferred_markets', cur.filter(n => n !== m.name).join(', '));
                              } else {
                                set('preferred_markets', [...cur, m.name].join(', '));
                              }
                            }}
                          >
                            {active && <Check size={10} />}
                            {m.name}
                          </button>
                        );
                      })}
                    {form.region && markets.filter(m => (m.region_name || m.region) === form.region).length === 0 && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No markets found for {form.region}. Try a different region or type market names above.
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> NIDA Number</label>
                <input className="form-control" name="nida_number" value={form.nida_number} onChange={handleChange} placeholder="20-digit NIDA number (e.g. 19950101123456789012)" required />
                <FieldError name="nida_number" />
                <div className="reg-field-hint">Your National Identification Authority number</div>
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> Mobile Money Provider</label>
                <select className="form-control" name="mobile_money_provider" value={form.mobile_money_provider} onChange={handleChange}>
                  <option value="">Select provider...</option>
                  {MOBILE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Trader -- Trade Profile */}
          {role === 'trader' && step === 2 && (
            <div className="reg-step fade-in">
              <div className="reg-field">
                <label><Phone size={13} /> Phone Number</label>
                <input className="form-control" name="phone" value={form.phone} onChange={handleChange} placeholder="+255 6X XXX XXXX" required />
                <FieldError name="phone" />
              </div>

              <div className="reg-field">
                <label><Globe size={13} /> Operating Regions</label>
                <input className="form-control" name="operating_regions" value={form.operating_regions} onChange={handleChange} placeholder="e.g. Mbeya, Dar es Salaam, Arusha" required />
                {regions.length > 0 && (
                  <div className="reg-tag-list" style={{ marginTop: 6 }}>
                    {regions.map(r => {
                      const selected = (form.operating_regions || '').split(',').map(s => s.trim());
                      const active = selected.includes(r.name);
                      return (
                        <button key={r.id} type="button" className={`reg-tag ${active ? 'active' : ''}`}
                          style={active ? { background: roleCfg.color, color: '#000', borderColor: roleCfg.color } : {}}
                          onClick={() => {
                            const cur = selected.filter(Boolean);
                            if (active) {
                              set('operating_regions', cur.filter(n => n !== r.name).join(', '));
                            } else {
                              set('operating_regions', [...cur, r.name].join(', '));
                            }
                          }}
                        >
                          {active && <Check size={10} />}
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <FieldError name="operating_regions" />
              </div>

              <div className="reg-field">
                <label><Sprout size={13} /> Crops of Interest</label>
                <CropTagInput
                  value={form.crops_of_interest}
                  onChange={(v) => set('crops_of_interest', v)}
                  suggestions={cropSuggestions}
                  color={roleCfg.color}
                />
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> Mobile Money Provider</label>
                <select className="form-control" name="mobile_money_provider" value={form.mobile_money_provider} onChange={handleChange}>
                  <option value="">Select provider...</option>
                  {MOBILE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Agent -- Agent Profile */}
          {role === 'agent' && step === 2 && (
            <div className="reg-step fade-in">
              <div className="reg-field">
                <label><Phone size={13} /> Phone Number</label>
                <input className="form-control" name="phone" value={form.phone} onChange={handleChange} placeholder="+255 6X XXX XXXX" required />
                <FieldError name="phone" />
              </div>

              <div className="reg-field">
                <label><Globe size={13} /> Region</label>
                <select className="form-control" name="region" value={form.region} onChange={handleChange} required disabled={dropdownsLoading}>
                  <option value="">{dropdownsLoading ? 'Loading regions...' : 'Select your region...'}</option>
                  {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <FieldError name="region" />
              </div>

              <div className="reg-field">
                <label><MapPin size={13} /> Assigned Market</label>
                <select className="form-control" name="assigned_market" value={form.assigned_market} onChange={handleChange} required disabled={dropdownsLoading || !form.region}>
                  <option value="">{dropdownsLoading ? 'Loading markets...' : (form.region ? 'Select your assigned market...' : 'Select a region first...')}</option>
                  {markets
                    .filter(m => !form.region || (m.region_name || m.region) === form.region)
                    .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <FieldError name="assigned_market" />
              </div>

              <div className="reg-field">
                <label><Briefcase size={13} /> Experience</label>
                <textarea
                  className="form-control"
                  name="experience"
                  value={form.experience}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Describe your experience in market data collection, agriculture, or related fields..."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {/* STEP 3: Trader -- Logistics */}
          {role === 'trader' && step === 3 && (
            <div className="reg-step fade-in">
              <div className="reg-field">
                <label><Truck size={13} /> Transport Capacity (select all that apply)</label>
                <div className="reg-transport-grid">
                  {TRANSPORT_OPTIONS.map(opt => {
                    const selected = (form.transport_capacity || '').split(',').map(s => s.trim()).filter(Boolean);
                    const active = selected.includes(opt.value);
                    const noneSelected = selected.includes('none');
                    const isDisabled = noneSelected && opt.value !== 'none';
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`reg-transport-option ${active ? 'active' : ''}`}
                        style={{
                          ...(active ? { borderColor: roleCfg.color, background: roleCfg.glow } : {}),
                          ...(isDisabled ? { opacity: 0.35, pointerEvents: 'none' } : {}),
                        }}
                        disabled={isDisabled}
                        onClick={() => {
                          if (opt.value === 'none') {
                            // "No transport" is exclusive — toggle between none and empty
                            set('transport_capacity', active ? '' : 'none');
                          } else {
                            // Any other option — remove 'none' if present, then toggle
                            const cur = selected.filter(v => v !== 'none');
                            if (active) {
                              set('transport_capacity', cur.filter(v => v !== opt.value).join(', '));
                            } else {
                              set('transport_capacity', [...cur, opt.value].join(', '));
                            }
                          }
                        }}
                      >
                        <span className="reg-transport-icon">{opt.icon}</span>
                        <span className="reg-transport-label">
                          {active && <Check size={10} style={{ marginRight: 4 }} />}
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="reg-field">
                <label><MapPin size={13} /> Preferred Region</label>
                <select className="form-control" name="region" value={form.region} onChange={handleChange} disabled={dropdownsLoading}>
                  <option value="">{dropdownsLoading ? 'Loading regions...' : 'Select primary region...'}</option>
                  {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> NIDA Number</label>
                <input className="form-control" name="nida_number" value={form.nida_number} onChange={handleChange} placeholder="20-digit NIDA number" required />
                <FieldError name="nida_number" />
                <div className="reg-field-hint">Used for identity verification on large transactions</div>
              </div>
            </div>
          )}

          {/* STEP 3: Agent -- Credentials */}
          {role === 'agent' && step === 3 && (
            <div className="reg-step fade-in">
              <div className="reg-notice reg-notice-info">
                <Shield size={14} /> Identity verification helps ensure data integrity. Provide any one of the following.
              </div>

              <div className="reg-field">
                <label><Award size={13} /> ID Type (optional)</label>
                <select className="form-control" name="id_type" value={form.id_type || ''} onChange={handleChange}>
                  <option value="">Select ID type...</option>
                  <option value="kadi_ya_kura">Kadi ya Kura (Voter ID)</option>
                  <option value="tin">TIN Number</option>
                  <option value="nida">NIDA Number</option>
                  <option value="passport">Passport</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> ID Number (optional)</label>
                <input
                  className="form-control"
                  name="id_verification"
                  value={form.id_verification}
                  onChange={handleChange}
                  placeholder={
                    form.id_type === 'kadi_ya_kura' ? 'Enter your Kadi ya Kura number' :
                    form.id_type === 'tin' ? 'Enter your TIN number' :
                    form.id_type === 'nida' ? 'Enter your NIDA number' :
                    form.id_type === 'passport' ? 'Enter your passport number' :
                    'National ID, TIN, Kadi ya Kura, or passport number'
                  }
                />
                <FieldError name="id_verification" />
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> NIDA Number</label>
                <input className="form-control" name="nida_number" value={form.nida_number} onChange={handleChange} placeholder="20-digit NIDA number (e.g. 19950101123456789012)" required />
                <FieldError name="nida_number" />
                <div className="reg-field-hint">Your National Identification Authority number for official verification</div>
              </div>

              <div className="reg-field">
                <label><CreditCard size={13} /> Mobile Money Provider</label>
                <select className="form-control" name="mobile_money_provider" value={form.mobile_money_provider} onChange={handleChange}>
                  <option value="">Select provider...</option>
                  {MOBILE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* LAST STEP: Review & Submit */}
          {isLastStep && (
            <div className="reg-step fade-in">
              <div className="reg-review">
                <h4 className="reg-review-title">Review Your Information</h4>

                <div className="reg-review-section">
                  <div className="reg-review-label">Account</div>
                  <div className="reg-review-grid">
                    <div><span>Name:</span> {form.first_name} {form.last_name}</div>
                    <div><span>Username:</span> {form.username}</div>
                    <div><span>Email:</span> {form.email}</div>
                    <div><span>Password:</span> {'\u2022'.repeat(form.password.length)}</div>
                  </div>
                </div>

                <div className="reg-review-section">
                  <div className="reg-review-label">Contact</div>
                  <div className="reg-review-grid">
                    <div><span>Phone:</span> {form.phone}</div>
                    {form.region && <div><span>Region:</span> {form.region}</div>}
                    {form.mobile_money_provider && (
                      <div><span>Mobile Money:</span> {MOBILE_PROVIDERS.find(p => p.value === form.mobile_money_provider)?.label || form.mobile_money_provider}</div>
                    )}
                  </div>
                </div>

                {role === 'farmer' && (
                  <div className="reg-review-section">
                    <div className="reg-review-label">Farm Details</div>
                    <div className="reg-review-grid">
                      {form.main_crops && <div><span>Crops:</span> {form.main_crops}</div>}
                      {form.farm_size && <div><span>Farm Size:</span> {form.farm_size} acres</div>}
                      {form.preferred_markets && <div><span>Markets:</span> {form.preferred_markets}</div>}
                    </div>
                  </div>
                )}

                {role === 'trader' && (
                  <div className="reg-review-section">
                    <div className="reg-review-label">Trade Profile</div>
                    <div className="reg-review-grid">
                      {form.operating_regions && <div><span>Regions:</span> {form.operating_regions}</div>}
                      {form.crops_of_interest && <div><span>Crops:</span> {form.crops_of_interest}</div>}
                      {form.transport_capacity && (
                        <div><span>Transport:</span> {form.transport_capacity.split(',').map(s => s.trim()).filter(Boolean).map(v => TRANSPORT_OPTIONS.find(t => t.value === v)?.label || v).join(', ')}</div>
                      )}
                    </div>
                  </div>
                )}

                {role === 'agent' && (
                  <div className="reg-review-section">
                    <div className="reg-review-label">Agent Credentials</div>
                    <div className="reg-review-grid">
                      <div><span>Market:</span> {markets.find(m => String(m.id) === String(form.assigned_market))?.name || form.assigned_market}</div>
                      {form.id_verification && <div><span>ID:</span> {form.id_verification}</div>}
                      {form.nida_number && <div><span>NIDA:</span> {form.nida_number}</div>}
                      {form.experience && <div><span>Experience:</span> {form.experience}</div>}
                    </div>
                  </div>
                )}
              </div>

              <div className="reg-terms">
                <label className="reg-checkbox">
                  <input type="checkbox" required />
                  <span>I agree to the Terms of Service and confirm all information is accurate.</span>
                </label>
              </div>
            </div>
          )}

          <div className="reg-nav-buttons">
            {step > 1 && (
              <button type="button" className="btn btn-secondary" onClick={prevStep}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {isLastStep ? (
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ background: roleCfg.color }}>
                <UserPlus size={16} />
                {loading ? 'Creating Account...' : `Create ${roleCfg.title} Account`}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={nextStep} style={{ background: roleCfg.color }}>
                Continue <ChevronRight size={16} />
              </button>
            )}
          </div>
        </form>

        <div className="auth-footer" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setRole(null); setStep(1); setFieldErrors({}); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
          >
            ← Back to role selection
          </button>
          <span>Already have an account? <Link to="/login">Sign In</Link></span>
        </div>
      </div>
    </div>
  );
}
