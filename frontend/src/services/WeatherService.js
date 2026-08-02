import { weatherAPI } from './api';

const LUCIDE_ICONS = {
  sun: 'Sun',
  'cloud-sun': 'CloudSun',
  cloud: 'Cloud',
  fog: 'CloudFog',
  'cloud-drizzle': 'CloudDrizzle',
  'cloud-rain': 'CloudRain',
  snowflake: 'Snowflake',
  'cloud-lightning': 'CloudLightning',
};

export const WEATHER_CODE_MAP = {
  0: { label: 'Clear', icon: 'sun' },
  1: { label: 'Mainly Clear', icon: 'sun' },
  2: { label: 'Partly Cloudy', icon: 'cloud-sun' },
  3: { label: 'Overcast', icon: 'cloud' },
  45: { label: 'Foggy', icon: 'fog' },
  48: { label: 'Depositing rime fog', icon: 'fog' },
  51: { label: 'Light Drizzle', icon: 'cloud-drizzle' },
  53: { label: 'Moderate Drizzle', icon: 'cloud-drizzle' },
  55: { label: 'Dense Drizzle', icon: 'cloud-rain' },
  56: { label: 'Light Freezing Drizzle', icon: 'cloud-drizzle' },
  57: { label: 'Dense Freezing Drizzle', icon: 'cloud-rain' },
  61: { label: 'Slight Rain', icon: 'cloud-rain' },
  63: { label: 'Moderate Rain', icon: 'cloud-rain' },
  65: { label: 'Heavy Rain', icon: 'cloud-rain' },
  66: { label: 'Light Freezing Rain', icon: 'cloud-rain' },
  67: { label: 'Heavy Freezing Rain', icon: 'cloud-rain' },
  71: { label: 'Slight Snow', icon: 'snowflake' },
  73: { label: 'Moderate Snow', icon: 'snowflake' },
  75: { label: 'Heavy Snow', icon: 'snowflake' },
  77: { label: 'Snow Grains', icon: 'snowflake' },
  80: { label: 'Slight Rain Showers', icon: 'cloud-rain' },
  81: { label: 'Moderate Rain Showers', icon: 'cloud-rain' },
  82: { label: 'Violent Rain Showers', icon: 'cloud-rain' },
  85: { label: 'Slight Snow Showers', icon: 'snowflake' },
  86: { label: 'Heavy Snow Showers', icon: 'snowflake' },
  95: { label: 'Thunderstorm', icon: 'cloud-lightning' },
  96: { label: 'Thunderstorm with slight hail', icon: 'cloud-lightning' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'cloud-lightning' },
};

const WEATHER_EMOJI_MAP = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  56: '🌧️',
  57: '🌧️',
  61: '🌦️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '❄️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '🌧️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

export function getWeatherEmoji(weatherCode) {
  return WEATHER_EMOJI_MAP[weatherCode] || '☁️';
}

export function getWeatherIcon(weatherCode) {
  const wc = WEATHER_CODE_MAP[weatherCode];
  const iconName = wc?.icon || 'cloud';
  return LUCIDE_ICONS[iconName] || 'Cloud';
}

export function getWeatherLabel(weatherCode) {
  if (weatherCode == null) return 'No data';
  return WEATHER_CODE_MAP[weatherCode]?.label || 'Unknown';
}

export function getUVLabel(uv) {
  if (uv == null) return null;
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

export function getSoilMoistureLabel(moisture) {
  if (moisture == null) return null;
  if (moisture < 0.15) return 'Dry';
  if (moisture < 0.30) return 'Moist';
  if (moisture < 0.50) return 'Wet';
  return 'Saturated';
}

export function getWindDirection(degrees) {
  if (degrees == null) return null;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(degrees / 45) % 8];
}

