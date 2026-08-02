"""
Fetch weather forecast from Open-Meteo for all regions and store in DB.

Open-Meteo is free, no API key required. Rate limit: 10K requests/day.

Fetches both daily and hourly data. Integrates with SyncSource/SyncLog.

Usage:
    python manage.py sync_weather
    python manage.py sync_weather --region "Mbeya"
    python manage.py sync_weather --days 3
    python manage.py sync_weather --hourly-only
"""
import os
import json
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

REGION_COORDS = {
    'Dar es Salaam': (-6.7924, 39.2083),
    'Dodoma': (-6.1622, 35.7516),
    'Arusha': (-3.3869, 36.6830),
    'Mwanza': (-2.5164, 32.9333),
    'Mbeya': (-8.8950, 33.4300),
    'Tanga': (-5.0689, 39.1023),
    'Morogoro': (-6.8278, 37.6595),
    'Iringa': (-7.7667, 35.7000),
    'Mtwara': (-10.2719, 40.1836),
    'Kigoma': (-4.8820, 29.6267),
    'Zanzibar': (-6.1659, 39.2026),
    'Tabora': (-5.0422, 32.8197),
    'Manyara': (-4.3158, 36.9543),
    'Singida': (-4.8159, 34.7438),
    'Ruvuma': (-10.6875, 36.0497),
    'Rukwa': (-8.0000, 31.6667),
    'Kagera': (-1.8333, 31.5000),
    'Shinyanga': (-3.6639, 33.4211),
    'Simiyu': (-2.9667, 34.0000),
    'Geita': (-2.8667, 32.1667),
    'Katavi': (-6.5000, 31.0833),
    'Njombe': (-9.3333, 34.7667),
    'Songwe': (-8.5000, 32.8333),
    'Pwani': (-7.0000, 39.0000),
    'Lindi': (-9.9969, 39.7167),
    'Kilimanjaro': (-3.0667, 37.3500),
    'Mara': (-1.7667, 34.4500),
}

OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'

DAILY_PARAMS = (
    'temperature_2m_max,temperature_2m_min,'
    'precipitation_sum,precipitation_probability_max,'
    'wind_speed_10m_max,wind_direction_10m_dominant,'
    'weather_code'
)

HOURLY_PARAMS = (
    'temperature_2m,precipitation,precipitation_probability,'
    'relative_humidity_2m,wind_speed_10m,wind_direction_10m,'
    'surface_pressure,apparent_temperature,uv_index,'
    'cloud_cover,visibility,weather_code'
)

CURRENT_PARAMS = (
    'relative_humidity_2m,precipitation,weather_code,'
    'apparent_temperature,cloud_cover,surface_pressure,'
    'wind_speed_10m,wind_direction_10m'
)


