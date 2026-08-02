"""
Notification Scheduler — runs the trigger engine automatically in the background.

Uses Python's built-in threading (no external dependencies like APScheduler or Celery).
Starts when Django boots up via AppConfig.ready().

Schedule:
  - Opportunity alerts:  every 10 minutes
  - Price movement:      every 30 minutes
  - Transport + Personal: every 60 minutes
"""

import threading
import time
import logging
import os

logger = logging.getLogger('prices.notification_scheduler')

# ── Schedule config (seconds) ──
SCHEDULE = {
    'opportunity': 10 * 60,      # every 10 min
    'price': 30 * 60,            # every 30 min
    'transport': 60 * 60,        # every 60 min
    'personalized': 60 * 60,     # every 60 min
    'weather': 60 * 60,          # every 60 min
}

# Guard to prevent double-start during development (auto-reload)
_started = False
_lock = threading.Lock()


def _run_engine(mode):
    """Run a single notification engine mode via Django management command."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            from django.core.management import call_command
            call_command('run_notification_engine', mode=mode, verbosity=0)
            logger.info(f'Notification engine [{mode}] completed.')
            return
        except Exception as e:
            err_msg = str(e).lower()
            if 'database is locked' in err_msg or 'database disk image is malformed' in err_msg:
                wait = 2 ** (attempt + 1)
                logger.warning(f'Notification engine [{mode}] DB locked, retrying in {wait}s (attempt {attempt+1}/{max_retries})')
                time.sleep(wait)
            else:
                logger.error(f'Notification engine [{mode}] failed: {e}')
                return
    logger.error(f'Notification engine [{mode}] failed after {max_retries} retries')


def _scheduler_loop(mode, interval_sec, stop_event):
    """Run engine mode on a loop with the given interval."""
    # Initial delay to let Django fully boot
    time.sleep(30)

    while not stop_event.is_set():
        _run_engine(mode)
        # Sleep in small increments so we can respond to stop quickly
        elapsed = 0
        while elapsed < interval_sec and not stop_event.is_set():
            time.sleep(min(10, interval_sec - elapsed))
            elapsed += 10


def start_scheduler():
    """Start background scheduler threads. Safe to call multiple times (idempotent)."""
    global _started

    # Don't start in management commands or tests — only in runserver/wsgi
    if os.environ.get('RUN_NOTIFICATION_ENGINE_SKIP'):
        return

    with _lock:
        if _started:
            return
        _started = True

    stop_event = threading.Event()

    for mode, interval in SCHEDULE.items():
        t = threading.Thread(
            target=_scheduler_loop,
            args=(mode, interval, stop_event),
            name=f'notif-{mode}',
            daemon=True,
        )
        t.start()

    logger.info(f'Notification scheduler started: {list(SCHEDULE.keys())}')

# ── Sync Scheduler ──────────────────────────────────────────────

_sync_started = False
_sync_lock = threading.Lock()

SYNC_CHECK_INTERVAL = 300  # how often to check if any source needs sync (5 min)


def _run_sync(source_slug=None):
    """Run sync_all_data management command for all or one source."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            from django.core.management import call_command
            kwargs = {'verbosity': 1, 'dry_run': False, 'force': True}
            if source_slug:
                kwargs['source'] = source_slug
            call_command('sync_all_data', **kwargs)
            logger.info(f'Sync completed{" for " + source_slug if source_slug else ""}.')
            return
        except Exception as e:
            err_msg = str(e).lower()
            if 'database is locked' in err_msg or 'database disk image is malformed' in err_msg:
                wait = 2 ** (attempt + 1)
                logger.warning(f'Sync DB locked, retrying in {wait}s (attempt {attempt+1}/{max_retries})')
                time.sleep(wait)
            else:
                logger.error(f'Sync failed: {e}')
                return
    logger.error(f'Sync failed after {max_retries} retries')


def _sync_scheduler_loop(stop_event):
    """Check each source's schedule and run sync when due."""
    time.sleep(30)

    while not stop_event.is_set():
        try:
            from prices.models import SyncSource
            from django.utils import timezone

            now = timezone.now()
            for source in SyncSource.objects.filter(is_active=True):
                if source.last_sync_at:
                    elapsed = (now - source.last_sync_at).total_seconds()
                    if elapsed < source.update_interval_seconds:
                        continue
                _run_sync(source.slug)
        except Exception as e:
            logger.error(f'Sync scheduler check failed: {e}')

        elapsed = 0
        while elapsed < SYNC_CHECK_INTERVAL and not stop_event.is_set():
            time.sleep(min(10, SYNC_CHECK_INTERVAL - elapsed))
            elapsed += 10


def start_sync_scheduler():
    """Start background sync scheduler thread."""
    global _sync_started

    if os.environ.get('RUN_NOTIFICATION_ENGINE_SKIP'):
        return

    with _sync_lock:
        if _sync_started:
            return
        _sync_started = True

    stop_event = threading.Event()

    t = threading.Thread(
        target=_sync_scheduler_loop,
        args=(stop_event,),
        name='sync-scheduler',
        daemon=True,
    )
    t.start()
    logger.info('Sync scheduler started (checking every 300s).')
