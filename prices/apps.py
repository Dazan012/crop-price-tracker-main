import os
import sys
import logging
from django.apps import AppConfig

logger = logging.getLogger('prices')


class PricesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'prices'

    def ready(self):
        if os.environ.get('RUN_NOTIFICATION_ENGINE_SKIP'):
            return
        is_manage_cmd = (
            len(sys.argv) > 1
            and sys.argv[0].endswith('manage.py')
            and sys.argv[1] != 'runserver'
        )
        is_manage_shell = sys.argv[0].endswith('django-admin.py') or sys.argv[0].endswith('django-admin')
        if is_manage_cmd or is_manage_shell:
            return
        try:
            from .notification_scheduler import start_scheduler, start_sync_scheduler
            start_scheduler()
            start_sync_scheduler()
            logger.info('Notification + Sync schedulers initialized.')
        except Exception as e:
            logger.warning(f'Failed to start schedulers: {e}')

