"""
Management command: import scraped price data from kilimo.go.tz/viwanda.go.tz
into the Django database.

Usage:
    python manage.py import_scraped_prices
    python manage.py import_scraped_prices --kilimo-file kilimo_pdfs/all_crop_data.json
"""
import os

os.environ['RUN_NOTIFICATION_ENGINE_SKIP'] = '1'

import json
from datetime import datetime, date
from django.core.management.base import BaseCommand, CommandError
from prices.models import Region, Market, Crop, PriceEntry

KILIMO_DEFAULT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'kilimo_pdfs', 'all_crop_data.json'
)

REGION_MAP = {
    'Arusha': 'Northern', 'Dar Es Salaam': 'Coastal', 'Dar es salaam': 'Coastal',
    'Dodoma': 'Central', 'Geita': 'Lake', 'Iringa': 'Southern Highlands',
    'Kagera': 'Lake', 'Katavi': 'Western', 'Kigoma': 'Western',
    'Kilimanjaro': 'Northern', 'Lindi': 'Southern', 'Manyara': 'Northern',
    'Mara': 'Lake', 'Mbeya': 'Southern Highlands', 'Morogoro': 'Coastal',
    'Mtwara': 'Southern', 'Mwanza': 'Lake', 'Njombe': 'Southern Highlands',
    'Pemba': 'Zanzibar', 'Pwani': 'Coastal', 'Rukwa': 'Western',
    'Ruvuma': 'Southern', 'Shinyanga': 'Lake', 'Simiyu': 'Lake',
    'Singida': 'Central', 'Songwe': 'Southern Highlands', 'Tabora': 'Western',
    'Tanga': 'Northern', 'Unguja': 'Zanzibar',
}

CROP_MAP = {
    'Maize': ('grain', 'kg'),
    'Rice': ('grain', 'kg'),
    'Mchele': ('grain', 'kg'),
    'Beans': ('legume', 'kg'),
    'Maharage': ('legume', 'kg'),
    'Sorghum': ('grain', 'kg'),
    'Mtama': ('grain', 'kg'),
    'Finger Millet': ('grain', 'kg'),
    'Ulezi': ('grain', 'kg'),
    'Bulrush Millet': ('grain', 'kg'),
    'Uwele': ('grain', 'kg'),
    'Irish Potatoes': ('root', 'kg'),
    'Viazi mviringo': ('root', 'kg'),
    'Maize flour': ('grain', 'kg'),
    'Rice (local)': ('grain', 'kg'),
    'Rice (super)': ('grain', 'kg'),
}


