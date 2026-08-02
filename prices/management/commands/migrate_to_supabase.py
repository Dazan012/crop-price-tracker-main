"""
Migrate all data from SQLite to Supabase via REST API.
Usage: python manage.py migrate_to_supabase
"""
import os
import json
import sys
import sqlite3
from datetime import datetime, date

import httpx
from django.core.management.base import BaseCommand
from django.conf import settings


SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_KEY = settings.SUPABASE_ANON_KEY
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}
DB_PATH = os.path.join(settings.BASE_DIR, 'db.sqlite3')


def upsert_batch(table, rows, batch_size=100):
    """Insert rows into Supabase table in batches."""
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    total = 0
    errors = []

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            resp = httpx.post(
                url,
                json=batch,
                headers={**HEADERS, 'Prefer': 'return=minimal,resolution=merge-duplicates'},
                timeout=30,
            )
            if resp.status_code in (200, 201):
                total += len(batch)
            else:
                errors.append(f'{table} batch {i}: {resp.status_code} {resp.text[:200]}')
        except Exception as e:
            errors.append(f'{table} batch {i}: {str(e)[:200]}')

    return total, errors


class Command(BaseCommand):
    help = 'Migrate all data from SQLite to Supabase via REST API'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show counts without migrating')

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        self.stdout.write(f'Source: {DB_PATH}')
        self.stdout.write(f'Target: {SUPABASE_URL}\n')

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row

        # ── 1. Regions ──
        self.stdout.write('--- Regions ---')
        rows = [dict(r) for r in conn.execute('SELECT id, name, zone FROM prices_region').fetchall()]
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('prices_region', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 2. Crops ──
        self.stdout.write('--- Crops ---')
        rows = [dict(r) for r in conn.execute('SELECT id, name, category, unit, description FROM prices_crop').fetchall()]
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('prices_crop', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 3. Markets ──
        self.stdout.write('--- Markets ---')
        rows = []
        for r in conn.execute('''
            SELECT id, name, region_id, district, ward, location_description,
                   market_type, operating_days, governing_authority, is_active, created_at
            FROM prices_market
        ''').fetchall():
            row = dict(r)
            if row.get('is_active') is not None:
                row['is_active'] = bool(row['is_active'])
            rows.append(row)
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('prices_market', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 4. Auth Users ──
        self.stdout.write('--- Users ---')
        rows = []
        for r in conn.execute('''
            SELECT id, password, last_login, is_superuser, username, first_name,
                   last_name, email, is_staff, is_active, date_joined
            FROM auth_user
        ''').fetchall():
            row = dict(r)
            for bool_field in ['is_superuser', 'is_staff', 'is_active']:
                if row.get(bool_field) is not None:
                    row[bool_field] = bool(row[bool_field])
            rows.append(row)
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('auth_user', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 5. Auth Tokens ──
        self.stdout.write('--- Tokens ---')
        rows = [dict(r) for r in conn.execute('SELECT key, created, user_id FROM authtoken_token').fetchall()]
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('authtoken_token', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 6. User Profiles ──
        self.stdout.write('--- User Profiles ---')
        rows = []
        for r in conn.execute('SELECT * FROM prices_userprofile').fetchall():
            row = dict(r)
            # Convert SQLite integers to booleans
            for bool_field in ['phone_verified', 'email_verified', 'commitment_confirmed',
                               'guidelines_accepted', 'has_transport', 'has_export_licence',
                               'is_officially_appointed', 'earns_commission']:
                if row.get(bool_field) is not None:
                    row[bool_field] = bool(row[bool_field])
            rows.append(row)
        self.stdout.write(f'  Found: {len(rows)}')
        if not dry_run and rows:
            count, errs = upsert_batch('prices_userprofile', rows)
            self.stdout.write(f'  Inserted: {count}')
            for e in errs:
                self.stderr.write(f'  ERROR: {e}')

        # ── 7. Price Entries (largest table) ──
        self.stdout.write('--- Price Entries ---')
        total_prices = conn.execute('SELECT COUNT(*) FROM prices_priceentry').fetchone()[0]
        self.stdout.write(f'  Found: {total_prices}')

        if not dry_run and total_prices > 0:
            BATCH = 200
            offset = 0
            total_inserted = 0
            all_errors = []

            while offset < total_prices:
                rows = []
                for r in conn.execute(
                    f'SELECT * FROM prices_priceentry LIMIT {BATCH} OFFSET {offset}'
                ).fetchall():
                    row = dict(r)
                    if row.get('is_anomaly') is not None:
                        row['is_anomaly'] = bool(row['is_anomaly'])
                    # Parse segment_data JSON if it's a string
                    if isinstance(row.get('segment_data'), str):
                        try:
                            row['segment_data'] = json.loads(row['segment_data'])
                        except (json.JSONDecodeError, TypeError):
                            row['segment_data'] = {}
                    rows.append(row)

                count, errs = upsert_batch('prices_priceentry', rows, batch_size=BATCH)
                total_inserted += count
                all_errors.extend(errs)
                offset += BATCH
                self.stdout.write(f'  Progress: {min(offset, total_prices)}/{total_prices} ({total_inserted} inserted)')

            self.stdout.write(f'  Total inserted: {total_inserted}')
            for e in all_errors[:5]:
                self.stderr.write(f'  ERROR: {e}')
            if len(all_errors) > 5:
                self.stderr.write(f'  ... and {len(all_errors) - 5} more errors')

        # ── 8. Transport Routes ──
        self.stdout.write('--- Transport Routes ---')
        try:
            rows = [dict(r) for r in conn.execute('SELECT * FROM prices_transportroute').fetchall()]
            self.stdout.write(f'  Found: {len(rows)}')
            if not dry_run and rows:
                count, errs = upsert_batch('prices_transportroute', rows)
                self.stdout.write(f'  Inserted: {count}')
        except Exception:
            self.stdout.write('  Table not found, skipping')

        # ── 9. Price Alerts ──
        self.stdout.write('--- Price Alerts ---')
        try:
            rows = []
            for r in conn.execute('SELECT * FROM prices_pricealert').fetchall():
                row = dict(r)
                if row.get('is_active') is not None:
                    row['is_active'] = bool(row['is_active'])
                rows.append(row)
            self.stdout.write(f'  Found: {len(rows)}')
            if not dry_run and rows:
                count, errs = upsert_batch('prices_pricealert', rows)
                self.stdout.write(f'  Inserted: {count}')
        except Exception:
            self.stdout.write('  Table not found, skipping')

        # ── 10. Agent Submissions ──
        self.stdout.write('--- Agent Submissions ---')
        try:
            rows = [dict(r) for r in conn.execute('SELECT * FROM prices_marketagentsubmission').fetchall()]
            self.stdout.write(f'  Found: {len(rows)}')
            if not dry_run and rows:
                count, errs = upsert_batch('prices_marketagentsubmission', rows)
                self.stdout.write(f'  Inserted: {count}')
        except Exception:
            self.stdout.write('  Table not found, skipping')

        conn.close()
        self.stdout.write(self.style.SUCCESS('\nMigration complete!'))
