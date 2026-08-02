"""
Sync all external data sources to the database.

Detects new items, downloads them, and imports only what's new.
Tracks state via SyncLog for dedup.

Usage:
    python manage.py sync_all_data
    python manage.py sync_all_data --source kilimo
    python manage.py sync_all_data --source viwanda --dry-run
"""
import os
import json
import subprocess
import sys
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command
from django.utils import timezone
from django.db import transaction

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))))

os.environ['RUN_NOTIFICATION_ENGINE_SKIP'] = '1'

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))

KILIMO_JSON = os.path.join(BASE_DIR, 'kilimo_pdfs', 'all_crop_data.json')
VIWANDA_JSON = os.path.join(BASE_DIR, 'prices', 'viwanda_prices.json')


class Command(BaseCommand):
    help = 'Sync all external data sources — detect new items, download, import'

    def add_arguments(self, parser):
        parser.add_argument('--source', help='Sync only this source (slug)')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be synced without importing')
        parser.add_argument('--force', action='store_true',
                            help='Force sync even if not enough time has passed')

    def handle(self, *args, **options):
        from prices.models import SyncSource, SyncLog, PriceEntry, Market, Region, Crop

        sources = SyncSource.objects.filter(is_active=True)
        if options.get('source'):
            sources = sources.filter(slug=options['source'])

        dry_run = options.get('dry_run', False)
        force = options.get('force', False)
        total_imported = 0

        for source in sources:
            if not force and source.last_sync_at:
                elapsed = (timezone.now() - source.last_sync_at).total_seconds()
                if elapsed < source.update_interval_seconds:
                    remaining = int(source.update_interval_seconds - elapsed)
                    self.stdout.write(f'  SKIP {source.name}: last sync {remaining}s ago (interval {source.update_interval_seconds}s)')
                    continue

            self.stdout.write(f'\n{"="*60}')
            self.stdout.write(f'SYNC: {source.name} ({source.slug})')
            self.stdout.write(f'{"="*60}')

            if dry_run:
                log = None
            else:
                log = SyncLog.objects.create(source=source)

            try:
                if source.slug == 'kilimo':
                    imported = self._sync_kilimo(source, log or SyncLog(source=source), dry_run)
                elif source.slug == 'viwanda':
                    imported = self._sync_viwanda(source, log or SyncLog(source=source), dry_run)
                elif source.slug in ('coffee-board', 'tobacco-board', 'other-boards'):
                    imported = self._sync_boards(source, log or SyncLog(source=source), dry_run)
                else:
                    self.stdout.write(f'  Unknown source slug: {source.slug}')
                    imported = 0

                if log:
                    log.status = 'success'
                    log.items_imported = imported
                    source.last_status = 'success'
                    source.last_items_imported = imported
                total_imported += imported

            except Exception as e:
                self.stderr.write(f'  ERROR syncing {source.name}: {e}')
                if log:
                    log.status = 'failed'
                    log.error_message = str(e)
                    source.last_status = 'failed'
                    import traceback
                    log.details['traceback'] = traceback.format_exc()

            if log:
                log.finished_at = timezone.now()
                log.save()
                source.last_sync_at = timezone.now()
                source.save()

            if log:
                self.stdout.write(f'  -> {log.status}: {log.items_imported} imported')
            else:
                self.stdout.write(f'  -> dry-run: would import {imported} items')

        self.stdout.write(self.style.SUCCESS(f'\nSync complete. {total_imported} total new items imported.'))

    def _run_scraper(self, source):
        """Run the external scraper script via subprocess."""
        cmd = ['python', source.scraper_command.split()]
        cmd = ['python'] + source.scraper_command.split()
        self.stdout.write(f'  Running: {" ".join(cmd)}')
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise CommandError(f'Scraper failed:\n{result.stderr[:500]}')
        return result.stdout

    def _get_seen_urls(self, source):
        """Get set of previously synced URL hashes from last successful sync log."""
        from prices.models import SyncLog
        last_success = SyncLog.objects.filter(
            source=source, status='success'
        ).order_by('-started_at').first()
        if last_success and 'seen_urls' in last_success.details:
            return set(last_success.details['seen_urls'])
        return set()

    def _sync_kilimo(self, source, log, dry_run):
        from prices.models import SyncLog, PriceEntry, Market, Region, Crop

        seen = self._get_seen_urls(source)

        if not dry_run:
            self._run_scraper(source)

        if not os.path.exists(KILIMO_JSON):
            self.stdout.write('  No kilimo JSON found')
            return 0

        with open(KILIMO_JSON, 'r') as f:
            data = json.load(f)

        bulletins = data.get('data', [])
        new_bulletins = [b for b in bulletins if b.get('url', '') not in seen]
        old_count = len(bulletins) - len(new_bulletins)

        log.items_found = len(bulletins)
        log.items_skipped = old_count

        if not new_bulletins:
            self.stdout.write(f'  No new bulletins ({old_count} already synced)')
            log.details['seen_urls'] = list(seen)
            return 0

        self.stdout.write(f'  {len(new_bulletins)} new bulletins, {old_count} already synced')

        if dry_run:
            for b in new_bulletins[:5]:
                self.stdout.write(f'    Would import: {b.get("period", "?")} ({b.get("file", "?")})')
            if len(new_bulletins) > 5:
                self.stdout.write(f'    ... and {len(new_bulletins)-5} more')
            log.details['seen_urls'] = list(seen | {b['url'] for b in new_bulletins})
            return len(new_bulletins)

        # Import via the existing import command
        call_command('import_scraped_prices', kilimo_only=True, verbosity=0)

        # Update seen URLs
        new_urls = {b['url'] for b in data.get('data', []) if b.get('url')}
        log.details['seen_urls'] = list(seen | new_urls)

        return len(new_bulletins)

    def _sync_viwanda(self, source, log, dry_run):
        from prices.models import SyncLog

        seen = self._get_seen_urls(source)

        if not dry_run:
            self._run_scraper(source)

        if not os.path.exists(VIWANDA_JSON):
            self.stdout.write('  No viwanda JSON found')
            return 0

        with open(VIWANDA_JSON, 'r') as f:
            data = json.load(f)

        pdfs = data.get('data', [])
        new_pdfs = [p for p in pdfs if p.get('url', '') not in seen]
        old_count = len(pdfs) - len(new_pdfs)

        log.items_found = len(pdfs)
        log.items_skipped = old_count

        if not new_pdfs:
            self.stdout.write(f'  No new PDFs ({old_count} already synced)')
            log.details['seen_urls'] = list(seen)
            return 0

        self.stdout.write(f'  {len(new_pdfs)} new PDFs, {old_count} already synced')

        if dry_run:
            for p in new_pdfs[:5]:
                self.stdout.write(f'    Would import: {p.get("file", "?")}')
            log.details['seen_urls'] = list(seen | {p['url'] for p in new_pdfs})
            return len(new_pdfs)

        call_command('import_scraped_prices', viwanda_only=True,
                     viwanda_file=VIWANDA_JSON, verbosity=0)

        new_urls = {p['url'] for p in pdfs if p.get('url')}
        log.details['seen_urls'] = list(seen | new_urls)

        return len(new_pdfs)

    def _sync_boards(self, source, log, dry_run):
        from prices.models import SyncLog

        seen = self._get_seen_urls(source)

        if not dry_run:
            self._run_scraper(source)

        board_dir = os.path.join(BASE_DIR, 'kilimo_pdfs', 'crop_board_data')
        all_pdf_urls = set()
        total_new = 0

        for fname in os.listdir(board_dir):
            if not fname.endswith('.json') or fname == 'all_boards.json':
                continue
            fpath = os.path.join(board_dir, fname)
            with open(fpath, 'r') as f:
                board_data = json.load(f)

            pdfs = board_data.get('pdf_urls', [])
            all_pdf_urls.update(pdfs)
            new_pdfs = [u for u in pdfs if u not in seen]
            if new_pdfs:
                total_new += len(new_pdfs)
                if not dry_run:
                    self.stdout.write(f'  {board_data.get("board","")}: {len(new_pdfs)} new PDFs')

        log.items_found = len(all_pdf_urls)
        log.items_skipped = len(all_pdf_urls) - total_new
        log.details['seen_urls'] = list(seen | all_pdf_urls)

        self.stdout.write(f'  Total: {len(all_pdf_urls)} PDFs ({total_new} new, {log.items_skipped} already seen)')
        return total_new
