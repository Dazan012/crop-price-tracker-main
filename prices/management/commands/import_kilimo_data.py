"""
Import crop price data from Tanzania Ministry of Agriculture (kilimo.go.tz) PDFs.

Usage:
    python manage.py import_kilimo_data --file path/to/all_crop_data.json
    python manage.py import_kilimo_data  # uses default path
"""
import json
import os
from datetime import datetime, date
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from prices.models import Crop, Region, Market, PriceEntry

# Crop definitions from kilimo.go.tz reports
KILIMO_CROPS = {
    'Maize': {'category': 'grain', 'unit': 'kg', 'sw': 'Mahindi'},
    'Rice': {'category': 'grain', 'unit': 'kg', 'sw': 'Mchele'},
    'Beans': {'category': 'legume', 'unit': 'kg', 'sw': 'Maharage'},
    'Sorghum': {'category': 'grain', 'unit': 'kg', 'sw': 'Mtama'},
    'Finger Millet': {'category': 'grain', 'unit': 'kg', 'sw': 'Uwele/Ulezi'},
    'Irish Potatoes': {'category': 'root', 'unit': 'kg', 'sw': 'Viazi mviringo'},
    'Cocoa': {'category': 'cash', 'unit': 'kg', 'sw': 'Kakao'},
    'Pigeon Peas': {'category': 'legume', 'unit': 'kg', 'sw': 'Choroko'},
    'Sesame': {'category': 'cash', 'unit': 'kg', 'sw': 'Ufuta'},
    'Green Grams': {'category': 'legume', 'unit': 'kg', 'sw': 'Mbaazi'},
    'Tobacco': {'category': 'cash', 'unit': 'kg', 'sw': 'Tumbaku'},
    'Sweet Potatoes': {'category': 'root', 'unit': 'kg', 'sw': 'Viazi vitamu'},
    'Cassava': {'category': 'root', 'unit': 'kg', 'sw': 'Muhogo'},
    'Groundnuts': {'category': 'legume', 'unit': 'kg', 'sw': 'Karanga'},
    'Sunflower': {'category': 'grain', 'unit': 'kg', 'sw': 'Alizeti'},
    'Bananas': {'category': 'fruit', 'unit': 'kg', 'sw': 'Ndizi'},
}

# Crop order in regional price tables (from PDF Jedwali 2)
REGIONAL_CROP_ORDER = [
    'Maize', 'Rice', 'Beans', 'Sorghum', 'Finger Millet', 'Finger Millet', 'Irish Potatoes'
]

# Swahili month mapping
MONTH_MAP = {
    'Januari': 1, 'Februari': 2, 'Machi': 3, 'Aprili': 4,
    'Mei': 5, 'Juni': 6, 'Julai': 7, 'Agosti': 8,
    'Septemba': 9, 'Oktoba': 10, 'Novemba': 11, 'Desemba': 12,
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
}


def parse_period(period_str):
    """Parse period string like '06-10 Aprili, 2026' into a date (last day)."""
    if not period_str:
        return date.today()
    try:
        # Try: "06-10 Aprili, 2026"
        import re
        m = re.match(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})', period_str)
        if m:
            end_day = int(m.group(2))
            month_str = m.group(3)
            year = int(m.group(4))
            month = MONTH_MAP.get(month_str, 1)
            return date(year, month, end_day)

        # Try: "30 Machi - 03 Aprili, 2026"
        m = re.match(r'\d{1,2}\s+\w+\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})', period_str)
        if m:
            end_day = int(m.group(1))
            month_str = m.group(2)
            year = int(m.group(3))
            month = MONTH_MAP.get(month_str, 1)
            return date(year, month, end_day)
    except Exception:
        pass
    return date.today()


