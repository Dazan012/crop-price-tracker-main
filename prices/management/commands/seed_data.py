import csv
import random
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from prices.models import UserProfile, Region, Market, Crop, PriceEntry


CROP_MAP = {
    'Mahindi': ('grain', 'Maize', 'kg'),
    'Mchele': ('grain', 'Rice', 'kg'),
    'Maharage': ('legume', 'Beans', 'kg'),
    'Mtama': ('grain', 'Sorghum', 'kg'),
    'Ulezi': ('grain', 'Finger Millet', 'kg'),
    'Wimbi': ('grain', 'Finger Millet', 'kg'),
    'Ngano': ('grain', 'Wheat', 'kg'),
    'Alizeti': ('cash', 'Sunflower', 'kg'),
    'Karanga': ('legume', 'Groundnuts', 'kg'),
    'Karanga za nazi': ('cash', 'Coconuts', 'piece'),
    'Njugu mawe': ('legume', 'Bambara Groundnuts', 'kg'),
    'Mbaazi': ('legume', 'Pigeon Peas', 'kg'),
    'Choroko': ('legume', 'Green Gram', 'kg'),
    'Kunde': ('legume', 'Cowpeas', 'kg'),
    'Soya': ('legume', 'Soybeans', 'kg'),
    'Ufuta': ('cash', 'Sesame', 'kg'),
    'Pamba': ('cash', 'Cotton', 'kg'),
    'Kahawa': ('cash', 'Coffee', 'kg'),
    'Korosho': ('cash', 'Cashew nuts', 'kg'),
    'Karafuu': ('spice', 'Cloves', 'kg'),
    'Tumbaku': ('cash', 'Tobacco', 'kg'),
    'Chai': ('cash', 'Tea', 'kg'),
    'Viazi mviringo': ('vegetable', 'Irish Potatoes', 'kg'),
    'Viazi vitamu': ('root', 'Sweet Potatoes', 'kg'),
    'Mihogo': ('root', 'Cassava', 'kg'),
    'Ndizi': ('fruit', 'Bananas', 'kg'),
    'Nyanya': ('vegetable', 'Tomatoes', 'kg'),
    'Vitunguu': ('vegetable', 'Onions', 'kg'),
    'Vitunguu saumu': ('vegetable', 'Garlic', 'kg'),
    'Hoho': ('vegetable', 'Bell Peppers', 'kg'),
    'Bilinganya': ('vegetable', 'Eggplant', 'kg'),
    'Mchicha': ('vegetable', 'Amaranth', 'bundle'),
    'Majani ya kisamvu': ('vegetable', 'Cassava Leaves', 'bundle'),
    'Embe': ('fruit', 'Mangoes', 'kg'),
    'Machungwa': ('fruit', 'Oranges', 'kg'),
    'Mapera': ('fruit', 'Guavas', 'kg'),
    'Nanasi': ('fruit', 'Pineapples', 'piece'),
    'Tikiti maji': ('fruit', 'Watermelon', 'piece'),
    'Parachichi': ('fruit', 'Avocado', 'kg'),
    'Limau': ('fruit', 'Lemons', 'kg'),
    'Pilipili': ('spice', 'Chili Pepper', 'kg'),
    'Tangawizi': ('spice', 'Ginger', 'kg'),
    'Iliki': ('spice', 'Cardamom', 'kg'),
    'Bizari': ('spice', 'Turmeric', 'kg'),
}

REGION_ZONES = {
    'ARUSHA': 'Northern',
    'KILIMANJARO': 'Northern',
    'TANGA': 'Northern',
    'MANYARA': 'Northern',
    'DAR ES SALAAM': 'Coastal',
    'PWANI': 'Coastal',
    'MOROGORO': 'Eastern',
    'DODOMA': 'Central',
    'SINGIDA': 'Central',
    'Tabora': 'Central',
    'TABORA': 'Central',
    'MBEYA': 'Southern Highlands',
    'IRINGA': 'Southern Highlands',
    'NJOMBE': 'Southern Highlands',
    'SONGWE': 'Southern Highlands',
    'RUVUMA': 'Southern',
    'LINDI': 'Southern',
    'Mtwara': 'Southern',
    'MTWARA': 'Southern',
    'MARA': 'Lake',
    'MWANZA': 'Lake',
    'SHINYANGA': 'Lake',
    'KAGERA': 'Lake',
    'GEITA': 'Lake',
    'SIMIYU': 'Lake',
    'KIGOMA': 'Western',
    'KATAVI': 'Western',
    'RUKWA': 'Western',
    'Pwani': 'Coastal',
    'Kilimanjaro': 'Northern',
    'Tabora': 'Central',
    'Mtwara': 'Southern',
    'Pwani': 'Coastal',
}


