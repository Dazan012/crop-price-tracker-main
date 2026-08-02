import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { authAPI } from '../services/api';
import { useData } from '../services/DataContext';
import {
  User, MapPin, Sprout, Phone, Save, ArrowLeft, CheckCircle,
  AlertTriangle, Loader, Wheat, Building, Calendar,
} from 'lucide-react';

export default function EditProfile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { regions, crops, markets } = useData();
  const fetchedRef = useRef(false);

  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (!user) return;
    // Pre-fill form from user data
    setForm({
      phone: user.phone || '',
      region: user.region || '',
      district: user.district || '',
      ward: user.ward || '',
      nida_number: user.nida_number || '',
      date_of_birth: user.date_of_birth || '',
      gender: user.gender || '',
      // Farmer fields
      main_crops: user.main_crops || '',
      farm_size: user.farm_size ?? '',
      farm_size_unit: user.farm_size_unit || 'acres',
      preferred_markets: user.preferred_markets || '',
      land_ownership: user.land_ownership || '',
      farming_type: user.farming_type || '',
      cooperative_name: user.cooperative_name || '',
      mobile_money_provider: user.mobile_money_provider || '',
      mobile_money_number: user.mobile_money_number || '',
      avg_harvest_qty: user.avg_harvest_qty ?? '',
      avg_harvest_unit: user.avg_harvest_unit || 'kg',
      // Trader fields
      entity_type: user.entity_type || '',
      business_name: user.business_name || '',
      operating_regions: user.operating_regions || '',
      crops_of_interest: user.crops_of_interest || '',
      transport_capacity: user.transport_capacity || '',
      has_transport: user.has_transport ?? false,
      vehicle_count: user.vehicle_count ?? '',
      vehicle_types: user.vehicle_types || '',
      primary_source_region: user.primary_source_region || '',
      primary_sales_region: user.primary_sales_region || '',
      avg_monthly_volume: user.avg_monthly_volume ?? '',
      volume_unit: user.volume_unit || 'kg',
      trade_types: user.trade_types || '',
      trading_since_year: user.trading_since_year || '',
    });
  }, [user]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    // Build payload — only include non-empty fields
    const payload = {};
    Object.entries(form).forEach(([key, val]) => {
      if (val !== '' && val !== null && val !== undefined) {
        payload[key] = val;
      }
    });

    try {
      await authAPI.updateProfile(payload);
      await refreshUser();
      setSuccess('Profile updated successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to update profile.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const role = user?.role || 'general';
  const isFarmer = role === 'farmer';
  const isTrader = role === 'trader';
  const isAgent = role === 'agent';

  if (!user) return null;

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '0.85rem', padding: 0, marginBottom: 8,
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1><User size={28} /> Edit Profile</h1>
          <p>Update your personal and business information</p>
        </div>
      </div>

      {success && (
        <div className="insight-banner fade-in-up" style={{ marginBottom: 20, borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)' }}>
          <CheckCircle size={18} style={{ color: '#22c55e' }} />
          <span style={{ color: '#22c55e' }}>{success}</span>
        </div>
      )}
      {error && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Personal Information */}
        <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <User size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Personal Information</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label>Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-control" style={{ paddingLeft: 34 }} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255 7XX XXX XXX" />
              </div>
            </div>
            <div className="form-group">
              <label>NIDA Number</label>
              <input className="form-control" value={form.nida_number} onChange={(e) => set('nida_number', e.target.value)} placeholder="20-digit national ID" maxLength={20} />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <div style={{ position: 'relative' }}>
                <Calendar size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-control" type="date" style={{ paddingLeft: 34 }} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select className="form-control" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <MapPin size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Location</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label>Region</label>
              <select className="form-control" value={form.region} onChange={(e) => set('region', e.target.value)}>
                <option value="">Select region</option>
                {(regions || []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>District</label>
              <input className="form-control" value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="Your district" />
            </div>
            <div className="form-group">
              <label>Ward</label>
              <input className="form-control" value={form.ward} onChange={(e) => set('ward', e.target.value)} placeholder="Your ward" />
            </div>
          </div>
        </div>

        {/* Farmer-specific fields */}
        {isFarmer && (
          <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Sprout size={20} style={{ color: 'var(--accent)' }} />
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Farming Details</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              <div className="form-group">
                <label>Main Crops</label>
                <div style={{ position: 'relative' }}>
                  <Wheat size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input className="form-control" style={{ paddingLeft: 34 }} value={form.main_crops} onChange={(e) => set('main_crops', e.target.value)} placeholder="e.g. Maize, Rice, Beans" />
                </div>
              </div>
              <div className="form-group">
                <label>Farm Size</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-control" type="number" value={form.farm_size} onChange={(e) => set('farm_size', e.target.value)} placeholder="e.g. 5" style={{ flex: 1 }} />
                  <select className="form-control" value={form.farm_size_unit} onChange={(e) => set('farm_size_unit', e.target.value)} style={{ width: 100 }}>
                    <option value="acres">Acres</option>
                    <option value="hectares">Hectares</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Land Ownership</label>
                <select className="form-control" value={form.land_ownership} onChange={(e) => set('land_ownership', e.target.value)}>
                  <option value="">Select</option>
                  <option value="owned">Owned</option>
                  <option value="leased">Leased</option>
                  <option value="family">Family Land</option>
                  <option value="rented">Rented</option>
                </select>
              </div>
              <div className="form-group">
                <label>Farming Type</label>
                <select className="form-control" value={form.farming_type} onChange={(e) => set('farming_type', e.target.value)}>
                  <option value="">Select</option>
                  <option value="subsistence">Subsistence</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Cooperative Name</label>
                <input className="form-control" value={form.cooperative_name} onChange={(e) => set('cooperative_name', e.target.value)} placeholder="If member of a cooperative" />
              </div>
              <div className="form-group">
                <label>Preferred Markets</label>
                <input className="form-control" value={form.preferred_markets} onChange={(e) => set('preferred_markets', e.target.value)} placeholder="e.g. Mbeya Main, Uyole" />
              </div>
              <div className="form-group">
                <label>Avg. Harvest Quantity</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-control" type="number" value={form.avg_harvest_qty} onChange={(e) => set('avg_harvest_qty', e.target.value)} placeholder="e.g. 500" style={{ flex: 1 }} />
                  <select className="form-control" value={form.avg_harvest_unit} onChange={(e) => set('avg_harvest_unit', e.target.value)} style={{ width: 80 }}>
                    <option value="kg">kg</option>
                    <option value="tons">tons</option>
                    <option value="bags">bags</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Mobile Money Provider</label>
                <select className="form-control" value={form.mobile_money_provider} onChange={(e) => set('mobile_money_provider', e.target.value)}>
                  <option value="">Select</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="tigopesa">Tigo Pesa</option>
                  <option value="airtel_money">Airtel Money</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mobile Money Number</label>
                <input className="form-control" value={form.mobile_money_number} onChange={(e) => set('mobile_money_number', e.target.value)} placeholder="+255 7XX XXX XXX" />
              </div>
            </div>
          </div>
        )}

        {/* Trader-specific fields */}
        {isTrader && (
          <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Building size={20} style={{ color: 'var(--accent)' }} />
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Trading Details</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              <div className="form-group">
                <label>Business Name</label>
                <input className="form-control" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="Your business name" />
              </div>
              <div className="form-group">
                <label>Entity Type</label>
                <select className="form-control" value={form.entity_type} onChange={(e) => set('entity_type', e.target.value)}>
                  <option value="">Select</option>
                  <option value="individual">Individual</option>
                  <option value="partnership">Partnership</option>
                  <option value="company">Company</option>
                  <option value="cooperative">Cooperative</option>
                </select>
              </div>
              <div className="form-group">
                <label>Crops of Interest</label>
                <input className="form-control" value={form.crops_of_interest} onChange={(e) => set('crops_of_interest', e.target.value)} placeholder="e.g. Maize, Rice, Sunflower" />
              </div>
              <div className="form-group">
                <label>Operating Regions</label>
                <input className="form-control" value={form.operating_regions} onChange={(e) => set('operating_regions', e.target.value)} placeholder="e.g. Mbeya, Songwe" />
              </div>
              <div className="form-group">
                <label>Primary Source Region</label>
                <input className="form-control" value={form.primary_source_region} onChange={(e) => set('primary_source_region', e.target.value)} placeholder="Where you buy from" />
              </div>
              <div className="form-group">
                <label>Primary Sales Region</label>
                <input className="form-control" value={form.primary_sales_region} onChange={(e) => set('primary_sales_region', e.target.value)} placeholder="Where you sell to" />
              </div>
              <div className="form-group">
                <label>Avg. Monthly Volume</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-control" type="number" value={form.avg_monthly_volume} onChange={(e) => set('avg_monthly_volume', e.target.value)} placeholder="e.g. 10000" style={{ flex: 1 }} />
                  <select className="form-control" value={form.volume_unit} onChange={(e) => set('volume_unit', e.target.value)} style={{ width: 80 }}>
                    <option value="kg">kg</option>
                    <option value="tons">tons</option>
                    <option value="bags">bags</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Trade Types</label>
                <select className="form-control" value={form.trade_types} onChange={(e) => set('trade_types', e.target.value)}>
                  <option value="">Select</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="retail">Retail</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="form-group">
                <label>Trading Since (Year)</label>
                <input className="form-control" type="number" value={form.trading_since_year} onChange={(e) => set('trading_since_year', e.target.value)} placeholder="e.g. 2018" min="1980" max="2026" />
              </div>
              <div className="form-group">
                <label>Has Own Transport?</label>
                <select className="form-control" value={form.has_transport ? 'yes' : 'no'} onChange={(e) => set('has_transport', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {form.has_transport && (
                <>
                  <div className="form-group">
                    <label>Vehicle Count</label>
                    <input className="form-control" type="number" value={form.vehicle_count} onChange={(e) => set('vehicle_count', e.target.value)} placeholder="e.g. 2" min="0" />
                  </div>
                  <div className="form-group">
                    <label>Vehicle Types</label>
                    <input className="form-control" value={form.vehicle_types} onChange={(e) => set('vehicle_types', e.target.value)} placeholder="e.g. Truck, Pickup" />
                  </div>
                  <div className="form-group">
                    <label>Transport Capacity (kg)</label>
                    <input className="form-control" type="number" value={form.transport_capacity} onChange={(e) => set('transport_capacity', e.target.value)} placeholder="e.g. 5000" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ padding: '12px 32px', fontSize: '0.95rem', justifyContent: 'center' }}>
            {saving ? <><Loader size={16} className="spin" /> Saving...</> : <><Save size={16} /> Save Changes</>}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
