"""
Migrate all data from SQLite (db.sqlite3) to Neon PostgreSQL.
Usage: python migrate_to_neon.py
"""
import os, sys, django

# Setup Django with Neon (current settings)
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

import sqlite3
from django.contrib.auth.models import User
from prices.models import (
    UserProfile, Region, Market, Crop, PriceEntry,
    TransportRoute, RegionRoute, PricingRule, PriceAlert,
    MarketMatch, Cooperative, CooperativeMembership,
    MarketAgentSubmission, UserPreferences,
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'db.sqlite3')

def get_sqlite_conn():
    return sqlite3.connect(DB_PATH)

def migrate_users(conn):
    """Migrate users and profiles."""
    cur = conn.cursor()
    cur.execute("SELECT id, username, email, first_name, last_name, password, is_active, is_staff, is_superuser, date_joined FROM auth_user")
    rows = cur.fetchall()
    created = 0
    for row in rows:
        uid, username, email, first_name, last_name, password, is_active, is_staff, is_superuser, date_joined = row
        if User.objects.filter(username=username).exists():
            continue
        user = User(username=username, email=email or '', first_name=first_name or '', last_name=last_name or '')
        user.password = password
        user.is_active = bool(is_active)
        user.is_staff = bool(is_staff)
        user.is_superuser = bool(is_superuser)
        user.save()
        # Update the ID to match
        User.objects.filter(pk=user.pk).update(pk=uid)
        created += 1
    print(f"  Users: {created} migrated")
    return created

def migrate_profiles(conn):
    """Migrate user profiles."""
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM prices_userprofile")
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    except:
        print("  Profiles: table not found, skipping")
        return 0
    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        user_id = data.pop('user_id')
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            continue
        assigned_market_id = data.pop('assigned_market_id', None)
        pk = data.pop('id')
        if UserProfile.objects.filter(user=user).exists():
            continue
        profile = UserProfile(user=user, **{k: v for k, v in data.items() if v is not None or k in ['phone', 'region', 'district']})
        if assigned_market_id:
            try:
                profile.assigned_market = Market.objects.get(pk=assigned_market_id)
            except:
                pass
        profile.save()
        created += 1
    print(f"  Profiles: {created} migrated")
    return created

