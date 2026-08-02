import os
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger('prices')

NOTIFY_BASE_URL = os.getenv('NOTIFY_BASE_URL', 'https://api.notify.africa').rstrip('/')
WHATSAPP_KEY = os.getenv('NOTIFY_WHATSAPP_KEY', '').strip()
SMS_KEY = os.getenv('NOTIFY_SMS_KEY', '').strip()


def _deliver(url, payload, token):
    """Low-level HTTP POST to Notify Africa."""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode('utf-8') or '{}'
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Notify API {exc.code}: {error_body}') from exc


def format_notification_message(notification):
    """Format a Notification instance into a concise SMS/WhatsApp message."""
    type_icons = {
        'price_alert': '🔔',
        'opportunity': '💰',
        'transport': '🚛',
        'system': 'ℹ️',
    }
    icon = type_icons.get(notification.type, '📢')
    return f"{icon} {notification.title}\n{notification.message}"


def send_notification_sms(notification, phone=None):
    """Send a Notification via SMS using Notify Africa."""
    if not SMS_KEY:
        logger.debug('SMS not configured — skipping SMS dispatch')
        return None

    if not phone:
        try:
            profile = notification.user.profile
            phone = profile.phone
        except Exception:
            logger.warning('No phone number available for user %s', notification.user.username)
            return None

    if not phone:
        return None

    api_phone = phone.lstrip('+')
    message = format_notification_message(notification)

    try:
        sms_url = f'{NOTIFY_BASE_URL}/api/v1/api/messages/send'
        payload = {
            'phone_number': api_phone,
            'message': message,
            'sender_id': 'SMARTCROPS',
        }
        result = _deliver(sms_url, payload, SMS_KEY)
        logger.info('SMS sent to %s for notification %s', api_phone, notification.id)
        return {'channel': 'sms', 'status': 'sent', 'provider_response': result}
    except Exception as exc:
        logger.warning('SMS delivery failed for %s: %s', api_phone, exc)
        return {'channel': 'sms', 'status': 'failed', 'error': str(exc)}


def send_notification_whatsapp(notification, phone=None):
    """Send a Notification via WhatsApp using Notify Africa WABA."""
    if not WHATSAPP_KEY:
        logger.debug('WhatsApp not configured — skipping WhatsApp dispatch')
        return None

    if not phone:
        try:
            profile = notification.user.profile
            phone = profile.phone
        except Exception:
            logger.warning('No phone number available for user %s', notification.user.username)
            return None

    if not phone:
        return None

    api_phone = phone.lstrip('+')
    message = format_notification_message(notification)

    try:
        waba_url = 'https://notify-web-assistant-api.beagile.africa/v1/waba-api/messages/text'
        payload = {'to': [api_phone], 'text': message}
        result = _deliver(waba_url, payload, WHATSAPP_KEY)
        logger.info('WhatsApp sent to %s for notification %s', api_phone, notification.id)
        return {'channel': 'whatsapp', 'status': 'sent', 'provider_response': result}
    except Exception as exc:
        logger.warning('WhatsApp delivery failed for %s: %s', api_phone, exc)
        return {'channel': 'whatsapp', 'status': 'failed', 'error': str(exc)}


def deliver_notification(notification):
    """Dispatch a notification via WhatsApp (preferred) then SMS fallback.
    Respects user's notification preferences.
    Updates delivery tracking fields on the notification.
    """
    from django.utils import timezone as tz

    try:
        prefs = notification.user.preferences
    except Exception:
        prefs = None

    results = {'notification_id': notification.id}
    sms_ok = False
    wa_ok = False

    # Check user preferences for SMS
    if prefs and prefs.sms_notifications:
        sms_result = send_notification_sms(notification)
        if sms_result:
            results['sms'] = sms_result
            if sms_result.get('status') == 'sent':
                sms_ok = True

    # WhatsApp — try if key is configured
    if WHATSAPP_KEY:
        wa_result = send_notification_whatsapp(notification)
        if wa_result:
            results['whatsapp'] = wa_result
            if wa_result.get('status') == 'sent':
                wa_ok = True

    # In dev mode with no keys, log the notification
    if not SMS_KEY and not WHATSAPP_KEY:
        logger.info(
            '[DEV] Would send notification #%s: "%s" to %s',
            notification.id,
            format_notification_message(notification),
            notification.user.username,
        )

    # Update delivery tracking
    if sms_ok or wa_ok:
        notification.sms_sent = sms_ok
        notification.whatsapp_sent = wa_ok
        notification.delivery_attempted = tz.now()
        notification.save(update_fields=['sms_sent', 'whatsapp_sent', 'delivery_attempted'])

    return results