class Command(BaseCommand):
    help = 'Fetch weather forecast from Open-Meteo and store locally'

    def add_arguments(self, parser):
        parser.add_argument('--region', help='Sync weather for a specific region name only')
        parser.add_argument('--days', type=int, default=5, help='Number of forecast days (max 16)')
        parser.add_argument('--hourly-only', action='store_true', help='Only sync hourly data')
        parser.add_argument('--daily-only', action='store_true', help='Only sync daily data')

    def handle(self, *args, **options):
        from prices.models import Region, WeatherData, HourlyWeatherData

        region_filter = options.get('region')
        forecast_days = min(options.get('days', 5), 16)
        hourly_only = options.get('hourly_only', False)
        daily_only = options.get('daily_only', False)

        regions = Region.objects.all()
        if region_filter:
            regions = regions.filter(name__iexact=region_filter)

        norm_map = {k.lower(): v for k, v in REGION_COORDS.items()}
        daily_synced = 0
        hourly_synced = 0
        skipped = 0
        errors = 0

        # Use SyncSource if available
        source = None
        log = None
        try:
            from prices.models import SyncSource, SyncLog
            source, _ = SyncSource.objects.get_or_create(
                slug='open-meteo',
                defaults={
                    'name': 'Open-Meteo Weather API',
                    'scraper_command': 'sync_weather',
                    'update_interval_seconds': 3600,
                    'is_active': True,
                }
            )
            log = SyncLog.objects.create(source=source)
        except Exception:
            pass

        for region in regions:
            coords = norm_map.get(region.name.lower()) or REGION_COORDS.get(region.name)
            if not coords:
                self.stdout.write(f'  SKIP {region.name}: no coordinates mapped')
                skipped += 1
                continue

            try:
                if not hourly_only:
                    dc = self._sync_daily(region, coords, forecast_days)
                    daily_synced += dc
                    self.stdout.write(f'  OK   {region.name}: {dc} daily records')
                if not daily_only:
                    hc = self._sync_hourly(region, coords, forecast_days)
                    hourly_synced += hc
                    self.stdout.write(f'  OK   {region.name}: {hc} hourly records')
            except Exception as e:
                self.stderr.write(f'  FAIL {region.name}: {e}')
                errors += 1

        # Update SyncSource
        if source and log:
            log.finished_at = timezone.now()
            log.status = 'success' if errors == 0 else 'partial'
            log.items_found = daily_synced + hourly_synced
            log.items_imported = daily_synced + hourly_synced
            log.save()
            source.last_sync_at = timezone.now()
            source.last_status = log.status
            source.last_items_found = daily_synced + hourly_synced
            source.last_items_imported = daily_synced + hourly_synced
            source.save()

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {daily_synced} daily + {hourly_synced} hourly synced, '
            f'{skipped} skipped, {errors} errors.'))

    def _sync_daily(self, region, coords, forecast_days):
        from prices.models import WeatherData

        daily_vars = DAILY_PARAMS.replace(' ', '').split(',')
        current_vars = CURRENT_PARAMS.replace(' ', '').split(',')
        param_parts = [
            f'latitude={coords[0]}',
            f'longitude={coords[1]}',
            f'timezone=auto',
            f'forecast_days={forecast_days}',
        ]
        for v in daily_vars:
            param_parts.append(f'daily={v}')
        for v in current_vars:
            param_parts.append(f'current={v}')
        url = f'{OPEN_METEO_BASE}?{"&".join(param_parts)}'

        req = urllib.request.Request(url, headers={'User-Agent': 'SmartCrops/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        daily = data.get('daily', {})
        dates = daily.get('time', [])
        t_max = daily.get('temperature_2m_max', [])
        t_min = daily.get('temperature_2m_min', [])
        precip = daily.get('precipitation_sum', [])
        precip_prob = daily.get('precipitation_probability_max', [])
        wind = daily.get('wind_speed_10m_max', [])
        wind_dir = daily.get('wind_direction_10m_dominant', [])
        daily_wcodes = daily.get('weather_code', [])

        current = data.get('current', {})
        current_humidity = current.get('relative_humidity_2m')
        current_precip = current.get('precipitation')
        current_app_temp = current.get('apparent_temperature')
        current_cloud = current.get('cloud_cover')
        current_pressure = current.get('surface_pressure')
        current_wind_speed = current.get('wind_speed_10m')
        current_wind_dir = current.get('wind_direction_10m')

        today = date.today()
        count = 0
        for i in range(len(dates)):
            day_date = dates[i]
            if isinstance(day_date, str):
                day_date = date.fromisoformat(day_date)

            defaults = {
                'temp_max': t_max[i] if i < len(t_max) else None,
                'temp_min': t_min[i] if i < len(t_min) else None,
                'precipitation': precip[i] if i < len(precip) else None,
                'precipitation_probability': precip_prob[i] if i < len(precip_prob) else None,
                'wind_speed': wind[i] if i < len(wind) else None,
                'wind_direction': wind_dir[i] if i < len(wind_dir) else None,
                'weather_code': daily_wcodes[i] if i < len(daily_wcodes) else None,
            }

            if day_date == today:
                defaults['humidity'] = current_humidity
                defaults['pressure'] = current_pressure
                defaults['dew_point'] = None
                defaults['apparent_temp'] = current_app_temp
                defaults['uv_index'] = None
                defaults['cloud_cover'] = current_cloud
                defaults['visibility'] = None
                defaults['weather_code'] = current.get('weather_code') or defaults['weather_code']
                if defaults['precipitation'] is None and current_precip is not None:
                    defaults['precipitation'] = current_precip

            _, created = WeatherData.objects.update_or_create(
                region=region,
                date=day_date,
                defaults=defaults,
            )
            if created:
                count += 1

        if not dates:
            day_date = today
            defaults = {
                'temp_max': None, 'temp_min': None,
                'precipitation': current_precip,
                'humidity': current_humidity,
                'wind_speed': current_wind_speed,
                'wind_direction': current_wind_dir,
                'pressure': current_pressure,
                'apparent_temp': current_app_temp,
                'cloud_cover': current_cloud,
                'weather_code': current.get('weather_code'),
            }
            _, created = WeatherData.objects.update_or_create(
                region=region, date=day_date, defaults=defaults,
            )
            count = 1 if created else 0

        return max(count, len(dates) if dates else 0)

    def _sync_hourly(self, region, coords, forecast_days):
        from prices.models import HourlyWeatherData

        hourly_vars = HOURLY_PARAMS.replace(' ', '').split(',')
        param_parts = [
            f'latitude={coords[0]}',
            f'longitude={coords[1]}',
            f'timezone=auto',
            f'forecast_days={forecast_days}',
        ]
        for v in hourly_vars:
            param_parts.append(f'hourly={v}')
        url = f'{OPEN_METEO_BASE}?{"&".join(param_parts)}'

        req = urllib.request.Request(url, headers={'User-Agent': 'SmartCrops/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        hourly = data.get('hourly', {})
        times = hourly.get('time', [])
        temps = hourly.get('temperature_2m', [])
        precip = hourly.get('precipitation', [])
        prob = hourly.get('precipitation_probability', [])
        hum = hourly.get('relative_humidity_2m', [])
        wind = hourly.get('wind_speed_10m', [])
        wind_dir = hourly.get('wind_direction_10m', [])
        pressure = hourly.get('surface_pressure', [])
        app_temp = hourly.get('apparent_temperature', [])
        uv = hourly.get('uv_index', [])
        cloud = hourly.get('cloud_cover', [])
        vis = hourly.get('visibility', [])
        wcode = hourly.get('weather_code', [])

        count = 0
        for i in range(len(times)):
            ts_str = times[i]
            try:
                ts = datetime.fromisoformat(ts_str)
            except (ValueError, TypeError):
                continue

            defaults = {
                'temperature': temps[i] if i < len(temps) else None,
                'precipitation': precip[i] if i < len(precip) else None,
                'precipitation_probability': prob[i] if i < len(prob) else None,
                'humidity': hum[i] if i < len(hum) else None,
                'wind_speed': wind[i] if i < len(wind) else None,
                'wind_direction': wind_dir[i] if i < len(wind_dir) else None,
                'pressure': pressure[i] if i < len(pressure) else None,
                'apparent_temp': app_temp[i] if i < len(app_temp) else None,
                'uv_index': uv[i] if i < len(uv) else None,
                'cloud_cover': cloud[i] if i < len(cloud) else None,
                'visibility': vis[i] if i < len(vis) else None,
                'weather_code': wcode[i] if i < len(wcode) else None,
            }

            _, created = HourlyWeatherData.objects.update_or_create(
                region=region,
                timestamp=ts,
                defaults=defaults,
            )
            if created:
                count += 1

        return count
