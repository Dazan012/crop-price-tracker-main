#!/usr/bin/env bash
# ============================================================
# Smart Crops Notification Engine — Linux Cron Schedule
# ============================================================
# Install on your production server:
#   chmod +x notification_cron.sh
#   crontab -e
#
# Add these lines:
#   */10 * * * * /path/to/project/notification_cron.sh opportunity >> /var/log/smartcrops-notif.log 2>&1
#   */30 * * * * /path/to/project/notification_cron.sh price >> /var/log/smartcrops-notif.log 2>&1
#   0 * * * *    /path/to/project/notification_cron.sh transport >> /var/log/smartcrops-notif.log 2>&1
#   0 * * * *    /path/to/project/notification_cron.sh personalized >> /var/log/smartcrops-notif.log 2>&1
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$PROJECT_DIR/venv/bin/python"
MANAGE="$PROJECT_DIR/manage.py"

MODE="${1:-all}"

echo "[$(date -Iseconds)] Notification engine starting (mode=$MODE)..."
"$PYTHON" "$MANAGE" run_notification_engine --mode="$MODE"
echo "[$(date -Iseconds)] Notification engine finished (mode=$MODE)."