def parse_date(date_str):
    """Parse DD-MM-YYYY format."""
    try:
        parts = date_str.strip().split('-')
        if len(parts) == 3:
            return date(int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        pass
    return None


def create_test_users():
    """Create test user accounts with different roles."""
    users = [
        ('admin', 'admin@smartcrops.co.tz', 'Admin123!', 'admin', 'Administrator'),
        ('agent_mbeya', 'agent.mbeya@smartcrops.co.tz', 'Agent123!', 'agent', 'Market Agent - Mbeya'),
        ('agent_arusha', 'agent.arusha@smartcrops.co.tz', 'Agent123!', 'agent', 'Market Agent - Arusha'),
        ('trader_juma', 'juma@smartcrops.co.tz', 'Trader123!', 'trader', 'Crop Trader'),
        ('trader_amina', 'amina@smartcrops.co.tz', 'Trader123!', 'trader', 'Crop Trader'),
        ('farmer_baraka', 'baraka@smartcrops.co.tz', 'Farmer123!', 'farmer', 'Smallholder Farmer'),
        ('farmer_neema', 'neema@smartcrops.co.tz', 'Farmer123!', 'farmer', 'Smallholder Farmer'),
        ('farmer_hassan', 'hassan@smartcrops.co.tz', 'Farmer123!', 'farmer', 'Smallholder Farmer'),
        ('viewer_test', 'viewer@smartcrops.co.tz', 'Viewer123!', 'general', 'General Viewer'),
    ]
    created = []
    for username, email, password, role, desc in users:
        if not User.objects.filter(username=username).exists():
            user = User.objects.create_user(
                username=username, email=email, password=password,
                first_name=desc.split(' ')[0], last_name=desc.split(' ')[-1] if ' ' in desc else ''
            )
            UserProfile.objects.create(user=user, role=role, region='Mbeya')
            Token.objects.create(user=user)
            created.append(username)
            self_print(f"  Created user: {username} ({role}) - {email}")
        else:
            created.append(username)
    return created


def self_print(msg):
    print(msg)


class Command(BaseCommand):
    help = 'Seeds the database with real Tanzanian government crop price data'

    def add_arguments(self, parser):
        parser.add_argument('--csv', type=str, default='E:/project 1/project/downloaded-file.csv',
                            help='Path to government CSV file')

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('\n=== Smart Crops Data Seeder ===\n'))

        # Step 1: Create users
        self.stdout.write(self.style.SUCCESS('Creating test users...'))
        create_test_users()

        # Step 2: Create regions
        self.stdout.write(self.style.SUCCESS('\nCreating regions...'))
        region_objs = {}
        for region_name, zone in REGION_ZONES.items():
            name = region_name.title()
            obj, created = Region.objects.get_or_create(name=name, defaults={'zone': zone})
            region_objs[region_name.upper()] = obj
            if created:
                self.stdout.write(f"  + Region: {name} ({zone})")
        self.stdout.write(f"  Total regions: {Region.objects.count()}")

        # Step 3: Create crops
        self.stdout.write(self.style.SUCCESS('\nCreating crops...'))
        crop_objs = {}
        seen_crops = set()
        for swahili_name, (category, english_name, unit) in CROP_MAP.items():
            if english_name not in seen_crops:
                desc = f"{english_name} ({swahili_name})"
                obj, created = Crop.objects.get_or_create(
                    name=english_name,
                    defaults={'category': category, 'unit': unit, 'description': desc}
                )
                crop_objs[swahili_name] = obj
                seen_crops.add(english_name)
                if created:
                    self.stdout.write(f"  + Crop: {english_name} ({swahili_name}) - {category}")
            else:
                for k, v in CROP_MAP.items():
                    if v[1] == english_name and k in crop_objs:
                        crop_objs[swahili_name] = crop_objs[k]
                        break
        self.stdout.write(f"  Total crops: {Crop.objects.count()}")

        # Step 4: Parse CSV and create markets + prices
        csv_path = options['csv']
        self.stdout.write(self.style.SUCCESS(f'\nParsing government CSV: {csv_path}'))

        market_objs = {}
        price_count = 0
        skip_count = 0

        try:
            with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                header = next(reader)
                # Skip meta lines until we find data
                for row in reader:
                    if len(row) < 10:
                        continue
                    # row: #, DATE, (empty), CROP, HIGH_PRICE, LOW_PRICE, UNIT, REGION, DISTRICT, MARKET
                    try:
                        row_num = row[0].strip()
                        if not row_num.isdigit():
                            continue
                        date_str = row[1].strip()
                        crop_name = row[3].strip()
                        high_price_str = row[4].strip()
                        low_price_str = row[5].strip()
                        unit = row[6].strip()
                        region_name = row[7].strip().upper()
                        district = row[8].strip()
                        market_name = row[9].strip()
                    except (IndexError, ValueError):
                        skip_count += 1
                        continue

                    price_date = parse_date(date_str)
                    if not price_date:
                        skip_count += 1
                        continue

                    try:
                        high_price = float(high_price_str.replace(',', ''))
                    except (ValueError, TypeError):
                        skip_count += 1
                        continue

                    try:
                        low_price = float(low_price_str.replace(',', ''))
                    except (ValueError, TypeError):
                        low_price = high_price * 0.85

                    if crop_name not in crop_objs:
                        skip_count += 1
                        continue

                    if region_name not in region_objs:
                        skip_count += 1
                        continue

                    region = region_objs[region_name]

                    market_key = f"{market_name}_{region_name}"
                    if market_key not in market_objs:
                        obj, _ = Market.objects.get_or_create(
                            name=market_name,
                            region=region,
                            defaults={'location_description': f"{district} district", 'is_active': True}
                        )
                        market_objs[market_key] = obj

                    market = market_objs[market_key]
                    crop = crop_objs[crop_name]

                    PriceEntry.objects.get_or_create(
                        crop=crop, market=market, price_date=price_date, price=high_price,
                        defaults={
                            'quantity': round(random.uniform(50, 500), 1),
                            'status': 'approved',
                            'is_anomaly': False,
                        }
                    )
                    price_count += 1

                    if low_price > 0 and low_price != high_price:
                        PriceEntry.objects.get_or_create(
                            crop=crop, market=market, price_date=price_date, price=low_price,
                            defaults={
                                'quantity': round(random.uniform(50, 500), 1),
                                'status': 'approved',
                                'is_anomaly': False,
                            }
                        )
                        price_count += 1

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"  CSV not found: {csv_path}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  CSV error: {e}"))

        self.stdout.write(f"  Prices from CSV: {price_count} (skipped: {skip_count})")
        self.stdout.write(f"  Markets created: {Market.objects.count()}")

        # Step 5: Generate synthetic anomaly entries for testing
        self.stdout.write(self.style.SUCCESS('\nGenerating synthetic anomaly entries...'))
        all_crops = list(Crop.objects.all())
        all_markets = list(Market.objects.all())
        admin_user = User.objects.filter(username='admin').first()

        if all_crops and all_markets and admin_user:
            synth_count = 0
            anomaly_count = 0
            base_date = date(2026, 6, 1)

            for _ in range(500):
                crop = random.choice(all_crops)
                market = random.choice(all_markets)
                days_ago = random.randint(0, 30)
                p_date = base_date - timedelta(days=days_ago)

                # Get normal price range for this crop
                existing = list(PriceEntry.objects.filter(crop=crop, status='approved').values_list('price', flat=True)[:50])
                if existing:
                    avg = sum(existing) / len(existing)
                    std = max((sum((p - avg) ** 2 for p in existing) / len(existing)) ** 0.5, avg * 0.1)
                else:
                    avg = random.uniform(500, 5000)
                    std = avg * 0.2

                # 5% chance of anomaly
                if random.random() < 0.05:
                    price = avg + random.choice([-1, 1]) * std * random.uniform(4, 8)
                    price = max(10, price)
                    is_anomaly = True
                    anomaly_count += 1
                    reason = f"Synthetic anomaly: price {price:.0f} deviates significantly from mean {avg:.0f}"
                    entry_status = 'flagged'
                else:
                    price = max(10, random.gauss(avg, std * 0.5))
                    is_anomaly = False
                    reason = ''
                    entry_status = 'approved'

                PriceEntry.objects.create(
                    crop=crop, market=market, price=round(price, 2),
                    quantity=round(random.uniform(10, 300), 1),
                    price_date=p_date, submitted_by=admin_user,
                    is_anomaly=is_anomaly, anomaly_score=round(random.uniform(2.5, 6.0), 3) if is_anomaly else None,
                    anomaly_reason=reason, status=entry_status,
                )
                synth_count += 1

            self.stdout.write(f"  Synthetic entries: {synth_count} (anomalies: {anomaly_count})")

        # Final stats
        self.stdout.write(self.style.SUCCESS('\n=== SEEDING COMPLETE ==='))
        self.stdout.write(f"  Regions: {Region.objects.count()}")
        self.stdout.write(f"  Markets: {Market.objects.count()}")
        self.stdout.write(f"  Crops: {Crop.objects.count()}")
        self.stdout.write(f"  Price Entries: {PriceEntry.objects.count()}")
        self.stdout.write(f"  Anomalies: {PriceEntry.objects.filter(is_anomaly=True).count()}")
        self.stdout.write(f"  Users: {User.objects.count()}")
        self.stdout.write(self.style.SUCCESS('\nDone!\n'))