class Command(BaseCommand):
    help = 'Import crop price data from kilimo.go.tz PDF extractions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            default=os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
                '..', 'kilimo_pdfs', 'all_crop_data.json'
            ),
            help='Path to the JSON file with extracted data',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be imported without actually importing',
        )

    def handle(self, *args, **options):
        filepath = options['file']
        dry_run = options['dry_run']

        if not os.path.exists(filepath):
            # Try alternative path
            alt_path = r"C:\Users\heis\.qoderwork\workspace\mqgd5oeo6cci31zr\kilimo_pdfs\all_crop_data.json"
            if os.path.exists(alt_path):
                filepath = alt_path
            else:
                self.stderr.write(f"File not found: {filepath}")
                return

        self.stdout.write(f"Loading data from: {filepath}")
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.stdout.write(f"Source: {data.get('source', 'Unknown')}")
        self.stdout.write(f"PDFs processed: {data.get('total_pdfs', 0)}")

        # Ensure all crops exist
        self.stdout.write("\n--- Ensuring crops exist ---")
        crop_objects = {}
        for crop_name, info in KILIMO_CROPS.items():
            crop, created = Crop.objects.get_or_create(
                name=crop_name,
                defaults={
                    'category': info['category'],
                    'unit': info['unit'],
                    'description': f"Swahili: {info['sw']}. Data source: kilimo.go.tz",
                }
            )
            crop_objects[crop_name] = crop
            status = 'CREATED' if created else 'exists'
            self.stdout.write(f"  {crop_name}: {status}")

        # Ensure all regions exist
        self.stdout.write("\n--- Ensuring regions exist ---")
        region_objects = {}
        all_regions = set()
        for pdf_data in data['data']:
            for rp in pdf_data.get('regional_prices', []):
                all_regions.add(rp['region'])

        for region_name in sorted(all_regions):
            region, created = Region.objects.get_or_create(
                name=region_name,
                defaults={'zone': ''}
            )
            region_objects[region_name] = region
            if created:
                self.stdout.write(f"  {region_name}: CREATED")

        # Ensure each region has at least one market
        self.stdout.write("\n--- Ensuring markets exist ---")
        market_objects = {}
        for region_name, region_obj in region_objects.items():
            market, created = Market.objects.get_or_create(
                name=f"{region_name} Central Market",
                region=region_obj,
                defaults={
                    'district': '',
                    'market_type': 'daily',
                    'is_active': True,
                    'location_description': f'Main market in {region_name} region. Data source: kilimo.go.tz',
                }
            )
            market_objects[region_name] = market
            if created:
                self.stdout.write(f"  {region_name} Central Market: CREATED")

        # Get or create a system user for imports
        system_user, _ = User.objects.get_or_create(
            username='kilimo_import',
            defaults={
                'email': 'system@smartcrops.tz',
                'first_name': 'Kilimo',
                'last_name': 'Import',
            }
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("\n--- DRY RUN: No data will be imported ---"))

        # Import price entries from each PDF
        total_created = 0
        total_skipped = 0

        for pdf_data in data['data']:
            period = pdf_data.get('period', '')
            price_date = parse_period(period)
            filename = pdf_data.get('file', 'unknown')

            self.stdout.write(f"\n--- {filename} (period: {period}, date: {price_date}) ---")

            # Regional prices
            for rp in pdf_data.get('regional_prices', []):
                region_name = rp['region']
                prices = rp.get('prices', [])

                if region_name not in market_objects:
                    continue

                market = market_objects[region_name]

                # Map prices to crops (order from PDF table)
                for i, price in enumerate(prices):
                    if i >= len(REGIONAL_CROP_ORDER):
                        break
                    crop_name = REGIONAL_CROP_ORDER[i]

                    # Skip duplicate Finger Millet entries
                    if crop_name == 'Finger Millet' and i == 5:
                        continue

                    crop = crop_objects.get(crop_name)
                    if not crop or not price or price <= 0:
                        continue

                    if dry_run:
                        self.stdout.write(f"  [DRY] {region_name}: {crop_name} = TZS {price:,}/kg on {price_date}")
                        total_created += 1
                        continue

                    # Check if entry already exists
                    existing = PriceEntry.objects.filter(
                        crop=crop, market=market, price_date=price_date
                    ).exists()

                    if existing:
                        total_skipped += 1
                        continue

                    PriceEntry.objects.create(
                        crop=crop,
                        market=market,
                        price=float(price),
                        price_date=price_date,
                        submitted_by=system_user,
                        is_anomaly=False,
                    )
                    total_created += 1

            self.stdout.write(f"  Processed {filename}")

        # Summary
        self.stdout.write(self.style.SUCCESS(f"\n{'=' * 50}"))
        self.stdout.write(self.style.SUCCESS(f"Import complete!"))
        self.stdout.write(self.style.SUCCESS(f"  Price entries created: {total_created}"))
        self.stdout.write(self.style.SUCCESS(f"  Price entries skipped (duplicates): {total_skipped}"))
        self.stdout.write(self.style.SUCCESS(f"  Crops ensured: {len(crop_objects)}"))
        self.stdout.write(self.style.SUCCESS(f"  Regions ensured: {len(region_objects)}"))
        self.stdout.write(self.style.SUCCESS(f"  Markets ensured: {len(market_objects)}"))

        if not dry_run:
            total_entries = PriceEntry.objects.count()
            self.stdout.write(self.style.SUCCESS(f"\n  Total price entries in database: {total_entries}"))
