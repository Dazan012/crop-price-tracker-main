"""
Seed the Tanzania inter-regional transport network.

Populates RegionRoute and PricingRule tables with real distances
and road data based on Tanzania's national highway network.

Usage:
    python manage.py seed_transport_network
"""

from django.core.management.base import BaseCommand
from prices.models import Region, RegionRoute, PricingRule


# ─────────────────────────────────────────────────────────────
# TANZANIA ROUTE NETWORK
# Based on national highway corridors and real road distances
# ─────────────────────────────────────────────────────────────

# Each entry: (from_region, to_region, distance_km, road_type, corridor, condition, speed)
ROUTES = [
    # ── Northern Corridor: Dar → Arusha → Kenya ──
    ('Dar Es Salaam', 'Pwani',         70,  'trunk',    'northern', 1.0, 80),
    ('Pwani', 'Morogoro',             128, 'trunk',    'northern', 1.0, 70),
    ('Morogoro', 'Dodoma',            257, 'trunk',    'central',  1.0, 65),
    ('Dodoma', 'Manyara',             260, 'trunk',    'northern', 1.0, 60),
    ('Manyara', 'Arusha',             160, 'trunk',    'northern', 1.0, 65),
    ('Arusha', 'Kilimanjaro',         105, 'trunk',    'northern', 1.0, 70),

    # ── Central Corridor: Dar → Dodoma → Mwanza → Kigoma ──
    ('Dodoma', 'Singida',             160, 'trunk',    'central',  1.0, 60),
    ('Singida', 'Tabora',             280, 'trunk',    'central',  1.05, 55),
    ('Tabora', 'Kigoma',              320, 'trunk',    'central',  1.1, 50),
    ('Tabora', 'Shinyanga',           200, 'trunk',    'central',  1.0, 55),
    ('Shinyanga', 'Mwanza',           170, 'trunk',    'central',  1.0, 60),
    ('Shinyanga', 'Geita',            130, 'regional', 'central',  1.05, 50),
    ('Mwanza', 'Geita',               150, 'trunk',    'lake',     1.0, 55),
    ('Geita', 'Kagera',               200, 'trunk',    'lake',     1.05, 50),
    ('Mwanza', 'Mara',                250, 'trunk',    'lake',     1.0, 55),
    ('Mara', 'Arusha',                350, 'trunk',    'lake',     1.05, 50),

    # ── Southern Corridor: Dar → Mbeya → Tunduma ──
    ('Morogoro', 'Iringa',            280, 'trunk',    'southern', 1.0, 60),
    ('Iringa', 'Mbeya',               290, 'trunk',    'southern', 1.0, 60),
    ('Mbeya', 'Songwe',               130, 'trunk',    'southern', 1.0, 55),

    # ── Coastal Corridor: Tanga → Dar → Mtwara ──
    ('Tanga', 'Pwani',                200, 'trunk',    'coastal',  1.0, 60),
    ('Pwani', 'Lindi',                420, 'trunk',    'coastal',  1.05, 55),
    ('Lindi', 'Mtwara',               110, 'trunk',    'coastal',  1.0, 55),
    ('Mtwara', 'Ruvuma',              290, 'regional', 'coastal',  1.1, 45),
    ('Ruvuma', 'Mbeya',               450, 'regional', 'southern', 1.15, 45),

    # ── Western Corridor ──
    ('Tabora', 'Katavi',              400, 'regional', 'western',  1.2, 40),
    ('Katavi', 'Rukwa',               250, 'district', 'western',  1.3, 35),
    ('Rukwa', 'Mbeya',                350, 'regional', 'western',  1.2, 40),

    # ── Cross-connections ──
    ('Dodoma', 'Iringa',              260, 'trunk',    'central',  1.0, 55),
    ('Manyara', 'Tanga',              350, 'regional', 'northern', 1.05, 50),
    ('Tanga', 'Kilimanjaro',          170, 'regional', 'northern', 1.0, 55),
    ('Iringa', 'Morogoro',            280, 'trunk',    'central',  1.0, 55),  # bidirectional alt
    ('Dodoma', 'Singida',             160, 'trunk',    'central',  1.0, 55),  # already exists, skip
    ('Njombe', 'Iringa',              230, 'regional', 'southern', 1.1, 45),
    ('Njombe', 'Mbeya',               210, 'regional', 'southern', 1.1, 45),
    ('Njombe', 'Ruvuma',              350, 'district', 'southern', 1.2, 35),
    ('Songwe', 'Rukwa',               280, 'regional', 'western',  1.15, 40),
    ('Simiyu', 'Mwanza',              200, 'regional', 'lake',     1.05, 50),
    ('Simiyu', 'Mara',                180, 'regional', 'lake',     1.05, 45),
    ('Simiyu', 'Arusha',              350, 'regional', 'lake',     1.1, 45),
    ('Manyara', 'Dodoma',             260, 'trunk',    'northern', 1.0, 55),
    ('Geita', 'Kigoma',               300, 'regional', 'lake',     1.1, 45),
    ('Katavi', 'Kigoma',              350, 'regional', 'western',  1.2, 35),
]

