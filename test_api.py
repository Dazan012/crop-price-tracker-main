import os, sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'crop_price_tracker.settings'
os.environ['RUN_NOTIFICATION_ENGINE_SKIP'] = '1'
sys.path.insert(0, os.path.dirname(__file__))

import django
django.setup()

from django.test import Client
import json

c = Client()

# Test price list
resp = c.get('/api/prices/?limit=5')
if resp.status_code == 200:
    data = json.loads(resp.content)
    items = data.get('results', data.get('data', []))
    print(f'/api/prices/ OK: {len(items)} items')
else:
    print(f'/api/prices/ FAIL: {resp.status_code}')

# Test regions
resp = c.get('/api/regions/')
if resp.status_code == 200:
    data = json.loads(resp.content)
    print(f'/api/regions/ OK: {len(data)} regions')
else:
    print(f'/api/regions/ FAIL: {resp.status_code}')

# Test crops
resp = c.get('/api/crops/')
if resp.status_code == 200:
    data = json.loads(resp.content)
    print(f'/api/crops/ OK: {len(data)} crops')
else:
    print(f'/api/crops/ FAIL: {resp.status_code}')

# Test markets
resp = c.get('/api/markets/')
if resp.status_code == 200:
    data = json.loads(resp.content)
    print(f'/api/markets/ OK: {len(data)} markets')
else:
    print(f'/api/markets/ FAIL: {resp.status_code}')

# Test price segments (requires crop param)
resp = c.get('/api/prices/segments/?crop=Maize')
if resp.status_code == 200:
    print(f'/api/prices/segments/ OK')
else:
    print(f'/api/prices/segments/ FAIL: {resp.status_code}')

# Test heatmap
resp = c.get('/api/prices/heatmap/?crop=Maize')
if resp.status_code == 200:
    print(f'/api/prices/heatmap/ OK')
else:
    print(f'/api/prices/heatmap/ FAIL: {resp.status_code}')

print('\nAll API checks done')