export async function fetchWeather(regionName) {
  if (!regionName) return null;

  try {
    const res = await weatherAPI.list({ region: regionName });
    if (!res.data || res.data.length === 0) return null;

    const records = res.data;
    const current = records[0];

    const code = current.weather_code;

    const daily = records.map((r) => ({
      date: r.date,
      max: r.temp_max ? Math.round(r.temp_max) : null,
      min: r.temp_min ? Math.round(r.temp_min) : null,
      precipitation: r.precipitation,
      precipitationProbability: r.precipitation_probability,
      weatherCode: r.weather_code,
      weatherLabel: r.weather_label || getWeatherLabel(r.weather_code),
      weatherIcon: getWeatherEmoji(r.weather_code),
      iconName: getWeatherIcon(r.weather_code),
      uvIndex: r.uv_index,
      cloudCover: r.cloud_cover,
    }));

    return {
      region: current.region_name || regionName,
      temperature: current.temp_max ? Math.round(current.temp_max) : null,
      tempMin: current.temp_min ? Math.round(current.temp_min) : null,
      feelsLike: current.apparent_temp ? Math.round(current.apparent_temp) : null,
      humidity: current.humidity ? Math.round(current.humidity) : null,
      precipitation: current.precipitation,
      precipitationProbability: current.precipitation_probability,
      windSpeed: current.wind_speed ? Math.round(current.wind_speed) : null,
      windDirection: current.wind_direction,
      windDirectionLabel: getWindDirection(current.wind_direction),
      pressure: current.pressure,
      uvIndex: current.uv_index,
      uvLabel: getUVLabel(current.uv_index),
      cloudCover: current.cloud_cover,
      visibility: current.visibility,
      dewPoint: current.dew_point,
      soilTemp0cm: current.soil_temp_0cm,
      soilMoisture0_1cm: current.soil_moisture_0_1cm,
      soilMoistureLabel: getSoilMoistureLabel(current.soil_moisture_0_1cm),
      weatherCode: code,
      weatherLabel: current.weather_label || getWeatherLabel(code),
      weatherIcon: getWeatherEmoji(code),
      iconName: getWeatherIcon(code),
      daily,
    };
  } catch {
    return null;
  }
}

export async function fetchHourlyWeather(regionName, hours = 24) {
  if (!regionName) return [];

  try {
    const res = await weatherAPI.hourly({ region: regionName, hours });
    if (!res.data) return [];

    return res.data.map((h) => ({
      timestamp: h.timestamp,
      temperature: h.temperature ? Math.round(h.temperature) : null,
      precipitation: h.precipitation,
      precipitationProbability: h.precipitation_probability,
      humidity: h.humidity ? Math.round(h.humidity) : null,
      windSpeed: h.wind_speed ? Math.round(h.wind_speed) : null,
      windDirection: h.wind_direction,
      windDirectionLabel: getWindDirection(h.wind_direction),
      pressure: h.pressure,
      apparentTemp: h.apparent_temp ? Math.round(h.apparent_temp) : null,
      uvIndex: h.uv_index,
      uvLabel: getUVLabel(h.uv_index),
      cloudCover: h.cloud_cover,
      visibility: h.visibility,
      weatherCode: h.weather_code,
      weatherLabel: h.weather_label || getWeatherLabel(h.weather_code),
      weatherIcon: getWeatherEmoji(h.weather_code),
      iconName: getWeatherIcon(h.weather_code),
    }));
  } catch {
    return [];
  }
}

export async function fetchCropWeather(regionName, cropId) {
  try {
    const params = { region: regionName };
    if (cropId) params.crop = cropId;
    const res = await weatherAPI.cropWeather(params);
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchWeatherForRegions(regions) {
  const results = await Promise.allSettled(
    regions.map(r => fetchWeather(r.name || r))
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

export function getWeatherAlert(weather) {
  if (!weather) return null;
  const code = weather.weatherCode;
  if (code >= 95) return { level: 'danger', message: 'Thunderstorm warning in your area' };
  if (code >= 80) return { level: 'warning', message: 'Heavy rain expected' };
  if (code >= 65) return { level: 'warning', message: 'Heavy rainfall — may affect market access' };
  if (weather.temperature > 38) return { level: 'warning', message: 'Extreme heat — take precautions for crop transport' };
  if (weather.windSpeed > 50) return { level: 'caution', message: 'Strong winds — secure farm equipment' };
  return null;
}
