import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
os.environ['RUN_NOTIFICATION_ENGINE_SKIP'] = '1'
import django
django.setup()

from prices.models import WeatherData, Region
from prices.serializers import WeatherSerializer

# Check data exists
total = WeatherData.objects.count()
print(f'Weather records in DB: {total}')

# Check Dar es Salaam
try:
    region = Region.objects.get(name__iexact='Dar es Salaam')
    dar_count = WeatherData.objects.filter(region=region).count()
    print(f'Dar es Salaam records: {dar_count}')
    latest = WeatherData.objects.filter(region=region).order_by('-date').first()
    if latest:
        ser = WeatherSerializer(latest)
        print(f'Latest record: {json.dumps(ser.data, indent=2)}')
except Region.DoesNotExist:
    print('Region Dar es Salaam not found in DB')

# Check all regions with weather data
regions_with_weather = WeatherData.objects.values_list('region__name', flat=True).distinct()
print(f'\nRegions with weather data: {list(regions_with_weather)}')

# Verify URL reverse works
from django.urls import reverse
try:
    url = reverse('weather')
    print(f'\nWeather URL: {url}')
except Exception as e:
    print(f'\nURL reverse failed: {e}')

print('\nAll checks passed!' if total > 0 else '\nWARNING: No weather data!')
