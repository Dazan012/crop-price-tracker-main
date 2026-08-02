import json
import os
from datetime import datetime, date
from django.core.management.base import BaseCommand
from django.db import transaction
from prices.models import Region, Market, Crop, PriceEntry

TMX_FIREBASE_URL = (
    "https://firestore.googleapis.com/v1/projects/"
    "tmx-automation-564bd/databases/(default)/documents/sheetsData"
)

REGION_ZONE_MAP = {
    'Arusha': 'Northern', 'Dar Es Salaam': 'Coastal', 'Dodoma': 'Central',
    'Geita': 'Lake', 'Iringa': 'Southern Highlands', 'Kagera': 'Lake',
    'Katavi': 'Western', 'Kigoma': 'Western', 'Kilimanjaro': 'Northern',
    'Lindi': 'Southern', 'Manyara': 'Northern', 'Mara': 'Lake',
    'Mbeya': 'Southern Highlands', 'Morogoro': 'Coastal', 'Mtwara': 'Southern',
    'Mwanza': 'Lake', 'Njombe': 'Southern Highlands', 'Pwani': 'Coastal',
    'Rukwa': 'Western', 'Ruvuma': 'Southern', 'Shinyanga': 'Lake',
    'Simiyu': 'Lake', 'Singida': 'Central', 'Tabora': 'Western',
    'Tanga': 'Northern',
}

TMX_CROP_MAP = {
    'Sesame Seeds': ('cash', 'kg'),
    'Greengrams': ('legume', 'kg'),
    'Pigeon Peas': ('legume', 'kg'),
    'Soy Beans': ('legume', 'kg'),
    'Cocoa': ('cash', 'kg'),
    'Cashew Nuts': ('cash', 'kg'),
    'Chick Peas': ('legume', 'kg'),
    'Coffee-Robusta Clean Certified': ('cash', 'kg'),
    'Coffee-Robusta Certified': ('cash', 'kg'),
    'Coffee-Robusta': ('cash', 'kg'),
    'Coffee-Robusta Clean': ('cash', 'kg'),
    'Coffee-Arabica Clean Certified': ('cash', 'kg'),
    'Coffee-Arabica Certified': ('cash', 'kg'),
    'Coffee-Arabica': ('cash', 'kg'),
    'Coffee': ('cash', 'kg'),
}

RAW_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'data', 'tmx_raw_data.json'
)


