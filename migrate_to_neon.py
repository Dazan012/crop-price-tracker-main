"""
Migrate ALL data from SQLite (db.sqlite3) to Neon PostgreSQL, using bulk_create
for speed. Idempotent: skips rows that already exist in the target DB.

Usage (PowerShell):
  $env:USE_POSTGRES='true'
  $env:DB_NAME='neondb'
  $env:DB_USER='...'; $env:DB_PASSWORD='...'; $env:DB_HOST='...'; $env:DB_PORT='5432'
  python migrate_to_neon.py
"""
import os, sys, json, sqlite3, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.db import connection
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from prices.models import (
    UserProfile, Region, Market, Crop, PriceEntry,
    RegionRoute, PricingRule, UserPreferences, Notification,
    CropCalendar, SyncSource, SyncLog, WeatherData,
    HourlyWeatherData, LoginAttempt,
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'db.sqlite3')

CROP_ID_TARGET = 'crop_id'   # sqlite column that points to a target-row id


def get_sqlite_conn():
    return sqlite3.connect(DB_PATH)


def rowcount(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return cur.fetchone()[0]


def migrate_users(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, username, email, first_name, last_name, password, is_active, is_staff, is_superuser FROM auth_user")
    existing = set(User.objects.filter(pk__in=[r[0] for r in cur.fetchall()]).values_list('pk', flat=True))
    rows = [r for r in cur.execute("SELECT id, username, email, first_name, last_name, password, is_active, is_staff, is_superuser FROM auth_user").fetchall() if r[0] not in existing]
    objs = []
    for uid, username, email, first_name, last_name, password, is_active, is_staff, is_superuser in rows:
        if User.objects.filter(username=username).exists():
            continue
        u = User(id=uid, username=username, email=email or '', first_name=first_name or '', last_name=last_name or '')
        u.password = password
        u.is_active = bool(is_active)
        u.is_staff = bool(is_staff)
        u.is_superuser = bool(is_superuser)
        objs.append(u)
    User.objects.bulk_create(objs, batch_size=500)
    print(f"  Users: {len(objs)} migrated")


def migrate_profiles(conn):
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM prices_userprofile")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    except Exception:
        print("  Profiles: table not found, skipping")
        return
    users = {u.id: u for u in User.objects.all()}
    existing = set(UserProfile.objects.filter(user_id__in=users).values_list('user_id', flat=True))
    objs = []
    for row in rows:
        data = dict(zip(cols, row))
        user_id = data.pop('user_id')
        if user_id not in users or user_id in existing:
            continue
        assigned_market_id = data.pop('assigned_market_id', None)
        data.pop('id', None)
        p = UserProfile(user=users[user_id], **{k: v for k, v in data.items() if v is not None})
        if assigned_market_id and Market.objects.filter(pk=assigned_market_id).exists():
            p.assigned_market_id = assigned_market_id
        objs.append(p)
    UserProfile.objects.bulk_create(objs, batch_size=500)
    print(f"  Profiles: {len(objs)} migrated")


def migrate_regions(conn):
    cur = conn.cursor()
    existing = set(Region.objects.values_list('name', flat=True))
    objs = []
    for rid, name, zone in cur.execute("SELECT id, name, zone FROM prices_region").fetchall():
        if name in existing:
            continue
        objs.append(Region(id=rid, name=name, zone=zone or ''))
    Region.objects.bulk_create(objs, batch_size=500)
    print(f"  Regions: {len(objs)} migrated")


def migrate_markets(conn):
    cur = conn.cursor()
    regions = {r.id for r in Region.objects.all()}
    existing = set(Market.objects.values_list('pk', flat=True))
    objs = []
    for mid, name, region_id, district, ward, loc, mtype, days, auth, active in cur.execute(
            "SELECT id, name, region_id, district, ward, location_description, market_type, operating_days, governing_authority, is_active FROM prices_market").fetchall():
        if mid in existing or region_id not in regions:
            continue
        objs.append(Market(id=mid, name=name, region_id=region_id, district=district or '',
                           ward=ward or '', location_description=loc or '', market_type=mtype or 'daily',
                           operating_days=days or '', governing_authority=auth or '', is_active=bool(active)))
    Market.objects.bulk_create(objs, batch_size=500)
    print(f"  Markets: {len(objs)} migrated")


def migrate_crops(conn):
    cur = conn.cursor()
    existing = set(Crop.objects.values_list('name', flat=True))
    objs = []
    for cid, name, cat, unit, desc in cur.execute("SELECT id, name, category, unit, description FROM prices_crop").fetchall():
        if name in existing:
            continue
        objs.append(Crop(id=cid, name=name, category=cat or 'grain', unit=unit or 'kg', description=desc or ''))
    Crop.objects.bulk_create(objs, batch_size=500)
    print(f"  Crops: {len(objs)} migrated")


def migrate_prices(conn):
    cur = conn.cursor()
    crops = set(Crop.objects.values_list('pk', flat=True))
    markets = set(Market.objects.values_list('pk', flat=True))
    users = set(User.objects.values_list('pk', flat=True))
    existing = set(PriceEntry.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute(
            "SELECT id, crop_id, market_id, price, quantity, submitted_by_id, submitted_at, price_date, is_anomaly, anomaly_score, anomaly_reason, status, reviewed_by_id, reviewed_at FROM prices_priceentry").fetchall():
        pid, crop_id, market_id = row[0], row[1], row[2]
        if pid in existing or crop_id not in crops or market_id not in markets:
            continue
        submitted_by_id = row[5] if row[5] in users else None
        reviewed_by_id = row[12] if row[12] in users else None
        objs.append(PriceEntry(
            id=pid, crop_id=crop_id, market_id=market_id, price=row[3], quantity=row[4],
            submitted_by_id=submitted_by_id, submitted_at=row[6], price_date=row[7],
            is_anomaly=bool(row[8]), anomaly_score=row[9], anomaly_reason=row[10] or '',
            status=row[11] or 'approved', reviewed_by_id=reviewed_by_id, reviewed_at=row[13],
        ))
        if len(objs) >= 2000:
            PriceEntry.objects.bulk_create(objs, batch_size=2000)
            objs = []
    if objs:
        PriceEntry.objects.bulk_create(objs, batch_size=2000)
    print(f"  Prices: migrated (bulk)")


def migrate_region_routes(conn):
    cur = conn.cursor()
    regions = set(Region.objects.values_list('pk', flat=True))
    existing = set(RegionRoute.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, from_region_id, to_region_id, distance_km, road_type, corridor, condition_factor, avg_speed_kmh, is_bidirectional FROM prices_regionroute").fetchall():
        if row[0] in existing or row[1] not in regions or row[2] not in regions:
            continue
        objs.append(RegionRoute(
            id=row[0], from_region_id=row[1], to_region_id=row[2], distance_km=row[3],
            road_type=row[4] or 'trunk', corridor=row[5] or 'none',
            condition_factor=row[6] if row[6] is not None else 1.0,
            avg_speed_kmh=row[7] if row[7] is not None else 60.0,
            is_bidirectional=bool(row[8]) if row[8] is not None else True,
        ))
    RegionRoute.objects.bulk_create(objs, batch_size=500)
    print(f"  RegionRoutes: {len(objs)} migrated")


def migrate_pricing_rules(conn):
    cur = conn.cursor()
    existing = set(PricingRule.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, vehicle_type, base_rate_per_km, vehicle_multiplier, fuel_multiplier, min_charge, large_cargo_threshold_kg, large_cargo_discount FROM prices_pricingrule").fetchall():
        if row[0] in existing:
            continue
        objs.append(PricingRule(
            id=row[0], vehicle_type=row[1], base_rate_per_km=row[2] if row[2] is not None else 200,
            vehicle_multiplier=row[3] if row[3] is not None else 1.0,
            fuel_multiplier=row[4] if row[4] is not None else 1.0,
            min_charge=row[5] if row[5] is not None else 5000,
            large_cargo_threshold_kg=row[6] if row[6] is not None else 5000,
            large_cargo_discount=row[7] if row[7] is not None else 0.9,
        ))
    PricingRule.objects.bulk_create(objs, batch_size=500)
    print(f"  PricingRules: {len(objs)} migrated")


def migrate_user_preferences(conn):
    cur = conn.cursor()
    users = set(User.objects.values_list('pk', flat=True))
    existing = set(UserPreferences.objects.values_list('user_id', flat=True))
    objs = []
    for row in cur.execute("SELECT id, user_id, price_alerts, market_updates, sms_notifications, email_notifications, language, notifications_enabled, opportunity_alerts, transport_alerts, personalized_alerts FROM prices_userpreferences").fetchall():
        if row[1] not in users or row[1] in existing:
            continue
        objs.append(UserPreferences(
            id=row[0], user_id=row[1],
            price_alerts=bool(row[2]) if row[2] is not None else True,
            market_updates=bool(row[3]) if row[3] is not None else True,
            sms_notifications=bool(row[4]) if row[4] is not None else False,
            email_notifications=bool(row[5]) if row[5] is not None else True,
            language=row[6] or 'en',
            notifications_enabled=bool(row[7]) if row[7] is not None else True,
            opportunity_alerts=bool(row[8]) if row[8] is not None else True,
            transport_alerts=bool(row[9]) if row[9] is not None else True,
            personalized_alerts=bool(row[10]) if row[10] is not None else True,
        ))
    UserPreferences.objects.bulk_create(objs, batch_size=500)
    print(f"  UserPreferences: {len(objs)} migrated")


def migrate_notifications(conn):
    cur = conn.cursor()
    users = set(User.objects.values_list('pk', flat=True))
    existing = set(Notification.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, user_id, type, priority, title, message, region, crop, read, created_at, sms_sent, whatsapp_sent, delivery_attempted FROM prices_notification").fetchall():
        if row[0] in existing or row[1] not in users:
            continue
        objs.append(Notification(
            id=row[0], user_id=row[1], type=row[2] or 'system', priority=row[3] or 'medium',
            title=row[4] or '', message=row[5] or '', region=row[6] or '', crop=row[7],
            read=bool(row[8]) if row[8] is not None else False, created_at=row[9],
            sms_sent=bool(row[10]) if row[10] is not None else False,
            whatsapp_sent=bool(row[11]) if row[11] is not None else False,
            delivery_attempted=row[12],
        ))
    Notification.objects.bulk_create(objs, batch_size=500)
    print(f"  Notifications: {len(objs)} migrated")


def migrate_crop_calendars(conn):
    cur = conn.cursor()
    crops = set(Crop.objects.values_list('pk', flat=True))
    regions = set(Region.objects.values_list('pk', flat=True))
    existing = set(CropCalendar.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, crop_id, region_id, season_name, planting_start, planting_end, harvest_start, harvest_end, notes, source FROM prices_cropcalendar").fetchall():
        if row[0] in existing or row[1] not in crops:
            continue
        objs.append(CropCalendar(
            id=row[0], crop_id=row[1], region_id=row[2] if row[2] in regions else None,
            season_name=row[3] or '', planting_start=row[4], planting_end=row[5],
            harvest_start=row[6], harvest_end=row[7], notes=row[8] or '', source=row[9] or '',
        ))
    CropCalendar.objects.bulk_create(objs, batch_size=500)
    print(f"  CropCalendars: {len(objs)} migrated")


def migrate_sync_sources(conn):
    cur = conn.cursor()
    existing = set(SyncSource.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, name, slug, scraper_command, update_interval_seconds, is_active, last_sync_at, last_status, last_items_found, last_items_imported, created_at, updated_at FROM prices_syncsource").fetchall():
        if row[0] in existing:
            continue
        objs.append(SyncSource(
            id=row[0], name=row[1], slug=row[2], scraper_command=row[3] or '',
            update_interval_seconds=row[4] if row[4] is not None else 86400,
            is_active=bool(row[5]) if row[5] is not None else True, last_sync_at=row[6],
            last_status=row[7] or 'never', last_items_found=row[8] or 0,
            last_items_imported=row[9] or 0, created_at=row[10], updated_at=row[11],
        ))
    SyncSource.objects.bulk_create(objs, batch_size=500)
    print(f"  SyncSources: {len(objs)} migrated")


def migrate_sync_logs(conn):
    cur = conn.cursor()
    sources = set(SyncSource.objects.values_list('pk', flat=True))
    existing = set(SyncLog.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, source_id, started_at, finished_at, status, items_found, items_imported, items_skipped, error_message, details FROM prices_synclog").fetchall():
        if row[0] in existing or row[1] not in sources:
            continue
        details = row[9]
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except Exception:
                details = {}
        objs.append(SyncLog(
            id=row[0], source_id=row[1], started_at=row[2], finished_at=row[3],
            status=row[4] or 'running', items_found=row[5] or 0, items_imported=row[6] or 0,
            items_skipped=row[7] or 0, error_message=row[8] or '', details=details or {},
        ))
    SyncLog.objects.bulk_create(objs, batch_size=500)
    print(f"  SyncLogs: {len(objs)} migrated")


def _bulk_copy(conn, table, model, id_col='id', region_col='region_id'):
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT * FROM {table}")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    except Exception:
        print(f"  {table}: table not found, skipping")
        return
    regions = set(Region.objects.values_list('pk', flat=True))
    existing = set(model.objects.values_list('pk', flat=True))
    objs = []
    for row in rows:
        data = dict(zip(cols, row))
        rid = data.pop(id_col)
        if rid in existing:
            continue
        region_id = data.pop(region_col)
        if region_id not in regions:
            continue
        data = {k: v for k, v in data.items() if v is not None}
        objs.append(model(id=rid, region_id=region_id, **data))
        if len(objs) >= 1000:
            model.objects.bulk_create(objs, batch_size=1000)
            objs = []
    if objs:
        model.objects.bulk_create(objs, batch_size=1000)
    print(f"  {table}: {rowcount(conn, table)} rows processed (bulk)")


def migrate_login_attempts(conn):
    cur = conn.cursor()
    users = set(User.objects.values_list('pk', flat=True))
    existing = set(LoginAttempt.objects.values_list('pk', flat=True))
    objs = []
    for row in cur.execute("SELECT id, user_id, username, ip_address, timestamp, success, attempt_method FROM prices_loginattempt").fetchall():
        if row[0] in existing:
            continue
        objs.append(LoginAttempt(
            id=row[0], user_id=row[1] if row[1] in users else None, username=row[2] or '',
            ip_address=row[3], timestamp=row[4],
            success=bool(row[5]) if row[5] is not None else False,
            attempt_method=row[6] or 'password',
        ))
    LoginAttempt.objects.bulk_create(objs, batch_size=500)
    print(f"  LoginAttempts: {len(objs)} migrated")


def migrate_auth_tokens(conn):
    cur = conn.cursor()
    users = set(User.objects.values_list('pk', flat=True))
    existing = set(Token.objects.values_list('key', flat=True))
    objs = []
    for key, user_id, created_at in cur.execute("SELECT key, user_id, created FROM authtoken_token").fetchall():
        if key in existing or user_id not in users:
            continue
        t = Token(key=key, user_id=user_id)
        if created_at:
            t.created = created_at
        objs.append(t)
    Token.objects.bulk_create(objs, batch_size=500)
    print(f"  AuthTokens: {len(objs)} migrated")


def main():
    print("=" * 50)
    print("Migrating SQLite data to Neon PostgreSQL")
    print(f"Target DB engine: {connection.vendor} ({connection.settings_dict['NAME']})")
    print("=" * 50)

    conn = get_sqlite_conn()

    print("\nMigrating reference data...")
    migrate_regions(conn)
    migrate_markets(conn)
    migrate_crops(conn)

    print("\nMigrating users...")
    migrate_users(conn)
    migrate_profiles(conn)
    migrate_user_preferences(conn)
    migrate_auth_tokens(conn)

    print("\nMigrating price entries...")
    migrate_prices(conn)

    print("\nMigrating transport data...")
    migrate_region_routes(conn)
    migrate_pricing_rules(conn)

    print("\nMigrating calendars / notifications / sync / weather...")
    migrate_crop_calendars(conn)
    migrate_notifications(conn)
    migrate_sync_sources(conn)
    migrate_sync_logs(conn)
    _bulk_copy(conn, 'prices_weatherdata', WeatherData)
    _bulk_copy(conn, 'prices_hourlyweatherdata', HourlyWeatherData)
    migrate_login_attempts(conn)

    conn.close()

    print("\n" + "=" * 50)
    print("Migration complete! Verifying...")
    print("=" * 50)
    print(f"  Users: {User.objects.count()}")
    print(f"  Profiles: {UserProfile.objects.count()}")
    print(f"  Regions: {Region.objects.count()}")
    print(f"  Markets: {Market.objects.count()}")
    print(f"  Crops: {Crop.objects.count()}")
    print(f"  Prices: {PriceEntry.objects.count()}")
    print(f"  Routes: {RegionRoute.objects.count()}")
    print(f"  Pricing: {PricingRule.objects.count()}")
    print(f"  Weather: {WeatherData.objects.count()}")
    print(f"  HourlyWeather: {HourlyWeatherData.objects.count()}")
    print(f"  Notifications: {Notification.objects.count()}")
    print(f"  Calendars: {CropCalendar.objects.count()}")
    print(f"  Tokens: {Token.objects.count()}")
    print("\nDone!")


if __name__ == '__main__':
    main()
