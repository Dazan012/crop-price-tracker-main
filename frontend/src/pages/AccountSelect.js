import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import { Sprout, TrendingUp, MapPin, Shield, BarChart3, PlusCircle, AlertTriangle, ClipboardCheck } from 'lucide-react';

export default function AccountSelect() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" />;

  const accounts = [
    {
      role: 'farmer',
      icon: <Sprout size={32} />,
      title: 'Farmer',
      subtitle: 'Smallholder & Commercial',
      description: 'Track market prices for your crops, submit prices from your local market, and get insights on when and where to sell.',
      color: '#10b981',
      features: [
        'View current market prices for all crops',
        'Submit prices from your local market',
        'Compare prices across regions',
        'Get price trend alerts',
      ],
      path: '/prices',
    },
    {
      role: 'trader',
      icon: <TrendingUp size={32} />,
      title: 'Trader',
      subtitle: 'Crop Buyer & Seller',
      description: 'Access comprehensive market data, identify arbitrage opportunities, and track price movements for profitable trading decisions.',
      color: '#3b82f6',
      features: [
        'Full market analytics dashboard',
        'Price trend analysis & forecasting',
        'Submit and review prices',
        'Market depth visualization',
      ],
      path: '/dashboard',
    },
    {
      role: 'agent',
      icon: <MapPin size={32} />,
      title: 'Market Agent',
      subtitle: 'Official Data Collector',
      description: 'Official market data collector with authority to review flagged prices, manage submissions, and ensure data quality.',
      color: '#f59e0b',
      features: [
        'All trader features plus:',
        'Review & approve flagged prices',
        'Anomaly detection dashboard',
        'Data quality management',
      ],
      path: '/reviews',
    },
  ];

  return (
    <div className="page">
      <div className="page-header fade-in" style={{ textAlign: 'center', display: 'block' }}>
        <h1 style={{ justifyContent: 'center' }}>
          <Shield size={28} /> Select Your Role
        </h1>
        <p style={{ maxWidth: 500, margin: '8px auto 0' }}>
          Choose your account type to access the features tailored for your needs
        </p>
      </div>

      <div className="grid-3" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {accounts.map((account, i) => (
          <div
            key={i}
            className="glass-card account-card fade-in-up"
            onClick={() => navigate(account.path)}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="card-icon" style={{ background: `${account.color}15`, color: account.color }}>
              {account.icon}
            </div>
            <h3>{account.title}</h3>
            <p style={{ fontSize: '0.8rem', color: account.color, fontWeight: 500 }}>{account.subtitle}</p>
            <p style={{ marginTop: 8 }}>{account.description}</p>
            <ul className="card-features">
              {account.features.map((f, j) => (
                <li key={j}>{f}</li>
              ))}
            </ul>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
              Continue as {account.title} →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