class Command(BaseCommand):
    help = 'Seed TMX (Tanzania Mercantile Exchange) commodity prices into the database'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be imported without saving')
        parser.add_argument('--local', type=str,
                            help='Path to local TMX JSON file instead of fetching from Firebase')
        parser.add_argument('--clear', action='store_true',
                            help='Clear existing TMX price entries before seeding')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        local_path = options['local']
        should_clear = options['clear']

        data = self.fetch_tmx_data(local_path)
        if not data:
            self.stdout.write(self.style.ERROR('No data to import'))
            return

        documents = data.get('documents', [])
        self.stdout.write(f'Found {len(documents)} TMX entries')

        entries = self.parse_documents(documents)
        self.stdout.write(f'Parsed {len(entries)} commodity-region records')

        if should_clear and not dry_run:
            tmx_markets = Market.objects.filter(name='Tmx Exchange')
            if tmx_markets.exists():
                deleted = PriceEntry.objects.filter(market__in=tmx_markets).delete()[0]
                self.stdout.write(f'Cleared {deleted} existing TMX price entries')

        stats = self.seed_database(entries, dry_run)

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\nDry run — would create: {stats["crops"]} crops, '
                f'{stats["regions"]} regions, {stats["markets"]} markets, '
                f'{stats["current_prices"]} current prices, '
                f'{stats["historical_prices"]} historical prices'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nDone. Created: {stats["crops"]} crops, '
                f'{stats["regions"]} regions, {stats["markets"]} markets, '
                f'{stats["current_prices"]} current prices, '
                f'{stats["historical_prices"]} historical prices'
            ))

        self.print_suggestion()

    def fetch_tmx_data(self, local_path=None):
        if local_path and os.path.exists(local_path):
            self.stdout.write(f'Loading local file: {local_path}')
            with open(local_path, 'r', encoding='utf-8') as f:
                return json.load(f)

        self.stdout.write('Fetching TMX data from Firebase...')
        try:
            import urllib.request
            req = urllib.request.Request(TMX_FIREBASE_URL)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to fetch from Firebase: {e}'))
            return None

        os.makedirs(os.path.dirname(RAW_DATA_PATH), exist_ok=True)
        with open(RAW_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        self.stdout.write(f'Raw data saved to {RAW_DATA_PATH}')

        return data

    def parse_documents(self, documents):
        entries = []
        for doc in documents:
            fields = doc.get('fields', {})
            entry = {}

            for key, value in fields.items():
                if 'stringValue' in value:
                    entry[key] = value['stringValue']
                elif 'integerValue' in value:
                    entry[key] = int(value['integerValue'])
                elif 'arrayValue' in value:
                    entry[key] = [
                        list(v.values())[0] for v in value['arrayValue'].get('values', [])
                    ]
                    entry[key] = [
                        int(v) if isinstance(v, str) and v.lstrip('-').isdigit() else v
                        for v in entry[key]
                    ]

            if 'Commodity' in entry and 'Location' in entry:
                entries.append(entry)

        return entries

    def seed_database(self, entries, dry_run=False):
        unique_crop_names = {e['Commodity'].strip().title() for e in entries if 'Commodity' in e}
        unique_region_names = {e['Location'].strip().title() for e in entries if 'Location' in e}

        crop_map = {}
        region_map = {}
        market_map = {}

        if not dry_run:
            with transaction.atomic():
                for name in unique_crop_names:
                    info = TMX_CROP_MAP.get(name, ('cash', 'kg'))
                    crop, _ = Crop.objects.get_or_create(
                        name=name,
                        defaults={'category': info[0], 'unit': info[1]}
                    )
                    crop_map[name] = crop

                for name in unique_region_names:
                    zone = REGION_ZONE_MAP.get(name, '')
                    region, _ = Region.objects.get_or_create(
                        name=name,
                        defaults={'zone': zone}
                    )
                    region_map[name] = region

                for name, region in region_map.items():
                    market, _ = Market.objects.get_or_create(
                        name='Tmx Exchange',
                        region=region,
                        defaults={
                            'market_type': 'wholesale',
                            'district': region.name,
                            'governing_authority': 'Tanzania Mercantile Exchange PLC',
                        }
                    )
                    market_map[region.id] = market

        existing_price_keys = set()
        if not dry_run:
            tmx_markets = list(Market.objects.filter(name='Tmx Exchange'))
            if tmx_markets:
                existing = PriceEntry.objects.filter(
                    market__in=tmx_markets
                ).values_list('crop_id', 'market_id', 'price', 'price_date')
                existing_price_keys = {
                    (c, m, round(float(p), 2), str(d)) for c, m, p, d in existing
                }

        current_prices = []
        historical_prices = []

        for entry in entries:
            commodity = entry.get('Commodity', '').strip()
            location = entry.get('Location', '').strip()
            high_price = entry.get('High Price (TZS/kg)')
            price_date_str = entry.get('Date', '')
            historical_data = entry.get('historicalData', [])

            if not commodity or not location or high_price is None:
                continue

            norm_crop = commodity.strip().title()
            norm_region = location.strip().title()

            if dry_run:
                crop = None
                market = None
            else:
                crop = crop_map.get(norm_crop)
                region = region_map.get(norm_region)
                market = market_map.get(region.id) if region else None

            if not crop or not market:
                continue

            try:
                price_date = datetime.strptime(price_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                price_date = date.today()

            price_key = (crop.id, market.id, round(float(high_price), 2), str(price_date))
            if price_key not in existing_price_keys:
                current_prices.append(PriceEntry(
                    crop=crop, market=market, price=float(high_price),
                    price_date=price_date, status='approved',
                ))
                existing_price_keys.add(price_key)

            for hist_price in historical_data:
                if hist_price is None:
                    continue
                try:
                    hist_val = float(hist_price)
                except (ValueError, TypeError):
                    continue
                hist_key = (crop.id, market.id, round(hist_val, 2), str(price_date))
                if hist_key not in existing_price_keys:
                    historical_prices.append(PriceEntry(
                        crop=crop, market=market, price=hist_val,
                        price_date=price_date, status='approved',
                    ))
                    existing_price_keys.add(hist_key)

        if not dry_run and (current_prices or historical_prices):
            self.stdout.write(f'Inserting {len(current_prices)} current + {len(historical_prices)} historical prices...')
            batch_size = 500
            all_prices = current_prices + historical_prices
            with transaction.atomic():
                for i in range(0, len(all_prices), batch_size):
                    PriceEntry.objects.bulk_create(all_prices[i:i + batch_size], ignore_conflicts=True)

        return {
            'crops': len(crop_map) if not dry_run else len(unique_crop_names),
            'regions': len(region_map) if not dry_run else len(unique_region_names),
            'markets': len(market_map) if not dry_run else len(unique_region_names),
            'current_prices': len(current_prices),
            'historical_prices': len(historical_prices),
        }

    def print_suggestion(self):
        self.stdout.write(self.style.SUCCESS(
            '\n=== NEXT STEPS FOR ONGOING TMX SYNC ===\n'
            'To keep TMX prices updated automatically:\n\n'
            '  1. Create a cron job (Linux) or Scheduled Task (Windows):\n'
            '     python manage.py seed_tmx --clear\n\n'
            '  2. Or add a daily Celery Beat task:\n'
            '     @shared_task\n'
            '     def sync_tmx_prices():\n'
            '         from django.core.management import call_command\n'
            '         call_command("seed_tmx", clear=True)\n\n'
            '  3. The raw data is also saved locally at:\n'
            f'     {RAW_DATA_PATH}\n'
        ))