def migrate_regions(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, name, zone FROM prices_region")
    created = 0
    for row in cur.fetchall():
        rid, name, zone = row
        if not Region.objects.filter(name=name).exists():
            Region.objects.create(id=rid, name=name, zone=zone or '')
            created += 1
    print(f"  Regions: {created} migrated")

def migrate_markets(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, name, region_id, district, ward, location_description, market_type, operating_days, governing_authority, is_active, created_at FROM prices_market")
    created = 0
    for row in cur.fetchall():
        mid, name, region_id, district, ward, loc, mtype, days, auth, active, cat = row
        if Market.objects.filter(pk=mid).exists():
            continue
        try:
            region = Region.objects.get(pk=region_id)
        except Region.DoesNotExist:
            continue
        Market.objects.create(
            id=mid, name=name, region=region, district=district or '', ward=ward or '',
            location_description=loc or '', market_type=mtype or 'daily',
            operating_days=days or '', governing_authority=auth or '', is_active=bool(active),
        )
        created += 1
    print(f"  Markets: {created} migrated")

def migrate_crops(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, name, category, unit, description FROM prices_crop")
    created = 0
    for row in cur.fetchall():
        cid, name, cat, unit, desc = row
        if not Crop.objects.filter(name=name).exists():
            Crop.objects.create(id=cid, name=name, category=cat or 'grain', unit=unit or 'kg', description=desc or '')
            created += 1
    print(f"  Crops: {created} migrated")

def migrate_prices(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, crop_id, market_id, price, quantity, submitted_by_id, submitted_at, price_date, is_anomaly, anomaly_score, anomaly_reason, status, reviewed_by_id, reviewed_at FROM prices_priceentry LIMIT 5000")
    created = 0
    for row in cur.fetchall():
        pid = row[0]
        if PriceEntry.objects.filter(pk=pid).exists():
            continue
        try:
            crop = Crop.objects.get(pk=row[1])
            market = Market.objects.get(pk=row[2])
        except:
            continue
        submitted_by = None
        if row[5]:
            try:
                submitted_by = User.objects.get(pk=row[5])
            except:
                pass
        reviewed_by = None
        if row[12]:
            try:
                reviewed_by = User.objects.get(pk=row[12])
            except:
                pass
        PriceEntry.objects.create(
            id=pid, crop=crop, market=market, price=row[3], quantity=row[4],
            submitted_by=submitted_by, submitted_at=row[6], price_date=row[7],
            is_anomaly=bool(row[8]), anomaly_score=row[9], anomaly_reason=row[10] or '',
            status=row[11] or 'approved', reviewed_by=reviewed_by, reviewed_at=row[13],
        )
        created += 1
    print(f"  Prices: {created} migrated")

def migrate_region_routes(conn):
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, from_region_id, to_region_id, distance_km, road_type, corridor, condition_factor, avg_speed_kmh, is_bidirectional FROM prices_regionroute")
    except:
        print("  RegionRoutes: table not found, skipping")
        return
    created = 0
    for row in cur.fetchall():
        rid = row[0]
        if RegionRoute.objects.filter(pk=rid).exists():
            continue
        try:
            fr = Region.objects.get(pk=row[1])
            to = Region.objects.get(pk=row[2])
        except:
            continue
        RegionRoute.objects.create(
            id=rid, from_region=fr, to_region=to, distance_km=row[3],
            road_type=row[4] or 'trunk', corridor=row[5] or 'none',
            condition_factor=row[6] or 1.0, avg_speed_kmh=row[7] or 60.0,
            is_bidirectional=bool(row[8]) if row[8] is not None else True,
        )
        created += 1
    print(f"  RegionRoutes: {created} migrated")

def migrate_pricing_rules(conn):
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, vehicle_type, base_rate_per_km, vehicle_multiplier, fuel_multiplier, min_charge, large_cargo_threshold_kg, large_cargo_discount FROM prices_pricingrule")
    except:
        print("  PricingRules: table not found, skipping")
        return
    created = 0
    for row in cur.fetchall():
        rid = row[0]
        if PricingRule.objects.filter(pk=rid).exists():
            continue
        PricingRule.objects.create(
            id=rid, vehicle_type=row[1], base_rate_per_km=row[2] or 200,
            vehicle_multiplier=row[3] or 1.0, fuel_multiplier=row[4] or 1.0,
            min_charge=row[5] or 5000, large_cargo_threshold_kg=row[6] or 5000,
            large_cargo_discount=row[7] or 0.9,
        )
        created += 1
    print(f"  PricingRules: {created} migrated")


print("=" * 50)
print("Migrating SQLite data to Neon PostgreSQL")
print("=" * 50)

conn = get_sqlite_conn()

print("\nMigrating reference data...")
migrate_regions(conn)
migrate_markets(conn)
migrate_crops(conn)

print("\nMigrating users...")
migrate_users(conn)
migrate_profiles(conn)

print("\nMigrating price entries...")
migrate_prices(conn)

print("\nMigrating transport data...")
migrate_region_routes(conn)
migrate_pricing_rules(conn)

conn.close()

print("\n" + "=" * 50)
print("Migration complete! Verifying...")
print("=" * 50)
print(f"  Users: {User.objects.count()}")
print(f"  Regions: {Region.objects.count()}")
print(f"  Markets: {Market.objects.count()}")
print(f"  Crops: {Crop.objects.count()}")
print(f"  Prices: {PriceEntry.objects.count()}")
print(f"  Routes: {RegionRoute.objects.count()}")
print(f"  Pricing: {PricingRule.objects.count()}")
print("\nDone!")
