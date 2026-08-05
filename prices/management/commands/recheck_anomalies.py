"""
Re-run anomaly detection over existing price entries in the database.

Bulk-imported and scraped prices are stored with is_anomaly=False and
status='approved' without ever going through the detection pipeline
(which only runs in the submit_price view). This command re-evaluates
those entries using the same combined Z-score + IQR detector.

By default it only updates the anomaly flags (is_anomaly, anomaly_score,
anomaly_reason) and leaves the entry status untouched. Pass --apply-status
to also mirror the submit_price validation pipeline and set status to
approved/flagged/rejected based on the Z-score.

Writes are batched with bulk_update and the DB connection is recycled
between batches so a dropped connection (e.g. flaky network to Neon)
does not abort the whole run.

Usage:
    python manage.py recheck_anomalies                     # scan everything, update flags only
    python manage.py recheck_anomalies --apply-status      # also update approval status
    python manage.py recheck_anomalies --dry-run           # preview without writing
    python manage.py recheck_anomalies --crop "Maize"      # scan one crop
    python manage.py recheck_anomalies --limit 500         # scan only the latest N entries
    python manage.py recheck_anomalies --exclude-reviewed  # skip entries already reviewed
    python manage.py recheck_anomalies --require-postgres  # abort unless connected to Postgres (avoids writing to SQLite fallback)
"""
from collections import defaultdict
from bisect import bisect_left
from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections, connections
from django.db.utils import OperationalError

BATCH_SIZE = 500
MAX_RETRIES = 3