# Remove duplicates (keep first occurrence of each pair)
_seen = set()
UNIQUE_ROUTES = []
for r in ROUTES:
    key = tuple(sorted([r[0], r[1]]))
    if key not in _seen:
        _seen.add(key)
        UNIQUE_ROUTES.append(r)


class Command(BaseCommand):
    help = 'Seed the Tanzania inter-regional transport network (routes + pricing rules)'

    def handle(self, *args, **options):
        self.stdout.write('Seeding transport network...')

        # Ensure all regions exist
        all_region_names = set()
        for r in UNIQUE_ROUTES:
            all_region_names.add(r[0])
            all_region_names.add(r[1])

        regions = {}
        for name in all_region_names:
            region, created = Region.objects.get_or_create(name=name)
            regions[name] = region
            if created:
                self.stdout.write(f'  Created region: {name}')

        # Create routes
        created_count = 0
        updated_count = 0
        for from_name, to_name, dist, road_type, corridor, condition, speed in UNIQUE_ROUTES:
            from_region = regions.get(from_name)
            to_region = regions.get(to_name)
            if not from_region or not to_region:
                self.stdout.write(f'  SKIP: {from_name} → {to_name} (region missing)')
                continue

            route, created = RegionRoute.objects.update_or_create(
                from_region=from_region,
                to_region=to_region,
                defaults={
                    'distance_km': dist,
                    'road_type': road_type,
                    'corridor': corridor,
                    'condition_factor': condition,
                    'avg_speed_kmh': speed,
                    'is_bidirectional': True,
                }
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(f'  Routes: {created_count} created, {updated_count} updated')

        # Pricing rules — rates aligned with transport_engine.TRANSPORT_MODES
        # Real Tanzania pricing (2024/2025):
        #   truck: 170–200 TSH per 100kg  → rate 1.85 TSH/km/kg
        #   bus:   2000–5000 TSH per 20kg → rate 8.75 TSH/km/kg-equiv
        #   motorcycle: 5000–6000 TSH per 25km → rate 220 TSH/km (flat)
        #   pickup: versatile mid-range  → rate 3.0 TSH/km/kg
        pricing_data = [
            ('truck',       1.85,  1.0,  1.0,  10000,  5000, 0.90),
            ('bus',         8.75,  1.0,  1.0,   5000,  3000, 0.92),
            ('pickup',      3.0,   1.0,  1.0,   5000,  3000, 0.95),
            ('motorcycle',  220,   1.0,  1.0,   5000,  1000, 1.0),
            ('bicycle',      50,   0.1,  1.0,    500,   200, 1.0),
        ]

        for vtype, rate, vmult, fmult, min_charge, threshold, discount in pricing_data:
            PricingRule.objects.update_or_create(
                vehicle_type=vtype,
                defaults={
                    'base_rate_per_km': rate,
                    'vehicle_multiplier': vmult,
                    'fuel_multiplier': fmult,
                    'min_charge': min_charge,
                    'large_cargo_threshold_kg': threshold,
                    'large_cargo_discount': discount,
                }
            )

        self.stdout.write(self.style.SUCCESS(
            f'Transport network seeded: {len(UNIQUE_ROUTES)} routes, {len(pricing_data)} pricing rules'
        ))
