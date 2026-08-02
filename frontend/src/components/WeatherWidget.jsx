import { useState, useEffect } from 'react';
import { fetchWeather, fetchHourlyWeather, getWeatherAlert, getWeatherIcon, getUVLabel, getWindDirection } from '../services/WeatherService';
import { CloudSun, Droplets, Wind, Thermometer, AlertTriangle, MapPin, Sun, Eye, Gauge, Cloud, Umbrella, CloudRain, Snowflake, CloudLightning } from 'lucide-react';

function StatBox({ icon, value, label }) {
  return (
    <div style={{ padding: '10px', borderRadius: 8, background: 'var(--bg-glass)', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        {icon}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value ?? '--'}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function WeatherWidget({ region, compact = false, onRegionChange }) {
  const [weather, setWeather] = useState(null);
  const [hourlyData, setHourlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!region) return;
    setLoading(true);
    Promise.all([
      fetchWeather(region),
      fetchHourlyWeather(region, 12),
    ]).then(([weatherData, hourly]) => {
      setWeather(weatherData);
      setHourlyData(hourly);
      setAlert(weatherData ? getWeatherAlert(weatherData) : null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [region]);

  if (!region) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <CloudSun size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
        <p style={{ margin: 0 }}>Select a region to see weather</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
        Loading weather...
      </div>
    );
  }

  if (!weather) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        Weather data unavailable
      </div>
    );
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <span style={{ fontSize: '2rem', lineHeight: 1 }}>{weather.weatherIcon}</span>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {weather.temperature}°C
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {weather.weatherLabel}
            {weather.feelsLike != null && ` · Feels ${weather.feelsLike}°C`}
          </div>
        </div>
        {alert && (
          <span style={{ marginLeft: 'auto', color: alert.level === 'danger' ? 'var(--danger)' : 'var(--warning)' }}>
            <AlertTriangle size={16} />
          </span>
        )}
      </div>
    );
  }

  const alertColors = {
    danger: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' },
    caution: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', color: '#3b82f6' },
  };

  const WeatherIcon = weather.iconName ? ({ className }) => {
    const icons = { Sun, CloudSun, Cloud, CloudFog: Cloud, CloudDrizzle: Cloud, CloudRain: CloudRain, Snowflake: Snowflake, CloudLightning: CloudLightning };
    const Icon = icons[weather.iconName] || CloudSun;
    return <Icon className={className} />;
  } : null;

  return (
    <div>
      {/* Current weather */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <span style={{ fontSize: '3rem', lineHeight: 1 }}>{weather.weatherIcon}</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {weather.temperature}°C
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {weather.feelsLike != null ? `Feels ${weather.feelsLike}°C` : ''}
              {weather.tempMin != null && ` / ${weather.tempMin}°C`}
            </span>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>
            {weather.weatherLabel}
            {weather.precipitationProbability != null && ` · ${weather.precipitationProbability}% rain`}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MapPin size={11} /> {weather.region}
          </div>
        </div>
      </div>

      {/* Stats grid - 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <StatBox icon={<Droplets size={14} color="#3b82f6" />} value={`${weather.humidity ?? '--'}%`} label="Humidity" />
        <StatBox icon={<Wind size={14} color="#06b6d4" />} value={weather.windSpeed != null ? `${weather.windSpeed} km/h` : '--'} label={weather.windDirectionLabel ? `Wind ${weather.windDirectionLabel}` : 'Wind'} />
        <StatBox icon={<Thermometer size={14} color="#f59e0b" />} value={weather.precipitation != null ? `${weather.precipitation} mm` : '0 mm'} label="Precip." />
      </div>

      {/* Additional stats - 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <StatBox icon={<Gauge size={14} color="#8b5cf6" />} value={weather.pressure != null ? `${Math.round(weather.pressure)} hPa` : '--'} label="Pressure" />
        <StatBox icon={<Sun size={14} color="#eab308" />} value={weather.uvLabel ?? '--'} label={weather.uvIndex != null ? `UV ${weather.uvIndex}` : 'UV Index'} />
        <StatBox icon={<Eye size={14} color="#14b8a6" />} value={weather.visibility != null ? `${weather.visibility} km` : '--'} label="Visibility" />
      </div>

      {/* Soil & extra row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <StatBox icon={<Thermometer size={14} color="#dc2626" />} value={weather.soilTemp0cm != null ? `${weather.soilTemp0cm}°C` : '--'} label="Soil Temp" />
        <StatBox icon={<Droplets size={14} color="#2563eb" />} value={weather.soilMoistureLabel ?? '--'} label={weather.soilMoisture0_1cm != null ? `Soil ${weather.soilMoisture0_1cm}` : 'Soil Moisture'} />
        <StatBox icon={<Cloud size={14} color="#94a3b8" />} value={weather.cloudCover != null ? `${weather.cloudCover}%` : '--'} label="Cloud Cover" />
      </div>

      {/* Hourly forecast */}
      {hourlyData.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Hourly Forecast
          </div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
            {hourlyData.map((h, i) => {
              const time = new Date(h.timestamp);
              const label = i === 0 ? 'Now' : time.toLocaleTimeString('en', { hour: '2-digit', hour12: true });
              return (
                <div key={h.timestamp} style={{
                  flex: '0 0 auto', padding: '8px 6px', borderRadius: 8, minWidth: 60,
                  background: i === 0 ? 'rgba(0,212,170,0.08)' : 'var(--bg-glass)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>{h.weatherIcon || '☁️'}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {h.temperature != null ? `${h.temperature}°` : '--'}
                  </div>
                  {h.precipitationProbability != null && (
                    <div style={{ fontSize: '0.6rem', color: '#3b82f6', marginTop: 2 }}>
                      {h.precipitationProbability}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5-day forecast */}
      {weather.daily && weather.daily.length > 0 && (
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            5-Day Forecast
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {weather.daily.map((day, i) => {
              const dayName = i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en', { weekday: 'short' });
              return (
                <div key={day.date} style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8,
                  background: i === 0 ? 'rgba(0,212,170,0.08)' : 'var(--bg-glass)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {dayName}
                  </div>
                  <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>{day.weatherIcon}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {day.max != null ? `${day.max}°` : '--'}/{day.min != null ? `${day.min}°` : '--'}
                  </div>
                  {day.precipitationProbability != null && (
                    <div style={{ fontSize: '0.6rem', color: '#3b82f6', marginTop: 2 }}>
                      <Umbrella size={10} style={{ display: 'inline', marginRight: 2 }} />
                      {day.precipitationProbability}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weather alert */}
      {alert && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 8,
          background: alertColors[alert.level]?.bg || 'rgba(245,158,11,0.1)',
          border: `1px solid ${alertColors[alert.level]?.border || 'rgba(245,158,11,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: '0.82rem', color: alertColors[alert.level]?.color || '#f59e0b',
        }}>
          <AlertTriangle size={16} />
          {alert.message}
        </div>
      )}
    </div>
  );
}