class Command(BaseCommand):
    help = 'Import scraped price data from kilimo.go.tz / viwanda.go.tz JSON files'

    def add_arguments(self, parser):
        parser.add_argument('--kilimo-file', default=KILIMO_DEFAULT,
                            help='Path to kilimo.all_crop_data.json')
        parser.add_argument('--viwanda-file',
                            help='Path to viwanda_prices.json')
        parser.add_argument('--kilimo-only', action='store_true',
                            help='Only import kilimo data')
        parser.add_argument('--viwanda-only', action='store_true',
                            help='Only import viwanda data')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be imported without saving')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        total_created = 0

        if options.get('kilimo_only') or not options.get('viwanda_only'):
            if os.path.exists(options['kilimo_file']):
                total_created += self.import_kilimo(options['kilimo_file'], dry_run)

        if options.get('viwanda_only') or not options.get('kilimo_only'):
            if options.get('viwanda_file') and os.path.exists(options['viwanda_file']):
                total_created += self.import_viwanda(options['viwanda_file'], dry_run)

        self.stdout.write(self.style.SUCCESS(f'\nDone. Total price entries created: {total_created}'))

    def ensure_region(self, name, dry_run=False):
        norm = name.strip().title()
        zone = REGION_MAP.get(norm, '')
        if dry_run:
            return None
        region, _ = Region.objects.get_or_create(name=norm, defaults={'zone': zone})
        return region

    def ensure_crop(self, name, dry_run=False):
        norm = name.strip().title()
        info = CROP_MAP.get(norm, ('grain', 'kg'))
        if dry_run:
            return None
        crop, _ = Crop.objects.get_or_create(
            name=norm,
            defaults={'category': info[0], 'unit': info[1]}
        )
        return crop

    def ensure_market(self, region, market_name='Central Market', dry_run=False):
        norm = market_name.strip().title()
        if dry_run:
            return None
        market, _ = Market.objects.get_or_create(
            name=norm,
            region=region,
            defaults={'market_type': 'wholesale'}
        )
        return market

    def parse_date_from_period(self, period_str):
        if not period_str:
            return date.today()
        if isinstance(period_str, str):
            period_str = period_str.strip()
        try:
            m = __import__('re').search(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})', period_str)
            if m:
                month_name = m.group(3)
                year = int(m.group(4))
                month_map = {
                    'Januari': 1, 'Februari': 2, 'Machi': 3, 'Aprili': 4,
                    'Mei': 5, 'Juni': 6, 'Julai': 7, 'Agosti': 8,
                    'Septemba': 9, 'Oktoba': 10, 'Novemba': 11, 'Desemba': 12,
                    'January': 1, 'February': 2, 'March': 3, 'April': 4,
                    'May': 5, 'June': 6, 'July': 7, 'August': 8,
                    'September': 9, 'October': 10, 'November': 11, 'December': 12,
                }
                month = month_map.get(month_name, 1)
                return date(year, month, 1)
        except Exception:
            pass
        return date.today()

    def _normalize_name(self, name):
        return name.strip().title()

    def _ensure_all_regions(self, names, dry_run=False):
        if dry_run:
            return {n: None for n in names}
        norm_map = {self._normalize_name(n): n for n in names}
        existing_raw = Region.objects.all()
        existing = {}
        for r in existing_raw:
            existing[self._normalize_name(r.name)] = r
        result = {}
        for n in names:
            key = self._normalize_name(n)
            if key in existing:
                result[n] = existing[key]
            else:
                zone = REGION_MAP.get(key, '')
                r = Region.objects.create(name=key, zone=zone)
                existing[key] = r
                result[n] = r
        return result

    def _ensure_all_crops(self, names, dry_run=False):
        if dry_run:
            return {n: None for n in names}
        norm_map = {self._normalize_name(n): n for n in names}
        existing_raw = Crop.objects.all()
        existing = {}
        for c in existing_raw:
            existing[self._normalize_name(c.name)] = c
        result = {}
        for n in names:
            key = self._normalize_name(n)
            if key in existing:
                result[n] = existing[key]
            else:
                info = CROP_MAP.get(key, ('grain', 'kg'))
                c = Crop.objects.create(name=key, category=info[0], unit=info[1])
                existing[key] = c
                result[n] = c
        return result

    def _ensure_all_markets(self, pairs, dry_run=False):
        if dry_run:
            return {p: None for p in pairs}
        region_cache = {}
        result = {}
        for region_name, market_name in pairs:
            key = (region_name, market_name)
            if key in result:
                continue
            rn = self._normalize_name(region_name)
            if rn not in region_cache:
                region_cache[rn] = Region.objects.get(name=rn)
            region = region_cache[rn]
            mn = market_name.strip().title()
            m, _ = Market.objects.get_or_create(
                name=mn,
                region=region,
                defaults={'market_type': 'wholesale'}
            )
            result[key] = m
        return result

    def import_kilimo(self, filepath, dry_run=False):
        self.stdout.write(f'Importing from {filepath}...')
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        bulletins = data.get('data', [])
        region_names = set()
        for b in bulletins:
            for r in b.get('regions', []):
                name = r.get('region', '').strip()
                if name:
                    region_names.add(name)
        crop_names = ['Maize', 'Rice', 'Beans', 'Sorghum',
                      'Finger Millet', 'Bulrush Millet', 'Irish Potatoes']

        regions = self._ensure_all_regions(region_names, dry_run)
        crops = self._ensure_all_crops(set(crop_names), dry_run)
        market_pairs = [(rn, f'{rn} Central Market') for rn in region_names]
        markets = self._ensure_all_markets(market_pairs, dry_run)

        objects = []
        count = 0
        for bulletin in bulletins:
            bulletin_date = self.parse_date_from_period(bulletin.get('period', ''))
            for region_entry in bulletin.get('regions', []):
                region_name = region_entry.get('region', '').strip()
                if not region_name or region_name not in regions:
                    continue
                prices = region_entry.get('prices', [])
                market = markets.get((region_name, f'{region_name} Central Market'))
                if not market:
                    continue
                for crop_idx, price_val in enumerate(prices):
                    if price_val is None:
                        continue
                    if crop_idx >= len(crop_names):
                        break
                    crop = crops.get(crop_names[crop_idx])
                    if not crop:
                        continue
                    count += 1
                    if dry_run:
                        continue
                    objects.append(PriceEntry(
                        crop=crop, market=market, price=float(price_val),
                        price_date=bulletin_date, status='approved',
                    ))

        if objects and not dry_run:
            PriceEntry.objects.bulk_create(objects, batch_size=500)
        self.stdout.write(f'  Created {count} price entries from kilimo data')
        return count

    def import_viwanda(self, filepath, dry_run=False):
        self.stdout.write(f'Importing from {filepath}...')
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        pdfs = data.get('data', [])
        region_names = set()
        market_pairs = set()
        for pdf in pdfs:
            for entry in pdf.get('entries', []):
                rn = entry.get('region', '').strip()
                mn = entry.get('market', '').strip()
                if rn and mn:
                    region_names.add(rn)
                    market_pairs.add((rn, mn))

        all_crop_names = set()
        for pdf in pdfs:
            for cn in pdf.get('crop_columns', []):
                all_crop_names.add(cn)

        regions = self._ensure_all_regions(region_names, dry_run)
        crops = self._ensure_all_crops(all_crop_names, dry_run)
        markets = self._ensure_all_markets(list(market_pairs), dry_run)

        objects = []
        count = 0
        for pdf_entry in pdfs:
            entries = pdf_entry.get('entries', [])
            crop_columns = pdf_entry.get('crop_columns', [])
            if not entries:
                continue
            pdf_date = self.parse_date_from_period(pdf_entry.get('title', ''))
            for entry in entries:
                region_name = entry.get('region', '').strip()
                market_name = entry.get('market', '').strip()
                prices = entry.get('prices', [])
                if not region_name or not market_name:
                    continue
                market = markets.get((region_name, market_name))
                if not market:
                    continue
                for i in range(0, len(prices), 2):
                    crop_idx = i // 2
                    if crop_idx >= len(crop_columns):
                        break
                    min_price = prices[i]
                    max_price = prices[i + 1] if i + 1 < len(prices) else None
                    crop_name = crop_columns[crop_idx]
                    crop = crops.get(crop_name)
                    if not crop:
                        continue
                    for price_val in (min_price, max_price):
                        if price_val is None or price_val <= 0:
                            continue
                        count += 1
                        if dry_run:
                            continue
                        objects.append(PriceEntry(
                            crop=crop, market=market, price=float(price_val),
                            price_date=pdf_date, status='approved',
                        ))

        if objects and not dry_run:
            PriceEntry.objects.bulk_create(objects, batch_size=500)
        self.stdout.write(f'  Created {count} price entries from viwanda data')
        return count