class Command(BaseCommand):
    help = 'Re-run Z-score + IQR anomaly detection over existing price entries'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would change without writing to DB')
        parser.add_argument('--apply-status', action='store_true',
                            help='Also update entry status using the submit_price pipeline (approved/flagged/rejected)')
        parser.add_argument('--exclude-reviewed', action='store_true',
                            help='Skip entries that already have a reviewer assigned')
        parser.add_argument('--crop', help='Only recheck entries for this crop name')
        parser.add_argument('--limit', type=int, help='Only recheck the most recent N entries')
        parser.add_argument('--lookback-days', type=int, default=30,
                            help='Historical window in days used for detection (default: 30)')
        parser.add_argument('--require-postgres', action='store_true',
                            help='Abort unless connected to PostgreSQL (avoids writing to the SQLite fallback)')

    def _flush(self, to_update, dry_run):
        """Persist a batch of changed entries, recovering from dropped connections."""
        from prices.models import PriceEntry
        if not to_update:
            return 0, 0
        if dry_run:
            return len(to_update), 0

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                PriceEntry.objects.bulk_update(
                    to_update,
                    fields=['is_anomaly', 'anomaly_score', 'anomaly_reason', 'status'],
                    batch_size=BATCH_SIZE,
                )
                return len(to_update), 0
            except OperationalError:
                self.stderr.write(f'  connection dropped, retrying batch ({attempt}/{MAX_RETRIES})')
                close_old_connections()
                connections['default'].close()
                if attempt == MAX_RETRIES:
                    return 0, len(to_update)

        return 0, len(to_update)

    def handle(self, *args, **options):
        from prices.models import PriceEntry
        from prices.utils import detect_anomaly, calculate_z_score

        dry_run = options['dry_run']
        apply_status = options['apply_status']
        exclude_reviewed = options['exclude_reviewed']
        crop_name = options['crop']
        limit = options['limit']
        lookback_days = options['lookback_days']
        require_postgres = options['require_postgres']

        conn = connections['default']
        self.stdout.write(
            f'Target database: {conn.vendor} | {conn.settings_dict.get("NAME")}'
            + (f' | {conn.settings_dict.get("HOST")}' if conn.vendor == 'postgresql' else ''))
        if require_postgres and conn.vendor != 'postgresql':
            raise CommandError(
                'Not connected to PostgreSQL (using SQLite fallback). '
                'Aborting as requested by --require-postgres. Retry when Neon is reachable.')

        qs = PriceEntry.objects.select_related('crop', 'market')
        if crop_name:
            qs = qs.filter(crop__name__iexact=crop_name)
        if exclude_reviewed:
            qs = qs.filter(reviewed_by__isnull=True)
        if limit:
            qs = qs.order_by('-price_date', '-submitted_at')[:limit]

        try:
            entries = list(qs)
        except OperationalError:
            close_old_connections()
            entries = list(qs)
        total = len(entries)
        self.stdout.write(f'Loaded {total} price entries for recheck.')

        # Group by crop, sorted oldest first, mirroring submit_price which
        # builds history per crop from approved entries in the last N days.
        by_crop = defaultdict(list)
        for e in entries:
            by_crop[e.crop_id].append(e)
        for group in by_crop.values():
            group.sort(key=lambda e: (e.price_date, e.submitted_at))

        updated = 0
        newly_flagged = 0
        newly_cleared = 0
        status_changed = 0
        errors = 0
        to_update = []

        for crop_id, group in by_crop.items():
            # Rolling history of approved prices for this crop, kept date-sorted
            # so each entry's 30-day window can be sliced with binary search.
            hist_dates = []
            hist_prices = []

            for e in group:
                cutoff = e.price_date - timedelta(days=lookback_days)
                lo = bisect_left(hist_dates, cutoff)
                hi = bisect_left(hist_dates, e.price_date)
                historical = hist_prices[lo:hi]

                if len(historical) < 3:
                    # Keep existing flags, still normalize reason for readability
                    is_anomaly, score, reason = False, 0.0, 'Insufficient historical data for validation'
                else:
                    is_anomaly, score, reason = detect_anomaly(
                        new_price=e.price,
                        crop_name=e.crop.name,
                        market_id=e.market_id,
                        historical_prices=historical,
                    )
                    z_score = abs(calculate_z_score(e.price, historical))
                    reason = f'{reason} | Z-score: {z_score:.2f}'

                new_status = e.status
                if apply_status:
                    # Mirror the submit_price validation pipeline.
                    if len(historical) < 3:
                        new_status = 'flagged'
                    else:
                        z_score = abs(calculate_z_score(e.price, historical))
                        mean_price = sum(historical) / len(historical)
                        pct_deviation = abs(e.price - mean_price) / mean_price * 100 if mean_price > 0 else 0.0
                        if e.price <= 0 or z_score > 3.0 or pct_deviation > 100:
                            new_status = 'rejected'
                        elif is_anomaly or pct_deviation > 50:
                            new_status = 'flagged'
                        else:
                            new_status = 'approved'

                # Feed history for later entries (only approved count, mirroring submit_price)
                if new_status == 'approved':
                    hist_dates.append(e.price_date)
                    hist_prices.append(e.price)

                changed = (
                    e.is_anomaly != is_anomaly or
                    e.anomaly_score != score or
                    e.anomaly_reason != reason or
                    e.status != new_status
                )
                if not changed:
                    continue

                if e.is_anomaly != is_anomaly:
                    if is_anomaly:
                        newly_flagged += 1
                    else:
                        newly_cleared += 1
                if e.status != new_status:
                    status_changed += 1

                e.is_anomaly = is_anomaly
                e.anomaly_score = score
                e.anomaly_reason = reason
                e.status = new_status
                to_update.append(e)

                if len(to_update) >= BATCH_SIZE:
                    done, failed = self._flush(to_update, dry_run)
                    updated += done
                    errors += failed
                    to_update = []
                    close_old_connections()

        if to_update:
            done, failed = self._flush(to_update, dry_run)
            updated += done
            errors += failed

        verb = 'would be' if dry_run else 'were'
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {updated} entries {verb} updated '
            f'({newly_flagged} newly flagged, {newly_cleared} cleared, '
            f'{status_changed} status changes), {errors} errors.'))

        if not dry_run:
            try:
                flagged_total = PriceEntry.objects.filter(is_anomaly=True).count()
            except OperationalError:
                close_old_connections()
                flagged_total = PriceEntry.objects.filter(is_anomaly=True).count()
            self.stdout.write(self.style.SUCCESS(
                f'Total entries now flagged as anomalies: {flagged_total}'))
