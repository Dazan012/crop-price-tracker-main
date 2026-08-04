from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework import status
from django.http import JsonResponse
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings as django_settings
import os
import numpy as np
from .models import UserProfile, Region, Market, Crop, PriceEntry, MarketAgentSubmission, TransportRoute, PriceAlert, Notification, MagicLink, PhoneVerification, LoginAttempt, WeatherData, HourlyWeatherData
from . import reports
from .serializers import (
    UserSerializer, RegisterSerializer, RegionSerializer,
    MarketSerializer, CropSerializer, PriceEntrySerializer,
    PriceSubmitSerializer, PriceReviewSerializer, AgentApprovalSerializer,
    AgentSubmissionSerializer, AgentSubmissionDetailSerializer,
    AgentSubmissionNoteSerializer, TransportRouteSerializer,
    PriceAlertSerializer, PriceAlertCreateSerializer,
    NotificationSerializer, MarketMatchSerializer, WeatherSerializer, HourlyWeatherSerializer,
)
from django.db.models import Count, Q, Avg, Min, Max, Sum, StdDev, OuterRef, Subquery
from .utils import detect_anomaly, calculate_z_score
from datetime import timedelta
import json
import logging
import urllib.request


# ──────────────────────────── AUTH VIEWS ────────────────────────────

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        role = request.data.get('role', 'general')
        # Agents are pending approval - still give token but flag status
        return Response({
            'message': 'Registration successful' if role != 'agent' else 'Registration submitted. Awaiting admin approval.',
            'token': token.key,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    remember_me = request.data.get('remember_me', False)
    ip_address = request.META.get('REMOTE_ADDR', '')

    if '@' in username:
        try:
            user_by_email = User.objects.get(email__iexact=username)
            username = user_by_email.username
        except User.DoesNotExist:
            pass

    user = authenticate(request, username=username, password=password)

    if user:
        # Check if account is locked
        try:
            profile = user.profile
            if profile.locked_until and profile.locked_until > timezone.now():
                remaining = int((profile.locked_until - timezone.now()).total_seconds() // 60)
                LoginAttempt.objects.create(
                    user=user, username=username, ip_address=ip_address,
                    success=False, attempt_method='password'
                )
                return Response({
                    'error': f'Account is locked. Try again in {remaining} minute(s).',
                    'account_locked': True,
                    'locked_until': profile.locked_until.isoformat(),
                }, status=status.HTTP_423_LOCKED)
        except UserProfile.DoesNotExist:
            pass

        # Successful login — reset failed attempts
        try:
            profile = user.profile
            profile.failed_login_attempts = 0
            profile.locked_until = None
            profile.save(update_fields=['failed_login_attempts', 'locked_until'])
        except UserProfile.DoesNotExist:
            pass

        # Log the successful attempt
        LoginAttempt.objects.create(
            user=user, username=username, ip_address=ip_address,
            success=True, attempt_method='password'
        )

        # Remember Me: determine token lifetime
        if remember_me:
            # For remember me, we keep the token as-is (no expiry)
            # The frontend will persist it in localStorage
            pass

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
            'remember_me': remember_me,
        })

    # Failed login — track and potentially lock
    LoginAttempt.objects.create(
        user=None, username=username, ip_address=ip_address,
        success=False, attempt_method='password'
    )

    # Find the user (even though auth failed, we may have the profile)
    try:
        target_user = User.objects.filter(username=username).first()
        if target_user:
            try:
                profile = target_user.profile
                profile.failed_login_attempts = (profile.failed_login_attempts or 0) + 1
                if profile.failed_login_attempts >= 5:
                    profile.locked_until = timezone.now() + timedelta(minutes=15)
                profile.save(update_fields=['failed_login_attempts', 'locked_until'])
            except UserProfile.DoesNotExist:
                pass
    except Exception:
        pass

    return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


# ──────────────── FRICTIONLESS AUTH (Passwordless) ────────────────


def _normalize_phone(phone):
    phone = str(phone or '').strip()
    if not phone:
        return ''
    if not phone.startswith('+'):
        phone = f'+255{phone.lstrip("0")}'
    return phone


def _deliver_notify_request(url, payload, token):
    import urllib.error
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode('utf-8') or '{}'
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Notify API {exc.code}: {error_body}') from exc


def deliver_otp_code(phone, code):
    """Send an OTP using Notify Africa, preferring WhatsApp then SMS."""
    base_url = os.getenv('NOTIFY_BASE_URL', 'https://api.notify.africa').rstrip('/')
    whatsapp_key = os.getenv('NOTIFY_WHATSAPP_KEY', '').strip()
    sms_key = os.getenv('NOTIFY_SMS_KEY', '').strip()
    message = f'Your Smart Crops OTP is {code}'

    if not base_url:
        raise RuntimeError('Notify base URL is not configured.')

    if not (whatsapp_key or sms_key):
        logger = logging.getLogger('prices')
        logger.info(f'Phone verification code for {phone}: {code}')
        return {'status': 'dev_only', 'channel': 'dev'}

    # Notify Africa expects international format WITHOUT the + prefix
    api_phone = phone.lstrip('+')

    # WhatsApp (WABA) — try first
    if whatsapp_key:
        try:
            waba_url = 'https://notify-web-assistant-api.beagile.africa'
            waba_payload = {'to': [api_phone], 'text': message}
            result = _deliver_notify_request(f'{waba_url}/v1/waba-api/messages/text', waba_payload, whatsapp_key)
            return {'status': 'sent', 'channel': 'whatsapp', 'provider_response': result}
        except Exception as exc:
            logging.getLogger('prices').warning(f'WhatsApp delivery failed for {phone}: {exc}')

    # SMS — fallback
    if sms_key:
        try:
            sms_url = f'{base_url}/api/v1/api/messages/send'
            sms_payload = {'phone_number': api_phone, 'message': message, 'sender_id': 'SMARTCROPS'}
            result = _deliver_notify_request(sms_url, sms_payload, sms_key)
            return {'status': 'sent', 'channel': 'sms', 'provider_response': result}
        except Exception as exc:
            logging.getLogger('prices').warning(f'SMS delivery failed for {phone}: {exc}')

    # Dev fallback: log the code instead of failing
    logger = logging.getLogger('prices')
    logger.info(f'Phone verification code for {phone}: {code} (delivery channels failed, using dev fallback)')
    return {'status': 'dev_only', 'channel': 'log'}


def _get_or_create_passwordless_user(email=None, phone=None, auth_provider='magic_link', google_data=None):
    """
    Find or create a Django User for passwordless auth flows.
    Returns (user, is_new) tuple.
    """
    import secrets

    if email:
        # Try to find by email first
        try:
            user = User.objects.get(email=email)
            return user, False
        except User.DoesNotExist:
            pass
        # Create new user
        username_base = email.split('@')[0]
        username = username_base
        while User.objects.filter(username=username).exists():
            username = f"{username_base}_{secrets.token_hex(3)}"
        user = User.objects.create_user(
            username=username,
            email=email,
            password=secrets.token_urlsafe(32),  # random unusable password
        )
        if google_data:
            user.first_name = google_data.get('given_name', '')
            user.last_name = google_data.get('family_name', '')
            user.save()
        UserProfile.objects.create(
            user=user,
            role='general',
            auth_provider=auth_provider,
            email_verified=True if auth_provider in ('google', 'magic_link') else False,
        )
        return user, True

    elif phone:
        # Try to find by phone in profile
        try:
            profile = UserProfile.objects.get(phone=phone)
            return profile.user, False
        except UserProfile.DoesNotExist:
            pass
        # Create new user with phone as username
        username = phone.replace('+', '').replace(' ', '')
        while User.objects.filter(username=username).exists():
            username = f"{phone.replace('+', '')}_{secrets.token_hex(3)}"
        user = User.objects.create_user(
            username=username,
            password=secrets.token_urlsafe(32),
        )
        UserProfile.objects.create(
            user=user,
            role='general',
            phone=phone,
            auth_provider=auth_provider,
        )
        return user, True

    raise ValueError('Either email or phone must be provided')


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def send_magic_link(request):
    """Send a one-time magic link to the user's email."""
    import secrets
    from django.core.mail import send_mail
    from django.conf import settings

    email = request.data.get('email', '').strip().lower()
    if not email or '@' not in email:
        return Response({'error': 'Valid email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Rate limit: max 1 magic link per email per 2 minutes
    recent = MagicLink.objects.filter(
        email=email,
        created_at__gte=timezone.now() - timedelta(minutes=2),
    ).exists()
    if recent:
        return Response({'error': 'Please wait before requesting another link.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # Create token
    token = secrets.token_urlsafe(48)
    MagicLink.objects.create(
        email=email,
        token=token,
        expires_at=timezone.now() + timedelta(minutes=15),
    )

    # Build link
    frontend_url = os.environ.get('FRONTEND_URL', f'http://localhost:3000')
    link = f"{frontend_url}/auth/callback?token={token}"

    send_mail(
        subject='Smart Crops — Sign In Link',
        message=(
            f'Hi there,\n\n'
            f'Click the link below to sign in to Smart Crops:\n\n'
            f'{link}\n\n'
            f'This link expires in 15 minutes and can only be used once.\n\n'
            f'If you didn\'t request this, you can safely ignore this email.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )

    return Response({'message': f'Magic link sent to {email}'})


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_magic_link(request):
    """Verify a magic link token and return a Django auth token."""
    token = request.data.get('token', '').strip()
    if not token:
        return Response({'error': 'Token is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        magic = MagicLink.objects.get(token=token)
    except MagicLink.DoesNotExist:
        return Response({'error': 'Invalid or expired link.'}, status=status.HTTP_400_BAD_REQUEST)

    if not magic.is_valid:
        return Response({'error': 'This link has expired or already been used.'}, status=status.HTTP_400_BAD_REQUEST)

    # Mark as used
    magic.used = True
    magic.save()

    # Get or create user
    user, is_new = _get_or_create_passwordless_user(email=magic.email, auth_provider='magic_link')

    # Create/get Django token
    auth_token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': auth_token.key,
        'user': UserSerializer(user).data,
        'is_new_user': is_new,
        'onboarding_complete': user.profile.onboarding_complete,
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def send_phone_code(request):
    """Send a 6-digit verification code to a phone number."""
    import random

    phone = request.data.get('phone', '').strip()
    if not phone or len(phone) < 9:
        return Response({'error': 'Valid phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)

    phone = _normalize_phone(phone)
    if not phone:
        return Response({'error': 'Valid phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)

    recent = PhoneVerification.objects.filter(
        phone=phone,
        created_at__gte=timezone.now() - timedelta(seconds=60),
    ).exists()
    if recent:
        return Response({'error': 'Please wait 60 seconds before requesting another code.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    verification = PhoneVerification.objects.create(
        phone=phone,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=5),
    )

    try:
        delivery = deliver_otp_code(phone, code)
        verification.last_channel = delivery.get('channel', 'unknown')
        verification.last_error = ''
        verification.save(update_fields=['last_channel', 'last_error'])
    except Exception as exc:
        verification.last_error = str(exc)
        verification.last_channel = 'dev'
        verification.save(update_fields=['last_channel', 'last_error'])
        if not django_settings.DEBUG:
            return Response({'error': 'Could not send verification code right now. Please try again shortly.'}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({
        'message': f'Verification code sent to {phone}',
        'dev_code': code if django_settings.DEBUG else None,
        'delivery_channel': verification.last_channel,
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_phone_code(request):
    """Verify a phone OTP code and return a Django auth token."""
    phone = request.data.get('phone', '').strip()
    code = request.data.get('code', '').strip()

    if not phone or not code:
        return Response({'error': 'Phone and code are required.'}, status=status.HTTP_400_BAD_REQUEST)

    phone = _normalize_phone(phone)

    try:
        verification = PhoneVerification.objects.filter(
            phone=phone, used=False,
        ).order_by('-created_at').first()
    except Exception:
        verification = None

    if not verification or not verification.is_valid:
        return Response({'error': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

    if verification.attempts >= 5:
        return Response({'error': 'Too many failed attempts. Please request a new code.'}, status=status.HTTP_400_BAD_REQUEST)

    if verification.code != code:
        verification.attempts += 1
        verification.save(update_fields=['attempts'])
        return Response({'error': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

    verification.used = True
    verification.save(update_fields=['used'])

    # Get or create user
    user, is_new = _get_or_create_passwordless_user(phone=phone, auth_provider='phone')

    # Mark phone as verified
    profile = user.profile
    profile.phone_verified = True
    if not profile.phone:
        profile.phone = phone
    profile.save()

    # Create/get Django token
    auth_token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': auth_token.key,
        'user': UserSerializer(user).data,
        'is_new_user': is_new,
        'onboarding_complete': user.profile.onboarding_complete,
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def google_auth(request):
    """
    Accept a Google OAuth credential and return a Django auth token.
    Supports both:
    - Google ID token (from frontend Google Sign-In button)
    - Google authorization code (from redirect flow)
    """
    import json
    import urllib.request
    import urllib.parse

    credential = request.data.get('credential', '')  # Google ID token
    code = request.data.get('code', '')              # Google auth code

    google_data = None

    if credential:
        # Verify Google ID token via Google's tokeninfo endpoint
        try:
            tokeninfo_url = f'https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}'
            req = urllib.request.Request(tokeninfo_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                google_data = json.loads(resp.read().decode())
                # Verify audience matches our client ID
                expected_aud = os.environ.get('GOOGLE_CLIENT_ID', '')
                if expected_aud and google_data.get('aud') != expected_aud:
                    return Response({'error': 'Invalid Google credential audience.'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            return Response({'error': f'Failed to verify Google credential: {str(e)}'}, status=status.HTTP_401_UNAUTHORIZED)

    elif code:
        # Exchange authorization code for tokens
        client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
        if not client_secret:
            return Response({'error': 'Google OAuth is not configured (missing client secret). Contact the administrator.'}, status=status.HTTP_501_NOT_IMPLEMENTED)
        try:
            token_url = 'https://oauth2.googleapis.com/token'
            token_data = urllib.parse.urlencode({
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': 'postmessage',
                'grant_type': 'authorization_code',
            }).encode()
            req = urllib.request.Request(token_url, data=token_data, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                token_response = json.loads(resp.read().decode())
                access_token = token_response.get('access_token')

            # Get user info from Google
            req2 = urllib.request.Request(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                google_data = json.loads(resp2.read().decode())
        except Exception as e:
            return Response({'error': f'Failed to verify Google auth: {str(e)}'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        return Response({'error': 'Google credential or code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not google_data or not google_data.get('email'):
        return Response({'error': 'Could not retrieve email from Google.'}, status=status.HTTP_400_BAD_REQUEST)

    email = google_data['email']

    # Get or create user
    user, is_new = _get_or_create_passwordless_user(
        email=email,
        auth_provider='google',
        google_data=google_data,
    )

    # Update avatar if available
    avatar_url = google_data.get('picture', '')
    if avatar_url and is_new:
        user.profile.profile_photo = avatar_url
        user.profile.save()

    # Mark email as verified (Google verified it)
    user.profile.email_verified = True
    user.profile.save()

    # Create/get Django token
    auth_token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': auth_token.key,
        'user': UserSerializer(user).data,
        'is_new_user': is_new,
        'onboarding_complete': user.profile.onboarding_complete,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def complete_onboarding(request):
    """Save role + profile data after first passwordless login. Marks onboarding as complete."""
    data = request.data
    role = data.get('role', 'general')
    if role not in dict(UserProfile.ROLE_CHOICES):
        return Response({'error': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        profile = UserProfile.objects.create(user=request.user)

    profile.role = role

    # If email is already verified (e.g. Google OAuth), complete onboarding now
    if profile.email_verified:
        profile.onboarding_complete = True

    # Agents start as pending, everyone else is approved
    if role == 'agent':
        profile.approval_status = 'pending'
    else:
        profile.approval_status = 'approved'

    # Update basic identity fields
    profile.phone = data.get('phone', profile.phone)
    profile.region = data.get('region', profile.region)
    profile.district = data.get('district', profile.district)
    profile.nida_number = data.get('nida_number', profile.nida_number)
    profile.gender = data.get('gender', profile.gender)
    if data.get('date_of_birth'):
        profile.date_of_birth = data['date_of_birth']

    # Role-specific fields
    if role == 'farmer':
        profile.main_crops = data.get('main_crops', '')
        profile.farm_size = data.get('farm_size') or None
        profile.preferred_markets = data.get('preferred_markets', '')
        profile.mobile_money_provider = data.get('mobile_money_provider', '')
        profile.mobile_money_number = data.get('mobile_money_number', '')
    elif role == 'trader':
        profile.operating_regions = data.get('operating_regions', '')
        profile.crops_of_interest = data.get('crops_of_interest', '')
        profile.transport_capacity = data.get('transport_capacity', '')
        profile.mobile_money_provider = data.get('mobile_money_provider', '')
    elif role == 'agent':
        profile.assigned_market_id = data.get('assigned_market') or None
        profile.experience = data.get('experience', '')

    profile.save()

    # Update user name if provided
    if data.get('first_name'):
        request.user.first_name = data['first_name']
    if data.get('last_name'):
        request.user.last_name = data['last_name']
    request.user.save()

    return Response({
        'message': 'Profile data saved. Please verify your email to continue.',
        'user': UserSerializer(request.user).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_verification_code(request):
    """Generate and send a 6-digit email verification code."""
    import random
    from django.core.mail import send_mail
    from django.conf import settings
    import logging

    logger = logging.getLogger('prices')

    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found.'}, status=status.HTTP_400_BAD_REQUEST)

    if profile.email_verified:
        return Response({'message': 'Email already verified.'}, status=status.HTTP_200_OK)

    # Check rate limit: don't send more than once per 2 minutes
    if profile.email_code_sent_at:
        elapsed = timezone.now() - profile.email_code_sent_at
        if elapsed.total_seconds() < 120:
            return Response({'error': 'Please wait before requesting another code.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # Generate 6-digit code
    code = ''.join([str(random.randint(0, 9)) for _ in range(settings.EMAIL_VERIFICATION_CODE_LENGTH)])
    profile.email_verification_code = code
    profile.email_code_sent_at = timezone.now()
    profile.save()

    # Always log the code to server console (works in all environments)
    logger.info('=' * 60)
    logger.info('EMAIL VERIFICATION CODE FOR %s: %s', request.user.email, code)
    logger.info('=' * 60)

    # Try SMTP; fallback to console is handled by EMAIL_BACKEND setting
    email_sent = False
    try:
        send_mail(
            subject='Smart Crops — Email Verification Code',
            message=f'Your Smart Crops verification code is: {code}\n\nThis code expires in {settings.EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES} minutes.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[request.user.email],
            fail_silently=False,
        )
        email_sent = True
    except Exception as exc:
        logger.warning('SMTP send failed for %s: %s', request.user.email, exc)

    if email_sent:
        return Response({'message': f'Verification code sent to {request.user.email}'})
    return Response({
        'message': f'Verification code for {request.user.email}: {code}',
        'dev_hint': 'Check the server console if email was not delivered.',
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_email(request):
    """Verify the user's email with the 6-digit code."""
    from django.conf import settings

    code = request.data.get('code', '').strip()
    if not code:
        return Response({'error': 'Verification code is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found.'}, status=status.HTTP_400_BAD_REQUEST)

    if profile.email_verified:
        return Response({'message': 'Email already verified.'}, status=status.HTTP_200_OK)

    # Check code matches
    if profile.email_verification_code != code:
        return Response({'error': 'Invalid verification code.'}, status=status.HTTP_400_BAD_REQUEST)

    # Check expiry
    if profile.email_code_sent_at:
        elapsed = timezone.now() - profile.email_code_sent_at
        if elapsed.total_seconds() > settings.EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES * 60:
            return Response({'error': 'Verification code has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    # Mark as verified
    profile.email_verified = True
    profile.email_verification_code = ''

    # If the user has already saved their profile data (onboarding form was submitted),
    # mark onboarding as complete so they can access the app.
    if profile.role and profile.role != 'general':
        profile.onboarding_complete = True

    profile.save()

    return Response({'message': 'Email verified successfully!'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def resend_verification_code(request):
    """Resend the email verification code."""
    import random
    from django.core.mail import send_mail
    from django.conf import settings
    import logging

    logger = logging.getLogger('prices')

    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found.'}, status=status.HTTP_400_BAD_REQUEST)

    if profile.email_verified:
        return Response({'message': 'Email already verified.'}, status=status.HTTP_200_OK)

    # Generate new code
    code = ''.join([str(random.randint(0, 9)) for _ in range(settings.EMAIL_VERIFICATION_CODE_LENGTH)])
    profile.email_verification_code = code
    profile.email_code_sent_at = timezone.now()
    profile.save()

    # Always log to server console
    logger.info('=' * 60)
    logger.info('EMAIL VERIFICATION CODE FOR %s: %s', request.user.email, code)
    logger.info('=' * 60)

    email_sent = False
    try:
        send_mail(
            subject='Smart Crops — New Verification Code',
            message=f'Your new Smart Crops verification code is: {code}\n\nThis code expires in {settings.EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES} minutes.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[request.user.email],
            fail_silently=False,
        )
        email_sent = True
    except Exception as exc:
        logger.warning('SMTP resend failed for %s: %s', request.user.email, exc)

    if email_sent:
        return Response({'message': f'New verification code sent to {request.user.email}'})
    return Response({
        'message': f'Verification code for {request.user.email}: {code}',
        'dev_hint': 'Check the server console if email was not delivered.',
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        request.user.auth_token.delete()
    except Exception:
        pass
    return Response({'message': 'Logged out successfully'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def login_history(request):
    """Return the last 20 login attempts for the authenticated user."""
    attempts = LoginAttempt.objects.filter(
        user=request.user
    ).order_by('-timestamp')[:20]
    data = [{
        'username': a.username,
        'ip_address': a.ip_address,
        'timestamp': a.timestamp.isoformat(),
        'success': a.success,
        'attempt_method': a.attempt_method,
    } for a in attempts]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def account_status(request):
    """Return account security status including lock state."""
    try:
        profile = request.user.profile
        locked = False
        locked_remaining = 0
        if profile.locked_until and profile.locked_until > timezone.now():
            locked = True
            locked_remaining = int((profile.locked_until - timezone.now()).total_seconds())
        return Response({
            'account_locked': locked,
            'locked_remaining_seconds': locked_remaining,
            'failed_login_attempts': profile.failed_login_attempts,
            'email_verified': profile.email_verified,
            'phone_verified': profile.phone_verified,
        })
    except UserProfile.DoesNotExist:
        return Response({'account_locked': False, 'failed_login_attempts': 0})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_account(request):
    """Permanently delete the authenticated user's account and all associated data."""
    from django.contrib.auth import authenticate as auth_check

    password = request.data.get('password', '')
    if not password:
        return Response({'error': 'Password is required to delete your account.'}, status=status.HTTP_400_BAD_REQUEST)

    # Verify the password
    user = auth_check(username=request.user.username, password=password)
    if not user:
        return Response({'error': 'Incorrect password.'}, status=status.HTTP_403_FORBIDDEN)

    # Prevent admin self-deletion (must have at least one admin)
    try:
        profile = user.profile
        if profile.role == 'admin':
            admin_count = UserProfile.objects.filter(role='admin').count()
            if admin_count <= 1:
                return Response({'error': 'Cannot delete the last admin account.'}, status=status.HTTP_403_FORBIDDEN)
    except UserProfile.DoesNotExist:
        pass

    username = user.username
    # Delete cascades: profile, tokens, price entries, submissions, alerts
    user.delete()
    return Response({'message': f'Account "{username}" and all associated data have been permanently deleted.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change the authenticated user's password."""
    current_password = request.data.get('current_password', '')
    new_password = request.data.get('new_password', '')

    if not current_password or not new_password:
        return Response({'error': 'Both current and new passwords are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_password) < 8:
        return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=request.user.username, password=current_password)
    if not user:
        return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_403_FORBIDDEN)

    user.set_password(new_password)
    user.save()
    return Response({'message': 'Password changed successfully.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_password(request):
    """Set a password for a passwordless account (Google/phone/magic-link signups)."""
    from django.contrib.auth.password_validation import validate_password

    if request.user.has_usable_password():
        return Response(
            {'error': 'You already have a password. Use Change Password instead.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    new_password = request.data.get('new_password', '')
    confirm_password = request.data.get('confirm_password', '')

    if not new_password:
        return Response({'error': 'Password is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    if confirm_password and new_password != confirm_password:
        return Response({'error': 'Passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user=request.user)
    except Exception as e:
        return Response({'error': ' '.join(e.messages) if hasattr(e, 'messages') else str(e)},
                        status=status.HTTP_400_BAD_REQUEST)

    request.user.set_password(new_password)
    request.user.save()
    return Response({
        'message': 'Password set successfully.',
        'user': UserSerializer(request.user).data,
    })


# ──────────────────────────── FORGOT / RESET PASSWORD ────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """Send a password-reset token to the user's email."""
    import logging
    logger = logging.getLogger(__name__)
    from django.contrib.auth.tokens import default_token_generator
    from django.core.mail import send_mail
    from django.conf import settings

    email = request.data.get('email', '').strip()
    if not email:
        return Response({'error': 'Email address is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        # Don't reveal whether the email exists
        return Response({'message': 'If an account with that email exists, a reset link has been sent.'})
    except User.MultipleObjectsReturned:
        target_user = User.objects.filter(email__iexact=email).first()

    token = default_token_generator.make_token(target_user)
    uid = str(target_user.pk)

    # Build the reset URL — frontend route
    frontend_host = request.get_host().split(':')[0]
    reset_url = f"http://{frontend_host}:3000/reset-password/{uid}/{token}/"

    plain_message = (
        f"Hi {target_user.username},\n\n"
        f"You requested a password reset. Click the link below to set a new password:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in 24 hours. If you didn't request this, ignore this email.\n\n"
        f"— Smart Crops Team"
    )
    html_message = (
        f"<div style='font-family:sans-serif;max-width:480px;margin:auto'>"
        f"<h2 style='color:#16a34a'>Smart Crops — Password Reset</h2>"
        f"<p>Hi {target_user.username},</p>"
        f"<p>You requested a password reset. Click the button below to set a new password:</p>"
        f"<p style='margin:24px 0'><a href='{reset_url}' "
        f"style='background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;"
        f"text-decoration:none;font-weight:bold;display:inline-block'>Reset Password</a></p>"
        f"<p style='color:#666;font-size:13px'>This link expires in 24 hours. "
        f"If you didn't request this, you can safely ignore this email.</p>"
        f"<hr style='border:none;border-top:1px solid #eee;margin:24px 0'>"
        f"<p style='color:#999;font-size:12px'>— Smart Crops Team</p></div>"
    )

    try:
        send_mail(
            subject='Smart Crops — Password Reset',
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[target_user.email],
            html_message=html_message,
            fail_silently=False,
        )
        logger.info(f"Password reset email sent to {target_user.email} (uid={uid})")
    except Exception as e:
        logger.error(f"FAILED to send password reset email to {target_user.email}: {type(e).__name__}: {e}")

    return Response({'message': 'If an account with that email exists, a reset link has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """Reset a user's password using a valid uid + token."""
    from django.contrib.auth.tokens import default_token_generator

    uid = request.data.get('uid', '')
    token = request.data.get('token', '')
    new_password = request.data.get('new_password', '')

    if not uid or not token or not new_password:
        return Response({'error': 'uid, token, and new_password are all required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_password) < 8:
        return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_user = User.objects.get(pk=int(uid))
    except (User.DoesNotExist, ValueError, TypeError):
        return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    if not default_token_generator.check_token(target_user, token):
        return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    target_user.set_password(new_password)
    target_user.save()
    return Response({'message': 'Password has been reset successfully. You can now log in with your new password.'})


# ──────────────────────────── PROFILE UPDATE ────────────────────────────

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Update the authenticated user's profile fields."""
    profile = request.user.profile
    data = request.data

    updatable_fields = [
        'phone', 'region', 'district', 'main_crops', 'farm_size', 'farm_size_unit',
        'preferred_markets', 'ward', 'land_ownership', 'farming_type',
        'cooperative_name', 'mobile_money_provider', 'mobile_money_number',
        'avg_harvest_qty', 'avg_harvest_unit', 'nida_number', 'date_of_birth', 'gender',
        'profile_photo',
        # Trader fields
        'entity_type', 'business_name', 'operating_regions', 'crops_of_interest',
        'transport_capacity', 'has_transport', 'vehicle_count', 'vehicle_types',
        'primary_source_region', 'primary_sales_region', 'avg_monthly_volume',
        'volume_unit', 'trade_types', 'trading_since_year',
    ]

    updated = []
    for field in updatable_fields:
        if field in data:
            setattr(profile, field, data[field])
            updated.append(field)

    if updated:
        profile.save()

    from .serializers import UserSerializer
    return Response({
        'message': f'Profile updated: {", ".join(updated)}' if updated else 'No fields to update.',
        'updated_fields': updated,
        'user': UserSerializer(request.user).data,
    })


# ──────────────────────────── USER PREFERENCES ────────────────────────────

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def user_preferences(request):
    """Get or update user notification/display preferences."""
    from .models import UserPreferences

    prefs, _ = UserPreferences.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response({
            'price_alerts': prefs.price_alerts,
            'market_updates': prefs.market_updates,
            'sms_notifications': prefs.sms_notifications,
            'email_notifications': prefs.email_notifications,
            'language': prefs.language,
            'notifications_enabled': prefs.notifications_enabled,
            'opportunity_alerts': prefs.opportunity_alerts,
            'transport_alerts': prefs.transport_alerts,
            'personalized_alerts': prefs.personalized_alerts,
        })

    # PATCH — update preferences
    bool_fields = [
        'price_alerts', 'market_updates', 'sms_notifications', 'email_notifications',
        'notifications_enabled', 'opportunity_alerts', 'transport_alerts', 'personalized_alerts',
    ]
    for field in bool_fields:
        if field in request.data:
            setattr(prefs, field, bool(request.data[field]))
    if 'language' in request.data:
        prefs.language = request.data['language']

    prefs.save()
    return Response({
        'message': 'Preferences updated.',
        'preferences': {
            'price_alerts': prefs.price_alerts,
            'market_updates': prefs.market_updates,
            'sms_notifications': prefs.sms_notifications,
            'email_notifications': prefs.email_notifications,
            'language': prefs.language,
            'notifications_enabled': prefs.notifications_enabled,
            'opportunity_alerts': prefs.opportunity_alerts,
            'transport_alerts': prefs.transport_alerts,
            'personalized_alerts': prefs.personalized_alerts,
        }
    })


# ──────────────────────────── TRANSPORT ROUTES LIST ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_transport_routes(request):
    """List all region-to-region transport routes."""
    from .models import RegionRoute
    routes = RegionRoute.objects.select_related('from_region', 'to_region').all()
    data = []
    for r in routes:
        data.append({
            'id': r.id,
            'from_region': r.from_region.name,
            'from_region_id': r.from_region_id,
            'to_region': r.to_region.name,
            'to_region_id': r.to_region_id,
            'distance_km': r.distance_km,
            'road_type': r.road_type,
            'corridor': r.corridor,
            'condition_factor': r.condition_factor,
            'avg_speed_kmh': r.avg_speed_kmh,
            'is_bidirectional': r.is_bidirectional,
        })
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_pricing_rules(request):
    """List all vehicle pricing rules."""
    from .models import PricingRule
    rules = PricingRule.objects.all()
    data = []
    for r in rules:
        data.append({
            'id': r.id,
            'vehicle_type': r.vehicle_type,
            'vehicle_display': r.get_vehicle_type_display(),
            'base_rate_per_km': r.base_rate_per_km,
            'vehicle_multiplier': r.vehicle_multiplier,
            'fuel_multiplier': r.fuel_multiplier,
            'min_charge': r.min_charge,
            'large_cargo_threshold_kg': r.large_cargo_threshold_kg,
            'large_cargo_discount': r.large_cargo_discount,
        })
    return Response(data)


# ──────────────────────────── ADMIN USER MANAGEMENT ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_list_users(request):
    """List all users with profile info (admin only)."""
    if request.user.profile.role != 'admin':
        return Response({'error': 'Admin access required.'}, status=403)

    users = User.objects.select_related('profile').all().order_by('-date_joined')
    data = []
    for u in users:
        profile = getattr(u, 'profile', None)
        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'role': profile.role if profile else 'general',
            'approval_status': profile.approval_status if profile else 'approved',
            'phone': profile.phone if profile else '',
            'region': profile.region if profile else '',
            'date_joined': u.date_joined.isoformat(),
            'is_active': u.is_active,
        })
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def admin_update_user(request, user_id):
    """Update a user's role or approval status (admin only)."""
    if request.user.profile.role != 'admin':
        return Response({'error': 'Admin access required.'}, status=403)

    try:
        target_user = User.objects.select_related('profile').get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=404)

    profile = target_user.profile
    updated = []

    if 'role' in request.data:
        profile.role = request.data['role']
        updated.append('role')
    if 'approval_status' in request.data:
        profile.approval_status = request.data['approval_status']
        updated.append('approval_status')
    if 'is_active' in request.data:
        target_user.is_active = bool(request.data['is_active'])
        target_user.save()
        updated.append('is_active')

    if updated:
        profile.save()

    return Response({
        'message': f'User {target_user.username} updated: {", ".join(updated)}',
        'updated_fields': updated,
    })


# ──────────────────────────── REGION VIEWS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_regions(request):
    regions = Region.objects.annotate(
        market_count=Count('markets', filter=Q(markets__is_active=True), distinct=True)
    )
    serializer = RegionSerializer(regions, many=True)
    return Response(serializer.data)


# ──────────────────────────── MARKET VIEWS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_markets(request):
    region_id = request.query_params.get('region')
    qs = Market.objects.select_related('region').filter(is_active=True)
    if region_id:
        qs = qs.filter(region_id=region_id)
    serializer = MarketSerializer(qs, many=True)
    return Response(serializer.data)


# ──────────────────────────── CROP VIEWS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_crops(request):
    category = request.query_params.get('category')
    qs = Crop.objects.all()
    if category:
        qs = qs.filter(category=category)
    serializer = CropSerializer(qs, many=True)
    return Response(serializer.data)


# ──────────────────────────── PRICE VIEWS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def get_prices(request):
    """Fetch prices with optional filtering by crop, market, region, date range, and market type."""
    qs = PriceEntry.objects.filter(status='approved')

    crop_id = request.query_params.get('crop')
    market_id = request.query_params.get('market')
    region_id = request.query_params.get('region')
    date_from = request.query_params.get('from')
    date_to = request.query_params.get('to')
    market_type = request.query_params.get('market_type')

    if crop_id:
        qs = qs.filter(crop_id=crop_id)
    if market_id:
        qs = qs.filter(market_id=market_id)
    if region_id:
        qs = qs.filter(market__region_id=region_id)
    if date_from:
        qs = qs.filter(price_date__gte=date_from)
    if date_to:
        qs = qs.filter(price_date__lte=date_to)
    if market_type == 'consumer':
        qs = qs.filter(market__market_type__in=['daily', 'periodic'])
    elif market_type == 'wholesale':
        qs = qs.filter(market__market_type='wholesale')

    limit = request.query_params.get('limit')
    try:
        limit = int(limit) if limit else 200
    except ValueError:
        limit = 200
    limit = max(1, min(limit, 500))

    qs = qs.order_by('-price_date', '-submitted_at').select_related('crop', 'market', 'market__region', 'submitted_by', 'reviewed_by')[:limit]
    serializer = PriceEntrySerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_price(request):
    """Submit a new price entry with validation pipeline. Only admins and approved agents."""
    # Role-based access control
    try:
        profile = request.user.profile
        if not profile.can_submit_prices:
            if profile.approval_status == 'pending':
                return Response({'error': 'Your account is pending approval.'}, status=403)
            return Response({'error': 'Only approved Admins and Market Agents can submit prices.'}, status=403)
    except UserProfile.DoesNotExist:
        return Response({'error': 'Access denied. No user profile found.'}, status=403)

    serializer = PriceSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    crop = serializer.validated_data['crop']
    market = serializer.validated_data['market']
    price = serializer.validated_data['price']
    quantity = serializer.validated_data.get('quantity')
    price_date = serializer.validated_data['price_date']
    latitude = serializer.validated_data.get('latitude')
    longitude = serializer.validated_data.get('longitude')

    # Gather historical prices for this crop (last 30 days)
    recent_cutoff = price_date - timedelta(days=30)
    historical = list(PriceEntry.objects.filter(
        crop=crop,
        status='approved',
        price_date__gte=recent_cutoff,
    ).values_list('price', flat=True))

    # Run anomaly detection (combined Z-score + IQR)
    is_anomaly, combined_score, reason = detect_anomaly(
        new_price=price,
        crop_name=crop.name,
        market_id=market.id,
        historical_prices=historical,
    )

    # Calculate Z-score separately for pipeline decision
    z_score = abs(calculate_z_score(price, historical)) if len(historical) >= 3 else 0.0

    # Validation pipeline decision
    if z_score <= 2.0:
        # LOW RISK — auto-approve
        entry_status = 'approved'
        validation_message = 'Price validated and approved.'
    elif z_score <= 3.0:
        # MEDIUM RISK — send to admin review
        entry_status = 'flagged'
        validation_message = 'Price submission requires admin review.'
    else:
        # HIGH RISK — reject
        entry_status = 'rejected'
        validation_message = 'Price rejected due to significant deviation from historical data.'

    # Create the entry (serves as both submissions log and prices table)
    entry = PriceEntry.objects.create(
        crop=crop,
        market=market,
        price=price,
        quantity=quantity,
        price_date=price_date,
        submitted_by=request.user,
        is_anomaly=is_anomaly,
        anomaly_score=combined_score,
        anomaly_reason=reason + f' | Z-score: {z_score:.2f}',
        status=entry_status,
        latitude=latitude,
        longitude=longitude,
    )

    # Track in agent submission system
    sub_status_map = {
        'approved': 'published',
        'flagged': 'flagged',
        'rejected': 'flagged',
    }
    sub_status = sub_status_map.get(entry_status, 'published')
    MarketAgentSubmission.objects.create(
        price_entry=entry,
        agent=request.user,
        status=sub_status,
        flagged_at=timezone.now() if entry_status in ('flagged', 'rejected') else None,
        published_at=timezone.now() if entry_status == 'approved' else None,
    )

    return Response({
        'message': validation_message,
        'entry': PriceEntrySerializer(entry).data,
        'anomaly_detected': is_anomaly,
        'anomaly_score': combined_score,
        'z_score': round(z_score, 2),
        'validation_status': entry_status,
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_price(request, pk):
    """Delete a price entry. Admin only (checks profile role)."""
    try:
        profile = request.user.profile
    except Exception:
        return Response({'error': 'User profile not found.'}, status=status.HTTP_403_FORBIDDEN)

    if profile.role != 'admin':
        return Response({'error': 'Only administrators can delete price entries.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        entry = PriceEntry.objects.get(pk=pk)
    except PriceEntry.DoesNotExist:
        return Response({'error': 'Price entry not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Also delete the linked agent submission if it exists
    MarketAgentSubmission.objects.filter(price_entry=entry).delete()

    crop_name = entry.crop.name
    market_name = entry.market.name
    entry.delete()

    return Response({
        'message': f'Price entry for {crop_name} at {market_name} deleted successfully.',
    }, status=status.HTTP_200_OK)


# ──────────────────────────── ANOMALY VIEWS ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_anomalies(request):
    """Get all flagged/anomalous price entries with weather context."""
    qs = PriceEntry.objects.filter(is_anomaly=True).order_by('-submitted_at')[:100]
    data = PriceEntrySerializer(qs, many=True).data

    for item in data:
        try:
            entry = PriceEntry.objects.get(id=item['id'])
            region_name = entry.market.region.name
            weather = get_weather_context(region_name)
            if weather:
                item['weather_context'] = weather
        except (PriceEntry.DoesNotExist, AttributeError):
            pass

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_pending_reviews(request):
    """Get price entries pending admin review."""
    qs = PriceEntry.objects.filter(status__in=['flagged', 'pending']).order_by('-submitted_at')
    serializer = PriceEntrySerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def review_price(request, pk):
    """Admin review: approve or reject a flagged price entry."""
    # Check if user is admin or agent
    try:
        profile = request.user.profile
        if profile.role not in ('admin', 'agent'):
            return Response({'error': 'Only admins and agents can review entries'}, status=403)
    except UserProfile.DoesNotExist:
        return Response({'error': 'Access denied'}, status=403)

    try:
        entry = PriceEntry.objects.get(pk=pk)
    except PriceEntry.DoesNotExist:
        return Response({'error': 'Entry not found'}, status=404)

    serializer = PriceReviewSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    action = serializer.validated_data['action']
    reason = serializer.validated_data.get('reason', '')

    if action == 'approve':
        entry.status = 'approved'
        entry.is_anomaly = False
    else:
        entry.status = 'rejected'
        entry.is_anomaly = True

    entry.reviewed_by = request.user
    entry.reviewed_at = timezone.now()
    entry.anomaly_reason = f"{entry.anomaly_reason} | Reviewer note: {reason}" if reason else entry.anomaly_reason
    entry.save()

    return Response({
        'message': f'Entry {action}d successfully',
        'entry': PriceEntrySerializer(entry).data,
    })


# ──────────────────────────── DASHBOARD / STATS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def dashboard_stats(request):
    """Aggregate stats for the dashboard."""
    total_entries = PriceEntry.objects.filter(status='approved').count()
    total_anomalies = PriceEntry.objects.filter(is_anomaly=True).count()
    total_markets = Market.objects.filter(is_active=True).count()
    total_crops = Crop.objects.count()
    total_regions = Region.objects.count()

    # Recent prices (last 7 days)
    week_ago = timezone.now().date() - timedelta(days=7)
    recent_entries = PriceEntry.objects.filter(
        status='approved', price_date__gte=week_ago
    ).order_by('-price_date')[:50]

    # Top crops by number of entries
    top_crops = Crop.objects.annotate(
        entry_count=Count('prices', filter=Q(prices__status='approved'))
    ).order_by('-entry_count')[:5]

    # Average prices per crop (latest)
    avg_prices = []
    for crop in Crop.objects.all()[:10]:
        prices = list(
            PriceEntry.objects.filter(
                crop=crop, status='approved'
            ).order_by('-price_date')[:30].values_list('price', flat=True)
        )
        if prices:
            avg_prices.append({
                'crop': crop.name,
                'avg_price': round(float(np.mean(prices)), 2),
                'min_price': round(float(min(prices)), 2),
                'max_price': round(float(max(prices)), 2),
                'count': len(prices),
            })

    return Response({
        'total_entries': total_entries,
        'total_anomalies': total_anomalies,
        'total_markets': total_markets,
        'total_crops': total_crops,
        'total_regions': total_regions,
        'recent_count': len(recent_entries),
        'avg_prices': avg_prices,
    })


# ──────────────────────────── FORECASTING ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def crop_forecast(request, crop_id):
    """Per-crop price forecasting using ARIMA, Exponential Smoothing, or linear regression."""
    from .forecasting import forecast_prices

    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    # Get historical prices ordered by date (strictly this crop only)
    prices_qs = PriceEntry.objects.filter(
        crop=crop, status='approved'
    ).order_by('price_date').values_list('price_date', 'price')

    if not prices_qs:
        return Response({'error': 'No price data available for this crop'}, status=404)

    # Group by date and average
    date_prices = {}
    for date_val, price in prices_qs:
        date_str = str(date_val)
        if date_str not in date_prices:
            date_prices[date_str] = []
        date_prices[date_str].append(price)

    timeline = sorted(date_prices.keys())
    avg_prices = [float(np.mean(date_prices[d])) for d in timeline]

    if len(avg_prices) < 3:
        return Response({
            'crop': crop.name,
            'crop_id': crop.id,
            'prediction': 'insufficient_data',
            'message': 'Need at least 3 data points for forecasting',
        })

    # Build daily_prices list for the forecasting module
    daily_prices = list(zip(timeline, avg_prices))

    # Run ARIMA / ES / linear forecast
    result = forecast_prices(daily_prices, horizon_days=30)

    # Historical stats
    y = np.array(avg_prices)
    mean = float(np.mean(y))
    std = float(np.std(y))
    stats = {
        'mean': round(mean, 2),
        'std': round(std, 2),
        'min': round(float(np.min(y)), 2),
        'max': round(float(np.max(y)), 2),
        'data_points': len(avg_prices),
        'volatility': round((std / mean * 100) if mean > 0 else 0, 2),
    }

    # Price momentum (actual historical % changes)
    def pct_change(a, b):
        return round(((a - b) / b * 100), 2) if b > 0 else 0
    momentum = {}
    if len(avg_prices) >= 2:
        momentum['1d'] = pct_change(avg_prices[-1], avg_prices[-2])
    if len(avg_prices) >= 7:
        momentum['7d'] = pct_change(avg_prices[-1], avg_prices[-7])
    if len(avg_prices) >= 14:
        momentum['14d'] = pct_change(avg_prices[-1], avg_prices[-14])
    if len(avg_prices) >= 30:
        momentum['30d'] = pct_change(avg_prices[-1], avg_prices[-30])

    # Map trend to frontend format
    trend_map = {'rising': 'up', 'falling': 'down', 'stable': 'stable'}
    method = result.get('method', 'linear')
    arima_order = result.get('arima_order', None)
    method_label = {
        'arima': f'ARIMA{arima_order}' if arima_order else 'ARIMA',
        'exponential_smoothing': 'Holt-Winters',
        'linear': 'Linear Regression',
        'insufficient_data': 'Insufficient Data',
    }.get(method, method.replace('_', ' ').title())

    predicted_7 = result.get('predicted_7', 0)
    predicted_14 = result.get('predicted_14', 0)
    predicted_30 = result.get('predicted_30', 0)
    current_price = result['current_price']

    return Response({
        'crop': crop.name,
        'crop_id': crop.id,
        'current_price': current_price,
        'predictions': {
            '7_days': predicted_7,
            '14_days': predicted_14,
            '30_days': predicted_30,
        },
        'forecast_timeline': result.get('predictions', []),
        'trend': trend_map.get(result['trend'], 'stable'),
        'trend_slope': round(float(np.polyfit(np.arange(len(avg_prices)), avg_prices, 1)[0]), 4),
        'confidence': result['confidence'],
        'method': method,
        'method_label': method_label,
        'r_squared': result.get('r_squared', 0),
        'seasonal_trend': result['trend'],
        'action': result['action'],
        'action_reason': result['action_reason'],
        'pct_change_7d': round(((predicted_7 - current_price) / current_price * 100) if current_price > 0 else 0, 2),
        'stats': stats,
        'momentum': momentum,
        'timeline': list(zip(timeline[-30:], [round(p, 2) for p in avg_prices[-30:]])),
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def crop_market_forecast(request, crop_id, market_id):
    """Per-crop, per-market price forecast."""
    from .forecasting import forecast_prices

    try:
        crop = Crop.objects.get(id=crop_id)
        market = Market.objects.get(id=market_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)
    except Market.DoesNotExist:
        return Response({'error': 'Market not found'}, status=404)

    prices_qs = PriceEntry.objects.filter(
        crop=crop, market=market, status='approved'
    ).order_by('price_date').values_list('price_date', 'price')

    if not prices_qs:
        return Response({'error': 'No price data for this crop at this market'}, status=404)

    date_prices = {}
    for date_val, price in prices_qs:
        date_str = str(date_val)
        if date_str not in date_prices:
            date_prices[date_str] = []
        date_prices[date_str].append(price)

    timeline = sorted(date_prices.keys())
    avg_prices = [float(np.mean(date_prices[d])) for d in timeline]

    if len(avg_prices) < 3:
        return Response({
            'crop': crop.name, 'market': market.name, 'market_id': market.id,
            'prediction': 'insufficient_data',
            'message': 'Need at least 3 data points for forecasting',
        })

    daily_prices = list(zip(timeline, avg_prices))
    result = forecast_prices(daily_prices, horizon_days=30)

    y = np.array(avg_prices)
    mean = float(np.mean(y))
    std = float(np.std(y))
    stats = {
        'mean': round(mean, 2), 'std': round(std, 2),
        'min': round(float(np.min(y)), 2), 'max': round(float(np.max(y)), 2),
        'data_points': len(avg_prices),
        'volatility': round((std / mean * 100) if mean > 0 else 0, 2),
    }

    def pct_change(a, b):
        return round(((a - b) / b * 100), 2) if b > 0 else 0
    momentum = {}
    if len(avg_prices) >= 2:
        momentum['1d'] = pct_change(avg_prices[-1], avg_prices[-2])
    if len(avg_prices) >= 7:
        momentum['7d'] = pct_change(avg_prices[-1], avg_prices[-7])
    if len(avg_prices) >= 14:
        momentum['14d'] = pct_change(avg_prices[-1], avg_prices[-14])
    if len(avg_prices) >= 30:
        momentum['30d'] = pct_change(avg_prices[-1], avg_prices[-30])

    trend_map = {'rising': 'up', 'falling': 'down', 'stable': 'stable'}
    method = result.get('method', 'linear')
    arima_order = result.get('arima_order', None)
    method_label = {
        'arima': f'ARIMA{arima_order}' if arima_order else 'ARIMA',
        'exponential_smoothing': 'Holt-Winters',
        'linear': 'Linear Regression',
        'insufficient_data': 'Insufficient Data',
    }.get(method, method.replace('_', ' ').title())

    predicted_7 = result.get('predicted_7', 0)
    predicted_14 = result.get('predicted_14', 0)
    predicted_30 = result.get('predicted_30', 0)
    current_price = result['current_price']

    return Response({
        'crop': crop.name, 'crop_id': crop.id,
        'market': market.name, 'market_id': market.id,
        'current_price': current_price,
        'predictions': {
            '7_days': predicted_7, '14_days': predicted_14, '30_days': predicted_30,
        },
        'forecast_timeline': result.get('predictions', []),
        'trend': trend_map.get(result['trend'], 'stable'),
        'trend_slope': round(float(np.polyfit(np.arange(len(avg_prices)), avg_prices, 1)[0]), 4),
        'confidence': result['confidence'],
        'method': method,
        'method_label': method_label,
        'r_squared': result.get('r_squared', 0),
        'seasonal_trend': result['trend'],
        'action': result['action'],
        'action_reason': result['action_reason'],
        'pct_change_7d': round(((predicted_7 - current_price) / current_price * 100) if current_price > 0 else 0, 2),
        'stats': stats,
        'momentum': momentum,
        'timeline': list(zip(timeline[-30:], [round(p, 2) for p in avg_prices[-30:]])),
    })


# ──────────────────────────── PRICE FILTERING ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def price_segments(request, crop_id):
    """Segment prices into Low/Medium/High for a specific crop."""
    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    market_type = request.query_params.get('market_type')
    prices_qs = PriceEntry.objects.filter(crop=crop, status='approved')

    if market_type == 'consumer':
        prices_qs = prices_qs.filter(market__market_type__in=['daily', 'periodic'])
    elif market_type == 'wholesale':
        prices_qs = prices_qs.filter(market__market_type='wholesale')

    stats = prices_qs.aggregate(
        avg=Avg('price'), min=Min('price'), max=Max('price'), count=Count('id')
    )

    if stats['avg'] is None:
        return Response({'error': 'No price data for this crop'}, status=404)

    avg = float(stats['avg'])
    low_threshold = avg * 0.85
    high_threshold = avg * 1.15

    low_prices = PriceEntrySerializer(
        prices_qs.filter(price__lt=low_threshold).order_by('price')[:20], many=True
    ).data
    medium_prices = PriceEntrySerializer(
        prices_qs.filter(price__gte=low_threshold, price__lte=high_threshold).order_by('price')[:20], many=True
    ).data
    high_prices = PriceEntrySerializer(
        prices_qs.filter(price__gt=high_threshold).order_by('-price')[:20], many=True
    ).data

    return Response({
        'crop': crop.name,
        'crop_id': crop.id,
        'statistics': {
            'average': round(avg, 2),
            'min': round(float(stats['min']), 2),
            'max': round(float(stats['max']), 2),
            'count': stats['count'],
            'low_threshold': round(low_threshold, 2),
            'high_threshold': round(high_threshold, 2),
        },
        'segments': {
            'low': {'count': len(low_prices), 'entries': low_prices},
            'medium': {'count': len(medium_prices), 'entries': medium_prices},
            'high': {'count': len(high_prices), 'entries': high_prices},
        },
    })


# ──────────────────────────── AGENT MANAGEMENT ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_agents(request):
    """List all pending agent registrations for admin review."""
    try:
        profile = request.user.profile
        if profile.role != 'admin':
            return Response({'error': 'Only admins can view pending agents'}, status=403)
    except UserProfile.DoesNotExist:
        return Response({'error': 'Access denied'}, status=403)

    pending = UserProfile.objects.filter(
        role='agent', approval_status='pending'
    ).select_related('user')

    data = []
    for p in pending:
        data.append({
            'id': p.id,
            'user_id': p.user.id,
            'username': p.user.username,
            'email': p.user.email,
            'first_name': p.user.first_name,
            'last_name': p.user.last_name,
            'phone': p.phone,
            'region': p.region,
            'district': p.district,
            'assigned_market': p.assigned_market.name if p.assigned_market else None,
            'id_verification': p.id_verification,
            'experience': p.experience,
            'created_at': p.created_at,
        })

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_agent(request, user_id):
    """Admin approves or rejects a pending agent registration."""
    try:
        admin_profile = request.user.profile
        if admin_profile.role != 'admin':
            return Response({'error': 'Only admins can approve agents'}, status=403)
    except UserProfile.DoesNotExist:
        return Response({'error': 'Access denied'}, status=403)

    serializer = AgentApprovalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    try:
        agent_profile = UserProfile.objects.get(user_id=user_id, role='agent')
    except UserProfile.DoesNotExist:
        return Response({'error': 'Agent not found'}, status=404)

    action = serializer.validated_data['action']
    reason = serializer.validated_data.get('reason', '')

    if action == 'approve':
        agent_profile.approval_status = 'approved'
    else:
        agent_profile.approval_status = 'rejected'

    agent_profile.save()

    return Response({
        'message': f'Agent {action}d successfully',
        'agent': {
            'username': agent_profile.user.username,
            'status': agent_profile.approval_status,
        },
    })


# ──────────────────────────── RECOMMENDATIONS ────────────────────────────

def _sell_signal_for_crop(crop_id, market_id=None):
    """Reusable sell timing logic (mirrors sell_advisor view)."""
    qs = PriceEntry.objects.filter(crop_id=crop_id, status='approved').order_by('price_date')
    if market_id:
        qs = qs.filter(market_id=market_id)
    date_prices = {}
    for entry in qs.values_list('price_date', 'price'):
        d = str(entry[0])
        if d not in date_prices:
            date_prices[d] = []
        date_prices[d].append(entry[1])
    if len(date_prices) < 7:
        return None
    timeline = sorted(date_prices.keys())
    avg_prices = [float(np.mean(date_prices[d])) for d in timeline]
    current = avg_prices[-1]
    ma_7 = float(np.mean(avg_prices[-7:])) if len(avg_prices) >= 7 else current
    ma_30 = float(np.mean(avg_prices[-30:])) if len(avg_prices) >= 30 else current
    seasonal = float(np.mean(avg_prices))
    score = 50
    if current > ma_7 * 1.05:
        score += 15
    elif current < ma_7 * 0.95:
        score -= 15
    if current > ma_30 * 1.08:
        score += 20
    elif current < ma_30 * 0.92:
        score -= 20
    if current > seasonal * 1.10:
        score += 15
    elif current < seasonal * 0.90:
        score -= 15
    recent = avg_prices[-14:] if len(avg_prices) >= 14 else avg_prices
    if len(recent) >= 3:
        x = np.arange(len(recent))
        slope, _ = np.polyfit(x, recent, 1)
        score += 10 if slope > 0 else -10
    score = max(0, min(100, score))
    if score >= 70:
        signal, msg, color = 'hold', 'Prices trending up — holding may yield better returns.', '#22c55e'
    elif score <= 30:
        signal, msg, color = 'sell_now', 'Prices declining — consider selling soon.', '#ef4444'
    else:
        signal, msg, color = 'wait', 'Market stable — no urgent action needed.', '#f59e0b'
    pct7 = round((current - ma_7) / ma_7 * 100, 1) if ma_7 > 0 else 0
    pct30 = round((current - ma_30) / ma_30 * 100, 1) if ma_30 > 0 else 0
    pct_season = round((current - seasonal) / seasonal * 100, 1) if seasonal > 0 else 0
    return {
        'signal': signal, 'signal_color': color, 'score': score, 'message': msg,
        'current_price': round(current, 2), 'ma_7d': round(ma_7, 2), 'ma_30d': round(ma_30, 2),
        'seasonal_baseline': round(seasonal, 2),
        'pct_vs_7d': pct7, 'pct_vs_30d': pct30, 'pct_vs_seasonal': pct_season,
        'data_points': len(avg_prices),
    }


def _data_freshness(last_price_date):
    """Return freshness label and color."""
    if not last_price_date:
        return 'unknown', '#6b7280'
    days_ago = (timezone.now().date() - last_price_date).days
    if days_ago <= 1:
        return 'fresh', '#22c55e'
    elif days_ago <= 3:
        return 'recent', '#f59e0b'
    elif days_ago <= 7:
        return 'aging', '#f97316'
    else:
        return 'stale', '#ef4444'


def _get_transport_cost_estimate(origin_market_id, dest_market_id, kg=100):
    """Estimate transport cost per kg between two markets."""
    try:
        from .transport_engine import build_graph, calculate_all_modes, dijkstra
        from .models import RegionRoute, PricingRule
        origin = Market.objects.get(id=origin_market_id)
        dest = Market.objects.get(id=dest_market_id)
        if origin.name and dest.name:
            graph = build_graph()
            path_info = dijkstra(graph, origin.name, dest.name)
            if path_info and path_info.get('distance'):
                modes = calculate_all_modes(graph, origin.name, dest.name, kg)
                if modes and 'truck' in modes:
                    return round(modes['truck']['cost_per_kg']), round(modes['truck']['distance_km'])
    except Exception:
        pass
    # fallback heuristic
    try:
        o = Market.objects.get(id=origin_market_id)
        d = Market.objects.get(id=dest_market_id)
        same = o.region_id == d.region_id
        dist = 30 if same else 150
        cost_per_kg = round((dist * 50 + kg * 5) / kg, 2)
        return cost_per_kg, dist
    except Exception:
        return None, None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recommendations(request):
    """Role-specific recommendations for the current user."""
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found'}, status=404)

    role = profile.role
    result = {'role': role, 'recommendations': [], 'summary': {}}
    now = timezone.now().date()

    if role == 'farmer':
        crop_names = [c.strip() for c in (profile.main_crops or '').split(',') if c.strip()]
        crop_objs = Crop.objects.filter(
            name__in=[c for c in crop_names]
        ) if crop_names else Crop.objects.all()[:3]
        if not crop_objs:
            crop_objs = Crop.objects.all()[:3]

        best_crop_list = []
        total_savings = 0
        savings_count = 0

        for crop in crop_objs[:5]:
            # Sell timing
            signal = _sell_signal_for_crop(crop.id)

            # Multi-market comparison for this crop
            market_prices = (
                PriceEntry.objects.filter(crop=crop, status='approved')
                .values('market_id', 'market__name', 'market__region__name')
                .annotate(
                    avg_price=Avg('price'),
                    max_price=Max('price'),
                    min_price=Min('price'),
                    entry_count=Count('id'),
                    last_date=Max('price_date'),
                )
                .order_by('-avg_price')
            )[:5]

            market_list = []
            for mp in market_prices:
                freshness, fresh_color = _data_freshness(mp.get('last_date'))
                market_list.append({
                    'market_id': mp['market_id'],
                    'market_name': mp['market__name'],
                    'region': mp['market__region__name'],
                    'avg_price': round(mp['avg_price'], 2) if mp['avg_price'] else 0,
                    'max_price': round(mp['max_price'], 2) if mp['max_price'] else 0,
                    'min_price': round(mp['min_price'], 2) if mp['min_price'] else 0,
                    'entry_count': mp['entry_count'],
                    'freshness': freshness,
                    'freshness_color': fresh_color,
                })

            best_price = market_list[0]['avg_price'] if market_list else 0
            worst_price = market_list[-1]['avg_price'] if market_list else 0
            savings = round(best_price - worst_price, 2) if market_list else 0
            best_crop_list.append(crop.name)
            total_savings += savings
            savings_count += 1

            result['recommendations'].append({
                'id': f'farmer_{crop.id}',
                'type': 'crop_opportunity',
                'crop': crop.name,
                'crop_id': crop.id,
                'sell_signal': signal,
                'market_comparison': market_list,
                'best_price': best_price,
                'worst_price': worst_price,
                'potential_savings': savings,
                'title': f'{crop.name} — Market Overview',
                'description': f'Best avg TZS {best_price:,.0f}, spread of TZS {savings:,.0f} across {len(market_list)} markets. '
                               f'Signal: {signal["signal"] if signal else "insufficient data"}',
            })

        # summary
        result['summary'] = {
            'total_recommendations': len(result['recommendations']),
            'best_crops': best_crop_list[:3],
            'avg_savings': f'TZS {round(total_savings / max(savings_count, 1), 0):,.0f}' if total_savings > 0 else 'N/A',
        }

        # Weather-based recommendations for farmers
        if profile.region:
            weather = get_weather_context(profile.region)
            if weather:
                if weather.get('condition') == 'extreme':
                    result['recommendations'].append({
                        'id': 'weather_extreme',
                        'type': 'weather_alert',
                        'title': 'Extreme Weather Alert',
                        'description': 'Severe weather expected in your area — delay crop transport and protect stored produce.',
                        'weather': weather,
                        'icon': '⚠️',
                    })
                elif weather.get('condition') == 'wet':
                    result['recommendations'].append({
                        'id': 'weather_wet',
                        'type': 'weather_advisory',
                        'title': 'Wet Weather Expected',
                        'description': 'Rain may affect road conditions — plan transport accordingly or sell locally.',
                        'weather': weather,
                        'icon': '🌧️',
                    })
                else:
                    result['recommendations'].append({
                        'id': 'weather_fair',
                        'type': 'weather_info',
                        'title': 'Good Weather for Transport',
                        'description': 'Favorable conditions — good time to move crops to market.',
                        'weather': weather,
                        'icon': '☀️',
                    })

    elif role == 'trader':
        crops = Crop.objects.annotate(
            entry_count=Count('priceentry', filter=Q(priceentry__status='approved'))
        ).filter(entry_count__gte=2)[:10]

        total_opportunities = 0
        best_margins = []
        fresh_count = 0

        for crop in crops:
            markets_with_prices = (
                PriceEntry.objects.filter(crop=crop, status='approved')
                .values('market_id', 'market__name', 'market__region__name')
                .annotate(
                    avg_price=Avg('price'),
                    max_price=Max('price'),
                    min_price=Min('price'),
                    entry_count=Count('id'),
                    last_date=Max('price_date'),
                )
                .filter(avg_price__isnull=False)
                .order_by('-avg_price')
            )

            if markets_with_prices.count() < 2:
                continue

            best = markets_with_prices[0]
            worst = markets_with_prices[-1]
            gross_gap = round(best['avg_price'] - worst['avg_price'], 2)
            if gross_gap <= 50:
                continue

            # Estimate transport cost
            cost_per_kg, dist_km = _get_transport_cost_estimate(worst['market_id'], best['market_id'])
            net_profit = round(gross_gap - (cost_per_kg or 0), 2) if cost_per_kg else gross_gap
            margin_pct = round(net_profit / worst['avg_price'] * 100, 1) if worst['avg_price'] > 0 else 0

            buy_freshness, buy_fresh_color = _data_freshness(worst.get('last_date'))
            sell_freshness, sell_fresh_color = _data_freshness(best.get('last_date'))
            if buy_freshness in ('fresh', 'recent') and sell_freshness in ('fresh', 'recent'):
                fresh_count += 1

            if net_profit > 0:
                total_opportunities += 1
                best_margins.append(margin_pct)

                result['recommendations'].append({
                    'id': f'trader_{crop.id}_{worst["market_id"]}_{best["market_id"]}',
                    'type': 'arbitrage',
                    'crop': crop.name,
                    'crop_id': crop.id,
                    'buy_market': worst['market__name'],
                    'buy_market_id': worst['market_id'],
                    'buy_region': worst['market__region__name'],
                    'buy_price': round(worst['avg_price'], 2),
                    'buy_freshness': buy_freshness,
                    'buy_freshness_color': buy_fresh_color,
                    'sell_market': best['market__name'],
                    'sell_market_id': best['market_id'],
                    'sell_region': best['market__region__name'],
                    'sell_price': round(best['avg_price'], 2),
                    'sell_freshness': sell_freshness,
                    'sell_freshness_color': sell_fresh_color,
                    'gross_gap': gross_gap,
                    'transport_cost_per_kg': cost_per_kg or 0,
                    'distance_km': dist_km or 0,
                    'transport_included': cost_per_kg is not None,
                    'net_profit_per_kg': net_profit,
                    'margin_pct': margin_pct,
                    'title': f'{crop.name} — Buy {worst["market__name"]} → Sell {best["market__name"]}',
                    'description': (
                        f'Buy at TZS {worst["avg_price"]:,.0f}/kg, sell at TZS {best["avg_price"]:,.0f}/kg. '
                        f'Net profit TZS {net_profit:,.0f}/kg after transport (TZS {cost_per_kg or 0:,.0f}/kg). '
                        f'Margin: {margin_pct}%'
                    ),
                    'action': 'View Route',
                })

        result['summary'] = {
            'total_recommendations': len(result['recommendations']),
            'opportunities': total_opportunities,
            'avg_margin': f'{round(sum(best_margins) / max(len(best_margins), 1), 1)}%' if best_margins else 'N/A',
            'fresh_opportunities': fresh_count,
        }

        # Weather context for traders
        if profile.region:
            weather = get_weather_context(profile.region)
            if weather and weather.get('condition') == 'extreme':
                result['recommendations'].append({
                    'id': 'trader_weather',
                    'type': 'weather_alert',
                    'title': 'Weather Disruption Risk',
                    'description': 'Extreme weather may disrupt supply chains — review your open orders and adjust delivery timelines.',
                    'weather': weather,
                })

    elif role == 'agent':
        submissions = PriceEntry.objects.filter(submitted_by=request.user)
        submission_count = submissions.count()
        accurate = submissions.filter(is_anomaly=False).count()
        accuracy_rate = round(accurate / submission_count * 100, 1) if submission_count > 0 else 0

        # freshness of agent's last submission
        last_sub = submissions.order_by('-submitted_at').first()
        streak = 0
        if last_sub:
            delta = (now - last_sub.price_date).days
            streak = 1 if delta <= 1 else 0

        # Data quality feedback
        anomaly_rate = round(
            submissions.filter(is_anomaly=True).count() / submission_count * 100, 1
        ) if submission_count > 0 else 0

        quality = 'excellent' if accuracy_rate >= 95 else 'good' if accuracy_rate >= 80 else 'needs_improvement'
        quality_color = '#22c55e' if quality == 'excellent' else '#f59e0b' if quality == 'good' else '#ef4444'

        result['recommendations'].append({
            'type': 'performance',
            'total_submissions': submission_count,
            'accurate_submissions': accurate,
            'accuracy_rate': accuracy_rate,
            'anomaly_rate': anomaly_rate,
            'streak': streak,
            'data_quality': quality,
            'data_quality_color': quality_color,
            'title': 'Your Performance',
            'description': (
                f"{submission_count} submissions, {accuracy_rate}% accuracy. "
                f"Quality: {quality.replace('_', ' ').title()}. "
                f"{'Active streak: ' + str(streak) + ' day(s).' if streak > 0 else 'Submit today to start a streak.'}"
            ),
        })

        # Agent's top crops by submission count
        top_crops = (
            submissions.values('crop__name')
            .annotate(cnt=Count('id'))
            .order_by('-cnt')[:3]
        )
        if top_crops:
            result['recommendations'].append({
                'type': 'system_insight',
                'title': 'Your Most-Reported Crops',
                'description': ', '.join(f"{t['crop__name']} ({t['cnt']})" for t in top_crops),
            })

        result['summary'] = {
            'total_recommendations': len(result['recommendations']),
            'submissions': submission_count,
            'data_quality': quality.replace('_', ' ').title(),
            'accuracy_rate': f'{accuracy_rate}%',
        }

    elif role == 'admin':
        pending_count = PriceEntry.objects.filter(status__in=['flagged', 'pending']).count()
        pending_agents_count = UserProfile.objects.filter(role='agent', approval_status='pending').count()

        # Submission trend (last 7 days vs previous 7)
        last_7 = PriceEntry.objects.filter(
            submitted_at__gte=now - timedelta(days=7)
        ).count()
        prev_7 = PriceEntry.objects.filter(
            submitted_at__gte=now - timedelta(days=14),
            submitted_at__lt=now - timedelta(days=7),
        ).count()
        trend = 'up' if last_7 > prev_7 else 'down' if last_7 < prev_7 else 'stable'
        trend_color = '#22c55e' if trend == 'up' else '#ef4444' if trend == 'down' else '#f59e0b'

        # Active markets
        active_markets = Market.objects.filter(
            priceentry__status='approved'
        ).distinct().count()
        total_markets = Market.objects.count()

        # Active agents
        active_agents = UserProfile.objects.filter(
            role='agent', approval_status='approved',
        ).count()

        result['recommendations'].append({
            'type': 'admin_overview',
            'title': 'System Overview',
            'pending_reviews': pending_count,
            'pending_agents': pending_agents_count,
            'active_markets': active_markets,
            'total_markets': total_markets,
            'active_agents': active_agents,
            'submissions_last_7d': last_7,
            'submissions_prev_7d': prev_7,
            'trend': trend,
            'trend_color': trend_color,
            'description': (
                f'{pending_count} pending reviews, {pending_agents_count} pending agents. '
                f'Submissions: {last_7} (last 7d) vs {prev_7} (prev 7d) — {trend}. '
                f'{active_markets}/{total_markets} markets active, {active_agents} active agents.'
            ),
        })

        # Under-reported crops (data gaps)
        gap_crops = Crop.objects.annotate(
            entry_count=Count('priceentry', filter=Q(priceentry__status='approved'))
        ).filter(entry_count__lt=3).order_by('entry_count')[:5]

        if gap_crops:
            result['recommendations'].append({
                'type': 'data_quality',
                'title': 'Data Gaps — Low Coverage Crops',
                'description': ', '.join(f'{c.name} ({c.entry_count} entries)' for c in gap_crops),
                'action': 'Assign Agents',
            })

        result['summary'] = {
            'total_recommendations': len(result['recommendations']),
            'system_health': trend.title(),
            'active_markets': f'{active_markets}/{total_markets}',
        }

    return Response(result)


# ──────────────────────────── AGENT SUBMISSIONS ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def agent_submissions_list(request):
    """List all submissions for the current agent, or all for admin."""
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found'}, status=404)

    if profile.role not in ('agent', 'admin'):
        return Response({'error': 'Only agents and admins can view submissions'}, status=403)

    status_filter = request.query_params.get('status')
    qs = MarketAgentSubmission.objects.select_related(
        'agent', 'price_entry', 'price_entry__crop', 'price_entry__market',
        'price_entry__market__region',
    ).order_by('-submitted_at')

    if profile.role == 'agent':
        qs = qs.filter(agent=request.user)

    if status_filter:
        qs = qs.filter(status=status_filter)

    qs = qs[:100]
    serializer = AgentSubmissionSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def agent_submissions_stats(request):
    """Aggregate stats for the current agent's submissions."""
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found'}, status=404)

    qs = MarketAgentSubmission.objects.filter(agent=request.user)
    total = qs.count()
    published = qs.filter(status='published').count()
    flagged = qs.filter(status='flagged').count()
    live = qs.filter(status='live').count()
    under_review = qs.filter(status='under_review').count()

    # Accuracy: non-flagged / total
    accuracy = round((total - flagged) / total * 100, 1) if total > 0 else 0

    # Today's submissions
    today = timezone.now().date()
    today_count = qs.filter(submitted_at__date=today).count()

    # This week
    week_ago = today - timedelta(days=7)
    week_count = qs.filter(submitted_at__date__gte=week_ago).count()

    return Response({
        'total': total,
        'published': published,
        'flagged': flagged,
        'live': live,
        'under_review': under_review,
        'accuracy_rate': accuracy,
        'today_count': today_count,
        'week_count': week_count,
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def agent_submission_note(request, pk):
    """Update agent notes on a submission (agent or admin)."""
    try:
        profile = request.user.profile
    except UserProfile.DoesNotExist:
        return Response({'error': 'Profile not found'}, status=404)

    try:
        submission = MarketAgentSubmission.objects.get(pk=pk)
    except MarketAgentSubmission.DoesNotExist:
        return Response({'error': 'Submission not found'}, status=404)

    # Only the agent who owns it or an admin can update notes
    if profile.role != 'admin' and submission.agent != request.user:
        return Response({'error': 'Not authorized'}, status=403)

    serializer = AgentSubmissionNoteSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    submission.agent_notes = serializer.validated_data['agent_notes']

    # Admin can also change status
    new_status = serializer.validated_data.get('status')
    if new_status and profile.role == 'admin':
        submission.set_status(new_status)

    submission.save()
    return Response(AgentSubmissionSerializer(submission).data)


# ──────────────────────────── SPREAD ANALYSIS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def spread_analysis(request):
    """Compare buy vs sell markets — gross and transport-adjusted net spread."""
    crop_id = request.query_params.get('crop')

    crops_qs = Crop.objects.all()
    if crop_id:
        crops_qs = crops_qs.filter(id=crop_id)

    results = []
    for crop in crops_qs[:10]:
        # Get latest prices per market for this crop
        market_prices = {}
        entries = PriceEntry.objects.filter(
            crop=crop, status='approved',
price_date__gte=timezone.now().date() - timedelta(days=60),
        ).values('market__id', 'market__name', 'market__region__name', 'price').order_by('-price_date')

        for e in entries:
            mid = e['market__id']
            if mid not in market_prices:
                market_prices[mid] = {
                    'market_id': mid,
                    'market': e['market__name'],
                    'region': e['market__region__name'],
                    'price': e['price'],
                }

        if len(market_prices) < 2:
            continue

        prices_list = list(market_prices.values())
        prices_list.sort(key=lambda x: x['price'])
        lowest = prices_list[0]
        highest = prices_list[-1]

        gross_spread = highest['price'] - lowest['price']

        # Look up transport cost between these markets
        transport_cost = 0
        try:
            route = TransportRoute.objects.get(
                origin_market_id=lowest['market_id'],
                destination_market_id=highest['market_id'],
            )
            transport_cost = route.base_cost_tzs
        except TransportRoute.DoesNotExist:
            # Estimate: ~TZS 100 per 100km as default
            transport_cost = 500

        net_spread = max(gross_spread - transport_cost, 0)

        results.append({
            'crop': crop.name,
            'crop_id': crop.id,
            'buy_market': lowest['market'],
            'buy_region': lowest['region'],
            'buy_price': round(lowest['price'], 2),
            'sell_market': highest['market'],
            'sell_region': highest['region'],
            'sell_price': round(highest['price'], 2),
            'gross_spread': round(gross_spread, 2),
            'transport_cost_estimate': round(transport_cost, 2),
            'net_spread': round(net_spread, 2),
            'margin_pct': round(net_spread / lowest['price'] * 100, 1) if lowest['price'] > 0 else 0,
        })

    results.sort(key=lambda x: x['net_spread'], reverse=True)
    return Response({'spreads': results, 'count': len(results)})


# ──────────────────────────── SUPPLY TRACKER ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def supply_tracker(request):
    """Aggregate crop volumes per region and classify surplus/deficit/neutral."""
    crop_id = request.query_params.get('crop')
    region_id = request.query_params.get('region')

    entries = PriceEntry.objects.filter(
        status='approved',
        price_date__gte=timezone.now().date() - timedelta(days=30),
    )
    if crop_id:
        entries = entries.filter(crop_id=crop_id)
    if region_id:
        entries = entries.filter(market__region_id=region_id)

    # Aggregate by region using entry count as supply proxy
    region_data = {}
    for e in entries.values(
        'market__region__name', 'market__region__id', 'crop__name', 'price'
    ):
        rname = e['market__region__name']
        rid = e['market__region__id']
        if rname not in region_data:
            region_data[rname] = {
                'region_id': rid,
                'region': rname,
                'total_quantity': 0,
                'entry_count': 0,
                'crops': set(),
                'total_price': 0.0,
            }
        region_data[rname]['entry_count'] += 1
        region_data[rname]['crops'].add(e['crop__name'])
        region_data[rname]['total_price'] += (e['price'] or 0)

    # Use entry_count as supply proxy (higher entry count = more market activity = surplus)
    counts = [r['entry_count'] for r in region_data.values() if r['entry_count'] > 0]
    median_count = float(np.median(counts)) if counts else 0

    result = []
    for rd in region_data.values():
        cnt = rd['entry_count']
        if cnt > median_count * 1.3:
            classification = 'surplus'
        elif cnt < median_count * 0.7:
            classification = 'deficit'
        else:
            classification = 'neutral'

        avg_price = round(rd['total_price'] / cnt, 2) if cnt > 0 else 0

        result.append({
            'region_id': rd['region_id'],
            'region': rd['region'],
            'total_quantity': round(rd['total_price'], 2),
            'entry_count': cnt,
            'crop_count': len(rd['crops']),
            'crops': list(rd['crops'])[:10],
            'classification': classification,
            'avg_price': avg_price,
        })

    result.sort(key=lambda x: x['entry_count'], reverse=True)
    return Response({
        'regions': result,
        'median_quantity': round(median_count, 2),
        'period_days': 30,
    })


# ──────────────────────────── BEST MARKET FINDER ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def best_market(request):
    """Rank markets by net price (price minus estimated transport cost)."""
    crop_id = request.query_params.get('crop')
    origin_market_id = request.query_params.get('origin')

    if not crop_id:
        return Response({'error': 'crop parameter is required'}, status=400)

    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    # Latest prices for this crop across markets
    entries = PriceEntry.objects.filter(
        crop=crop, status='approved',
        price_date__gte=timezone.now().date() - timedelta(days=14),
    ).values(
        'market__id', 'market__name', 'market__region__name',
        'market__district', 'price', 'price_date',
    ).order_by('-price_date')

    # Deduplicate by market (take latest)
    market_prices = {}
    for e in entries:
        mid = e['market__id']
        if mid not in market_prices:
            market_prices[mid] = e

    results = []
    for mid, data in market_prices.items():
        transport_cost = 0
        if origin_market_id:
            try:
                route = TransportRoute.objects.get(
                    origin_market_id=origin_market_id,
                    destination_market_id=mid,
                )
                transport_cost = route.base_cost_tzs
            except TransportRoute.DoesNotExist:
                transport_cost = 500  # default estimate

        net_price = data['price'] - transport_cost
        results.append({
            'market_id': mid,
            'market': data['market__name'],
            'region': data['market__region__name'],
            'district': data['market__district'],
            'gross_price': round(data['price'], 2),
            'transport_cost': round(transport_cost, 2),
            'net_price': round(max(net_price, 0), 2),
            'price_date': str(data['price_date']),
        })

    results.sort(key=lambda x: x['net_price'], reverse=True)

    best_sell = results[0] if results else None
    best_buy = results[-1] if results else None

    return Response({
        'crop': crop.name,
        'crop_id': crop.id,
        'rankings': results[:20],
        'best_sell_market': best_sell,
        'best_buy_market': best_buy,
        'total_markets': len(results),
    })


# ──────────────────────────── TRANSPORT COST CALCULATOR ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def transport_cost(request):
    """Calculate transport cost between two markets with vehicle type options."""
    origin_id = request.query_params.get('origin')
    destination_id = request.query_params.get('destination')
    vehicle_type = request.query_params.get('vehicle', 'lorry')
    try:
        quantity_kg = float(request.query_params.get('quantity', 100))
    except (ValueError, TypeError):
        quantity_kg = 100.0

    if not origin_id or not destination_id:
        return Response({'error': 'origin and destination market IDs required'}, status=400)

    try:
        origin = Market.objects.get(id=origin_id)
        destination = Market.objects.get(id=destination_id)
    except Market.DoesNotExist:
        return Response({'error': 'Market not found'}, status=404)

    # Look up route
    route = None
    try:
        route = TransportRoute.objects.get(origin_market=origin, destination_market=destination)
    except TransportRoute.DoesNotExist:
        try:
            route = TransportRoute.objects.get(origin_market=destination, destination_market=origin)
        except TransportRoute.DoesNotExist:
            pass

    # Weather context for transport risk
    origin_weather = get_weather_context(origin.region.name)
    dest_weather = get_weather_context(destination.region.name)

    weather_risk = 1.0
    weather_advisory = None
    for w in [origin_weather, dest_weather]:
        if w and w.get('condition') == 'extreme':
            weather_risk = 1.25
            weather_advisory = 'Extreme weather may affect transport — consider delaying'
            break
        elif w and w.get('condition') == 'wet' and weather_risk < 1.15:
            weather_risk = 1.15
            weather_advisory = 'Rain expected — transport may take longer than usual'

    if route:
        vehicle_cost = route.get_vehicle_cost(vehicle_type)
        base_total = vehicle_cost + (route.cost_per_kg * quantity_kg)
        total_cost = round(base_total * weather_risk, 2)
        result = {
            'origin': origin.name,
            'origin_region': origin.region.name,
            'destination': destination.name,
            'destination_region': destination.region.name,
            'distance_km': route.distance_km,
            'estimated_hours': route.estimated_hours,
            'road_quality': route.road_quality,
            'is_seasonal': route.is_seasonal,
            'vehicle_type': vehicle_type,
            'vehicle_cost': round(vehicle_cost, 2),
            'cost_per_kg': route.cost_per_kg,
            'quantity_kg': quantity_kg,
            'total_transport_cost': total_cost,
            'cost_per_kg_total': round(total_cost / quantity_kg, 2) if quantity_kg > 0 else 0,
        }
    else:
        # No route found — estimate based on region distance heuristic
        same_region = origin.region_id == destination.region_id
        est_distance = 30 if same_region else 150
        est_cost = est_distance * 50
        base_total = est_cost + (quantity_kg * 5)
        total_cost = round(base_total * weather_risk, 2)
        result = {
            'origin': origin.name,
            'origin_region': origin.region.name,
            'destination': destination.name,
            'destination_region': destination.region.name,
            'distance_km': est_distance,
            'estimated_hours': round(est_distance / 60, 1),
            'road_quality': 'unknown',
            'is_seasonal': False,
            'vehicle_type': vehicle_type,
            'vehicle_cost': round(est_cost, 2),
            'cost_per_kg': 5.0,
            'quantity_kg': quantity_kg,
            'total_transport_cost': total_cost,
            'cost_per_kg_total': round(total_cost / quantity_kg, 2) if quantity_kg > 0 else 0,
            'note': 'Estimated — no recorded route between these markets',
        }

    if weather_advisory:
        result['weather_advisory'] = weather_advisory
        result['weather_risk_multiplier'] = weather_risk
    result['origin_weather'] = origin_weather
    result['destination_weather'] = dest_weather

    return Response(result)


@api_view(['POST', 'GET'])
@permission_classes([AllowAny])
def calculate_transport(request):
    """
    Full logistics engine: Dijkstra shortest path + all transport modes.
    Returns route path, distance, time, and cost for truck/bus/motorcycle/pickup.
    Applies road condition, traffic, cargo delay, weight scaling, and smart pricing.
    Backward-compatible: old single-vehicle fields still included.
    """
    from .models import RegionRoute, PricingRule
    from .transport_engine import build_graph, calculate_all_modes, dijkstra

    # Accept both POST body and GET params
    if request.method == 'POST':
        data = request.data
    else:
        data = request.query_params

    origin_name = data.get('from') or data.get('origin')
    dest_name = data.get('to') or data.get('destination')
    try:
        weight_kg = float(data.get('weight') or data.get('quantity') or 1000)
    except (ValueError, TypeError):
        weight_kg = 1000.0
    vehicle_type = data.get('vehicle_type') or data.get('vehicle') or 'truck'

    if not origin_name or not dest_name:
        return Response({'error': 'Both origin (from) and destination (to) are required.'}, status=400)

    if origin_name.lower() == dest_name.lower():
        return Response({'error': 'Origin and destination cannot be the same.'}, status=400)

    # Find regions (by name, case-insensitive)
    try:
        origin_region = Region.objects.filter(name__icontains=origin_name).first()
        dest_region = Region.objects.filter(name__icontains=dest_name).first()
    except Exception:
        origin_region = None
        dest_region = None

    if not origin_region:
        return Response({'error': f'Origin region "{origin_name}" not found.'}, status=404)
    if not dest_region:
        return Response({'error': f'Destination region "{dest_name}" not found.'}, status=404)

    # Build graph from all routes
    routes = RegionRoute.objects.select_related('from_region', 'to_region').all()
    if not routes.exists():
        return Response({'error': 'No transport routes configured. Run: python manage.py seed_transport_network'}, status=500)

    graph = build_graph(routes)

    # Build region name lookup
    region_names = {}
    for r in routes:
        region_names[r.from_region_id] = r.from_region.name
        region_names[r.to_region_id] = r.to_region.name

    # ── NEW: Environment & fuel parameters ──
    terrain = (data.get('terrain') or 'tambarare').lower()
    season = (data.get('season') or 'jua').lower()
    soil_type = (data.get('soil_type') or 'loam').lower()
    try:
        fuel_price_tsh = float(data.get('fuel_price')) if data.get('fuel_price') else None
    except (ValueError, TypeError):
        fuel_price_tsh = None

    # ── Full logistics engine — all modes at once ──
    logistics = calculate_all_modes(
        graph, origin_region.id, dest_region.id, region_names, weight_kg,
        terrain=terrain, season=season, soil_type=soil_type,
        fuel_price_tsh=fuel_price_tsh,
    )

    if not logistics:
        return Response({
            'error': f'No route found between {origin_region.name} and {dest_region.name}.',
            'suggestion': 'Try using a different origin/destination pair that is connected.',
        }, status=404)

    # ── Build response ──
    response = {
        'origin': origin_region.name,
        'destination': dest_region.name,
        'weight_kg': weight_kg,
        # Multi-mode response
        'route': logistics['route'],
        'distance_km': logistics['distance_km'],
        'results': logistics['results'],
        'road_condition': logistics['road_condition'],
        'traffic_factor': logistics['traffic_factor'],
        'weight_scale': logistics['weight_scale'],
        'corridors': logistics['corridors'],
        # Environment & fuel factors
        'terrain': logistics.get('terrain'),
        'terrain_display': logistics.get('terrain_display'),
        'terrain_factor': logistics.get('terrain_factor'),
        'season': logistics.get('season'),
        'season_display': logistics.get('season_display'),
        'season_factor': logistics.get('season_factor'),
        'soil_type': logistics.get('soil_type'),
        'soil_display': logistics.get('soil_display'),
        'soil_season_factor': logistics.get('soil_season_factor'),
        'fuel_price_tsh': logistics.get('fuel_price_tsh'),
        'fuel_factor': logistics.get('fuel_factor'),
        'environment_factor': logistics.get('environment_factor'),
    }

    # ── Backward compatibility: include old single-vehicle fields ──
    selected = logistics['results'].get(vehicle_type, {})
    if selected:
        response['vehicle_type'] = vehicle_type
        response['vehicle_display'] = selected.get('display', vehicle_type)
        response['cost_tsh'] = selected.get('cost', 0)
        response['cost_per_kg'] = round(selected.get('cost', 0) / max(weight_kg, 1), 2)
        response['estimated_time'] = selected.get('time', '')
        response['estimated_time_hours'] = selected.get('time_hours', 0)
        response['base_cost'] = selected.get('cost_raw', 0)

    # Also compute fastest route for comparison (old feature)
    fastest_dist, fastest_path, fastest_edges = dijkstra(
        graph, origin_region.id, dest_region.id, weight='time'
    )
    if fastest_path and fastest_path != logistics.get('route'):
        response['fastest_route'] = {
            'route': [region_names.get(rid, str(rid)) for rid in fastest_path],
            'total_time_hours': round(fastest_dist, 1) if fastest_dist else None,
        }

    return Response(response)


@api_view(['POST', 'GET'])
@permission_classes([AllowAny])
def multi_stage_transport(request):
    """
    Full multi-stage transport cost from farm to market.

    Journey stages:
      1. Shamba → Barabara (farm to road): punda/toyo/binadamu
      2. Kupakia (loading at road)
      3. Barabara (main road transport): truck/bus/pickup/motorcycle
      4. Kupakua (unloading at destination)
      5. Piki Piki (optional motorcycle last-mile)

    Accepts parameters:
      from/to: region names (required)
      weight: cargo weight in kg (default 1000)
      farm_to_road_km: distance from farm to nearest road (default 3km)
      farm_mode: punda, toyo, or binadamu (default punda)
      terrain: tambarare, milima, mito, mabonde (default tambarare)
      season: mvua, jua (default jua)
      soil_type: mfinyanzi, mchanga, loam (default loam)
      fuel_price: current diesel TSH/liter (default baseline)
      motorcycle_pickup: true/false (default true)

    Based on field interview data from Tanzania farmers and traders.
    """
    from .models import RegionRoute
    from .transport_engine import (
        build_graph, calculate_multi_stage_transport,
        TERRAIN_FACTORS, SEASON_FACTORS, SOIL_TYPES,
        FARM_STAGE_MODES, FUEL_PRICE_CONFIG,
        DESTINATION_TYPES,
    )

    if request.method == 'POST':
        data = request.data
    else:
        data = request.query_params

    origin_name = data.get('from') or data.get('origin')
    dest_name = data.get('to') or data.get('destination')

    if not origin_name or not dest_name:
        return Response({'error': 'Both origin (from) and destination (to) are required.'}, status=400)

    try:
        weight_kg = float(data.get('weight') or data.get('quantity') or 1000)
    except (ValueError, TypeError):
        weight_kg = 1000.0
    try:
        farm_to_road_km = float(data.get('farm_to_road_km') or data.get('farm_distance') or 3.0)
    except (ValueError, TypeError):
        farm_to_road_km = 3.0
    try:
        fuel_price_tsh = float(data.get('fuel_price')) if data.get('fuel_price') else None
    except (ValueError, TypeError):
        fuel_price_tsh = None

    farm_mode = (data.get('farm_mode') or 'punda').lower()
    terrain = (data.get('terrain') or 'tambarare').lower()
    season = (data.get('season') or 'jua').lower()
    soil_type = (data.get('soil_type') or 'loam').lower()
    needs_moto = str(data.get('motorcycle_pickup', 'true')).lower() in ('true', '1', 'yes')

    # Destination type determines which stages are included
    destination_type = (data.get('destination_type') or 'region_to_region').lower()
    dest_cfg = DESTINATION_TYPES.get(destination_type, DESTINATION_TYPES['region_to_region'])
    # Override motorcycle pickup based on destination type if not explicitly set
    if 'motorcycle_pickup' not in data:
        needs_moto = dest_cfg.get('default_motorcycle_pickup', False)

    # Find regions
    origin_region = Region.objects.filter(name__icontains=origin_name).first()
    dest_region = Region.objects.filter(name__icontains=dest_name).first()

    if not origin_region:
        return Response({'error': f'Origin region "{origin_name}" not found.'}, status=404)
    if not dest_region:
        return Response({'error': f'Destination region "{dest_name}" not found.'}, status=404)

    # Build graph
    routes = RegionRoute.objects.select_related('from_region', 'to_region').all()
    if not routes.exists():
        return Response({'error': 'No transport routes configured. Run: python manage.py seed_transport_network'}, status=500)

    graph = build_graph(routes)
    region_names = {}
    for r in routes:
        region_names[r.from_region_id] = r.from_region.name
        region_names[r.to_region_id] = r.to_region.name

    # Calculate multi-stage transport
    result = calculate_multi_stage_transport(
        graph, origin_region.id, dest_region.id, region_names,
        weight_kg=weight_kg,
        farm_to_road_km=farm_to_road_km,
        farm_mode=farm_mode,
        terrain=terrain,
        season=season,
        soil_type=soil_type,
        fuel_price_tsh=fuel_price_tsh,
        needs_motorcycle_pickup=needs_moto,
    )

    if not result or not result.get('road_logistics'):
        return Response({
            'error': f'No route found between {origin_region.name} and {dest_region.name}.',
        }, status=404)

    # Add origin/destination and destination type to response
    result['origin'] = origin_region.name
    result['destination'] = dest_region.name
    result['destination_type'] = destination_type
    result['destination_type_display'] = dest_cfg['display']
    result['destination_types'] = {k: {
        'display': v['display'],
        'description': v['description'],
        'icon': v['icon'],
    } for k, v in DESTINATION_TYPES.items()}

    return Response(result)


# ──────────────────────────── SELL TIMING ADVISOR ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def sell_advisor(request):
    """Compare moving averages and seasonal baseline to output SELL NOW / WAIT / HOLD."""
    crop_id = request.query_params.get('crop')
    market_id = request.query_params.get('market')

    if not crop_id:
        return Response({'error': 'crop parameter is required'}, status=400)

    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    qs = PriceEntry.objects.filter(crop=crop, status='approved').order_by('price_date')
    if market_id:
        qs = qs.filter(market_id=market_id)

    # Group by date
    date_prices = {}
    for entry in qs.values_list('price_date', 'price'):
        d = str(entry[0])
        if d not in date_prices:
            date_prices[d] = []
        date_prices[d].append(entry[1])

    if len(date_prices) < 7:
        return Response({
            'crop': crop.name,
            'signal': 'insufficient_data',
            'message': 'Not enough data to make a timing recommendation',
        })

    timeline = sorted(date_prices.keys())
    avg_prices = [float(np.mean(date_prices[d])) for d in timeline]

    current = avg_prices[-1]
    ma_7 = float(np.mean(avg_prices[-7:])) if len(avg_prices) >= 7 else current
    ma_30 = float(np.mean(avg_prices[-30:])) if len(avg_prices) >= 30 else current
    seasonal_avg = float(np.mean(avg_prices))  # full historical as seasonal baseline

    # Scoring (0-100): higher = better to hold, lower = sell now
    score = 50  # neutral start

    # Current vs 7-day MA
    if current > ma_7 * 1.05:
        score += 15  # price above short-term trend — might peak soon
    elif current < ma_7 * 0.95:
        score -= 15  # below trend — might be falling

    # Current vs 30-day MA
    if current > ma_30 * 1.08:
        score += 20  # significantly above monthly avg
    elif current < ma_30 * 0.92:
        score -= 20

    # Current vs seasonal baseline
    if current > seasonal_avg * 1.10:
        score += 15  # above seasonal norm — good time
    elif current < seasonal_avg * 0.90:
        score -= 15

    # Trend direction (linear regression on last 14 points)
    recent = avg_prices[-14:] if len(avg_prices) >= 14 else avg_prices
    if len(recent) >= 3:
        x = np.arange(len(recent))
        slope, _ = np.polyfit(x, recent, 1)
        if slope > 0:
            score += 10  # rising trend
        else:
            score -= 10

    score = max(0, min(100, score))

    if score >= 70:
        signal = 'hold'
        message = 'Prices are trending up — holding may yield better returns.'
        color = '#22c55e'
    elif score <= 30:
        signal = 'sell_now'
        message = 'Prices are declining — consider selling soon to avoid further drops.'
        color = '#ef4444'
    else:
        signal = 'wait'
        message = 'Market is relatively stable — no urgent action needed.'
        color = '#f59e0b'

    pct_vs_7d = round((current - ma_7) / ma_7 * 100, 1) if ma_7 > 0 else 0
    pct_vs_30d = round((current - ma_30) / ma_30 * 100, 1) if ma_30 > 0 else 0
    pct_vs_season = round((current - seasonal_avg) / seasonal_avg * 100, 1) if seasonal_avg > 0 else 0

    result = {
        'crop': crop.name,
        'crop_id': crop.id,
        'market': Market.objects.get(id=market_id).name if market_id else 'All markets',
        'signal': signal,
        'signal_color': color,
        'score': score,
        'message': message,
        'current_price': round(current, 2),
        'ma_7d': round(ma_7, 2),
        'ma_30d': round(ma_30, 2),
        'seasonal_baseline': round(seasonal_avg, 2),
        'pct_vs_7d': pct_vs_7d,
        'pct_vs_30d': pct_vs_30d,
        'pct_vs_seasonal': pct_vs_season,
        'data_points': len(avg_prices),
    }

    # Weather context for the market's region
    if market_id:
        try:
            mkt = Market.objects.get(id=market_id)
            weather = get_weather_context(mkt.region.name)
            if weather:
                result['weather'] = weather
                if weather.get('condition') in ('extreme', 'wet'):
                    score -= 10
                    result['score'] = max(0, min(100, score))
                    if result['score'] <= 30:
                        result['signal'] = 'sell_now'
                        result['signal_color'] = '#ef4444'
                        result['message'] += ' Poor weather expected — consider selling sooner.'
        except Market.DoesNotExist:
            pass

    return Response(result)


# ──────────────────────────── OHLC DATA (Candlestick Charts) ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def price_ohlc(request):
    """Return OHLC candlestick data for a crop/market pair with moving averages."""
    crop_id = request.query_params.get('crop')
    market_id = request.query_params.get('market')
    interval = request.query_params.get('interval', '1D')  # 1D, 1W, 1M
    from_date = request.query_params.get('from')
    to_date = request.query_params.get('to')

    if not crop_id:
        return Response({'error': 'crop parameter required'}, status=400)

    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    region_name = request.query_params.get('region')

    qs = PriceEntry.objects.filter(crop=crop, status='approved').order_by('price_date')
    if market_id:
        qs = qs.filter(market_id=market_id)
        try:
            market_obj = Market.objects.get(id=market_id)
            market_name = market_obj.name
        except Market.DoesNotExist:
            market_name = 'Unknown'
    else:
        market_name = 'National Average'

    if region_name:
        try:
            region_id = int(region_name)
            qs = qs.filter(market__region_id=region_id)
        except (ValueError, TypeError):
            qs = qs.filter(market__region__name__icontains=region_name)
        if not market_id:
            market_name = f'{region_name} Region'

    if from_date:
        qs = qs.filter(price_date__gte=from_date)
    if to_date:
        qs = qs.filter(price_date__lte=to_date)

    # Group prices by date
    date_entries = {}
    for entry in qs.values_list('price_date', 'price'):
        d = str(entry[0])
        if d not in date_entries:
            date_entries[d] = []
        date_entries[d].append(entry[1])

    if not date_entries:
        return Response({'error': 'No data available'}, status=404)

    timeline = sorted(date_entries.keys())
    daily_ohlc = []
    daily_volumes = []

    for d in timeline:
        prices = date_entries[d]
        ohlc = {
            'time': d,
            'open': round(float(prices[0]), 2),
            'high': round(float(max(prices)), 2),
            'low': round(float(min(prices)), 2),
            'close': round(float(prices[-1]), 2),
        }
        daily_ohlc.append(ohlc)
        daily_volumes.append({'time': d, 'value': len(prices)})

    # Weekly aggregation if requested
    if interval == '1W' and len(daily_ohlc) > 7:
        weekly = []
        for i in range(0, len(daily_ohlc), 7):
            chunk = daily_ohlc[i:i+7]
            if chunk:
                weekly.append({
                    'time': chunk[0]['time'],
                    'open': chunk[0]['open'],
                    'high': max(c['high'] for c in chunk),
                    'low': min(c['low'] for c in chunk),
                    'close': chunk[-1]['close'],
                })
        daily_ohlc = weekly

    # Compute 7-day and 30-day moving averages
    closes = [c['close'] for c in daily_ohlc]
    ma7, ma30 = [], []
    for i in range(len(closes)):
        if i >= 6:
            ma7.append({'time': daily_ohlc[i]['time'], 'value': round(float(np.mean(closes[i-6:i+1])), 2)})
        if i >= 29:
            ma30.append({'time': daily_ohlc[i]['time'], 'value': round(float(np.mean(closes[i-29:i+1])), 2)})

    return Response({
        'crop': crop.name,
        'crop_id': crop.id,
        'market': market_name,
        'currency': 'TZS',
        'unit': 'kg',
        'data': daily_ohlc,
        'volume': daily_volumes,
        'ma7': ma7,
        'ma30': ma30,
    })


# ──────────────────────────── REGION CROPS ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def region_crops(request):
    """Return crops that have price data in the given region."""
    region = request.query_params.get('region')
    if not region:
        return Response([])
    crop_ids = PriceEntry.objects.filter(
        status='approved',
        market__region__name__icontains=region
    ).values_list('crop_id', flat=True).distinct()
    crops = Crop.objects.filter(id__in=crop_ids).values('id', 'name', 'category')
    return Response(list(crops))


# ──────────────────────────── HEATMAP DATA ────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def price_heatmap(request):
    """Regional price heatmap data — price per crop per region with tier classification."""
    crop_ids = request.query_params.getlist('crop_ids')
    target_date = request.query_params.get('date')

    if not target_date:
        target_date = timezone.now().date() - timedelta(days=3)  # last 3 days for coverage

    # Get top crops if none specified
    if crop_ids:
        crops = Crop.objects.filter(id__in=crop_ids)
    else:
        crops = Crop.objects.annotate(
            entry_count=Count('prices', filter=Q(prices__status='approved'))
        ).order_by('-entry_count')[:8]

    crop_list = list(crops)
    crop_names = [c.name for c in crop_list]

    # Get prices per region per crop (latest 90 days for better coverage)
    cutoff = timezone.now().date() - timedelta(days=90)
    entries = PriceEntry.objects.filter(
        crop__in=crop_list, status='approved', price_date__gte=cutoff,
    ).values(
        'market__region__name', 'market__region__id',
        'crop__name', 'crop__id', 'price', 'price_date',
    ).order_by('-price_date')

    # Build region → crop → price map
    region_map = {}
    for e in entries:
        rname = e['market__region__name']
        rid = e['market__region__id']
        cname = e['crop__name']

        if rname not in region_map:
            region_map[rname] = {'region_id': rid, 'name': rname, 'prices': {}}

        if cname not in region_map[rname]['prices']:
            region_map[rname]['prices'][cname] = []
        region_map[rname]['prices'][cname].append(e['price'])

    # Compute per-crop national stats for tier classification
    crop_stats = {}
    for crop in crop_list:
        all_prices = []
        for rdata in region_map.values():
            all_prices.extend(rdata['prices'].get(crop.name, []))
        if all_prices:
            mn, mx = min(all_prices), max(all_prices)
            rng = mx - mn
            crop_stats[crop.name] = {
                'min': mn, 'max': mx,
                'tier1': mn + rng * 0.33,
                'tier2': mn + rng * 0.66,
                'avg': float(np.mean(all_prices)),
            }

    # Build final response
    regions = []
    for rname, rdata in sorted(region_map.items()):
        prices_out = {}
        for cname in crop_names:
            p_list = rdata['prices'].get(cname, [])
            if not p_list:
                prices_out[cname] = None
                continue

            avg_price = float(np.mean(p_list))
            stats = crop_stats.get(cname, {})
            tier1 = stats.get('tier1', 0)
            tier2 = stats.get('tier2', 0)

            if avg_price <= tier1:
                tier = 'low'
            elif avg_price <= tier2:
                tier = 'mid'
            else:
                tier = 'high'

            prices_out[cname] = {
                'price': round(avg_price, 2),
                'count': len(p_list),
                'tier': tier,
                'updated': 'recent',
            }

        regions.append({
            'region_id': rdata['region_id'],
            'name': rname,
            'prices': prices_out,
        })

    return Response({
        'date': str(timezone.now().date()),
        'crops': crop_names,
        'regions': regions,
        'crop_stats': {k: {sk: round(sv, 2) if isinstance(sv, float) else sv
                          for sk, sv in v.items()} for k, v in crop_stats.items()},
    })


# ──────────────────────────── ENHANCED FORECAST (with confidence bands) ────────

@api_view(['GET'])
@permission_classes([AllowAny])
def price_forecast_enhanced(request):
    """Enhanced forecast with confidence bands for lightweight-charts."""
    crop_id = request.query_params.get('crop')
    market_id = request.query_params.get('market')
    horizon = request.query_params.get('horizon', 7)
    try:
        horizon = int(horizon)
    except (ValueError, TypeError):
        horizon = 7

    if not crop_id:
        return Response({'error': 'crop parameter required'}, status=400)

    try:
        crop = Crop.objects.get(id=crop_id)
    except Crop.DoesNotExist:
        return Response({'error': 'Crop not found'}, status=404)

    qs = PriceEntry.objects.filter(crop=crop, status='approved').order_by('price_date')
    if market_id:
        qs = qs.filter(market_id=market_id)

    date_prices = {}
    for d, p in qs.values_list('price_date', 'price'):
        ds = str(d)
        if ds not in date_prices:
            date_prices[ds] = []
        date_prices[ds].append(p)

    if len(date_prices) < 5:
        return Response({'error': 'Insufficient data for forecasting'}, status=404)

    timeline = sorted(date_prices.keys())
    avg_prices = [float(np.mean(date_prices[d])) for d in timeline]
    y = np.array(avg_prices)
    x = np.arange(len(y))

    # Linear regression
    slope, intercept = np.polyfit(x, y, 1)

    # Residuals for confidence band
    y_pred = slope * x + intercept
    residuals = y - y_pred
    std_resid = float(np.std(residuals))

    # Historical data for chart
    historical = [{'time': timeline[i], 'value': round(avg_prices[i], 2)} for i in range(len(timeline))]

    # Forecast: generate future dates
    from datetime import date as date_cls
    last_date = date_cls.fromisoformat(timeline[-1])
    forecast_mid, forecast_upper, forecast_lower = [], [], []

    for day_offset in range(1, horizon + 1):
        future_date = last_date + timedelta(days=day_offset)
        predicted = intercept + slope * (len(avg_prices) + day_offset - 1)
        # Confidence widens over time
        uncertainty = std_resid * (1 + day_offset * 0.15)
        upper = predicted + 1.96 * uncertainty
        lower = predicted - 1.96 * uncertainty

        ds = str(future_date)
        forecast_mid.append({'time': ds, 'value': round(max(predicted, 0), 2)})
        forecast_upper.append({'time': ds, 'value': round(max(upper, 0), 2)})
        forecast_lower.append({'time': ds, 'value': round(max(lower, 0), 2)})

    # R-squared
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
    confidence = int(min(max(r_squared * 100, 0), 100))

    # Direction
    current = avg_prices[-1]
    end_forecast = forecast_mid[-1]['value'] if forecast_mid else current
    pct_change = round((end_forecast - current) / current * 100, 1) if current > 0 else 0
    direction = 'rising' if pct_change > 2 else 'falling' if pct_change < -2 else 'stable'

    # Recommendation
    if direction == 'rising':
        recommendation = 'HOLD'
    elif direction == 'falling':
        recommendation = 'SELL NOW'
    else:
        recommendation = 'WAIT'

    return Response({
        'crop': crop.name,
        'crop_id': crop.id,
        'historical': historical[-60:],  # last 60 days
        'forecast': {
            'midpoint': forecast_mid,
            'upper': forecast_upper,
            'lower': forecast_lower,
        },
        'confidence': confidence,
        'direction': direction,
        'pct_change': pct_change,
        'recommendation': recommendation,
        'risk_factors': ['Based on historical linear trend only'],
    })


# ──────────────────────────── PRICE ALERTS ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_alerts(request):
    """List all price alerts for the current user."""
    qs = PriceAlert.objects.filter(user=request.user).select_related('crop', 'market')
    serializer = PriceAlertSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_alert(request):
    """Create a new price alert."""
    serializer = PriceAlertCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    alert = serializer.save(user=request.user)
    return Response(PriceAlertSerializer(alert).data, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_alert(request, pk):
    """Delete a price alert. Users can only delete their own."""
    try:
        alert = PriceAlert.objects.get(pk=pk, user=request.user)
    except PriceAlert.DoesNotExist:
        return Response({'error': 'Alert not found.'}, status=status.HTTP_404_NOT_FOUND)

    alert.delete()
    return Response({'message': 'Alert deleted.'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_alerts(request):
    """Check all active alerts for the current user and trigger if conditions are met."""
    alerts = PriceAlert.objects.filter(user=request.user, status='active').select_related('crop', 'market')
    triggered = []

    for alert in alerts:
        # Get latest approved price for this crop (and optionally market)
        qs = PriceEntry.objects.filter(crop=alert.crop, status='approved')
        if alert.market:
            qs = qs.filter(market=alert.market)
        qs = qs.order_by('-price_date', '-submitted_at')

        latest = qs.first()
        if not latest:
            continue

        # Get previous price for comparison
        previous = qs.exclude(pk=latest.pk).first()
        alert.last_checked = timezone.now()

        should_trigger = False
        current_price = latest.price

        if alert.alert_type == 'above_threshold' and alert.threshold_price:
            if current_price >= alert.threshold_price:
                should_trigger = True
        elif alert.alert_type == 'below_threshold' and alert.threshold_price:
            if current_price <= alert.threshold_price:
                should_trigger = True
        elif alert.alert_type in ('price_drop', 'price_rise') and previous:
            pct_change = alert.pct_change or 10.0
            prev_price = previous.price
            if prev_price > 0:
                change_pct = ((current_price - prev_price) / prev_price) * 100
                if alert.alert_type == 'price_drop' and change_pct <= -pct_change:
                    should_trigger = True
                elif alert.alert_type == 'price_rise' and change_pct >= pct_change:
                    should_trigger = True

        if should_trigger:
            alert.status = 'triggered'
            alert.triggered_at = timezone.now()
            alert.triggered_price = current_price
            market_name = latest.market.name
            crop_name = alert.crop.name
            if alert.alert_type == 'price_drop':
                alert.message = f"Price drop alert! {crop_name} at {market_name} dropped to TZS {current_price:,.0f}"
            elif alert.alert_type == 'price_rise':
                alert.message = f"Price rise alert! {crop_name} at {market_name} rose to TZS {current_price:,.0f}"
            elif alert.alert_type == 'above_threshold':
                alert.message = f"Price threshold alert! {crop_name} at {market_name} is above TZS {alert.threshold_price:,.0f} (now TZS {current_price:,.0f})"
            elif alert.alert_type == 'below_threshold':
                alert.message = f"Price threshold alert! {crop_name} at {market_name} is below TZS {alert.threshold_price:,.0f} (now TZS {current_price:,.0f})"
            alert.save()
            triggered.append(alert)
        else:
            alert.save()  # Just update last_checked

    return Response({
        'checked': alerts.count(),
        'triggered_count': len(triggered),
        'triggered': PriceAlertSerializer(triggered, many=True).data,
    })


# ──────────────────────────── COOPERATIVES ────────────────────────────

from .models import Cooperative, CooperativeMembership, MarketMatch
from .serializers import CooperativeSerializer, CooperativeMembershipSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def list_cooperatives(request):
    """List all cooperatives with optional region filter."""
    qs = Cooperative.objects.all().order_by('-created_at')
    region = request.query_params.get('region')
    if region:
        qs = qs.filter(region__icontains=region)
    serializer = CooperativeSerializer(qs[:50], many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_cooperative(request):
    """Create a new cooperative."""
    serializer = CooperativeSerializer(data=request.data)
    if serializer.is_valid():
        coop = serializer.save(created_by=request.user)
        # Auto-join the creator as chairperson
        CooperativeMembership.objects.create(
            cooperative=coop, user=request.user, role='chairperson'
        )
        coop.member_count = 1
        coop.save()
        return Response(CooperativeSerializer(coop).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_cooperative(request, pk):
    """Join an existing cooperative."""
    try:
        coop = Cooperative.objects.get(pk=pk)
    except Cooperative.DoesNotExist:
        return Response({'error': 'Cooperative not found.'}, status=status.HTTP_404_NOT_FOUND)

    membership, created = CooperativeMembership.objects.get_or_create(
        cooperative=coop, user=request.user, defaults={'role': 'member'}
    )
    if not created:
        return Response({'message': 'Already a member of this cooperative.'})

    coop.member_count = coop.memberships.count()
    coop.save()
    return Response({'message': f'Joined {coop.name} successfully.', 'membership_id': membership.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def leave_cooperative(request, pk):
    """Leave a cooperative."""
    try:
        membership = CooperativeMembership.objects.get(cooperative_id=pk, user=request.user)
    except CooperativeMembership.DoesNotExist:
        return Response({'error': 'Not a member of this cooperative.'}, status=status.HTTP_400_BAD_REQUEST)

    coop = membership.cooperative
    membership.delete()
    coop.member_count = coop.memberships.count()
    coop.save()
    return Response({'message': f'Left {coop.name}.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_cooperatives(request):
    """List cooperatives the current user has joined."""
    memberships = CooperativeMembership.objects.filter(user=request.user).select_related('cooperative')
    coops = [m.cooperative for m in memberships]
    serializer = CooperativeSerializer(coops, many=True)
    return Response(serializer.data)


# ──────────────────────────── MARKET MATCHES ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_matches(request):
    """List all active market matches with optional filters."""
    qs = MarketMatch.objects.filter(status='active').select_related('crop', 'user').order_by('-created_at')

    crop = request.query_params.get('crop')
    if crop:
        qs = qs.filter(crop_id=crop)
    region = request.query_params.get('region')
    if region:
        qs = qs.filter(region__icontains=region)
    match_type = request.query_params.get('match_type')
    if match_type:
        qs = qs.filter(match_type=match_type)

    serializer = MarketMatchSerializer(qs[:50], many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_match(request):
    """Create a new buy/sell market match."""
    serializer = MarketMatchSerializer(data=request.data)
    if serializer.is_valid():
        match = serializer.save(user=request.user)
        return Response(MarketMatchSerializer(match).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_matches(request):
    """List current user's market matches."""
    qs = MarketMatch.objects.filter(user=request.user).select_related('crop').order_by('-created_at')
    serializer = MarketMatchSerializer(qs[:50], many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_match(request, pk):
    """Cancel a market match (only own matches)."""
    try:
        match = MarketMatch.objects.get(pk=pk, user=request.user)
    except MarketMatch.DoesNotExist:
        return Response({'error': 'Match not found or not owned by you.'}, status=status.HTTP_404_NOT_FOUND)

    match.status = 'cancelled'
    match.save()
    return Response({'message': 'Match cancelled.'})


# ──────────────────────────── NOTIFICATIONS ────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    """
    GET /api/notifications/?limit=20&unread_only=true&type=price_alert
    Returns the user's notifications with optional filtering.
    """
    limit = int(request.query_params.get('limit', 20))
    unread_only = request.query_params.get('unread_only', 'false').lower() == 'true'
    notif_type = request.query_params.get('type')

    qs = Notification.objects.filter(user=request.user)
    if unread_only:
        qs = qs.filter(read=False)
    if notif_type:
        qs = qs.filter(type=notif_type)

    qs = qs[:limit]
    serializer = NotificationSerializer(qs, many=True)

    # Also return unread count for badge
    unread_count = Notification.objects.filter(user=request.user, read=False).count()

    return Response({
        'notifications': serializer.data,
        'unread_count': unread_count,
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, pk):
    """PATCH /api/notifications/<id>/read/ — Mark a single notification as read."""
    try:
        notif = Notification.objects.get(pk=pk, user=request.user)
    except Notification.DoesNotExist:
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)

    notif.read = True
    notif.save()
    return Response({'message': 'Notification marked as read.', 'id': notif.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_notifications_read(request):
    """POST /api/notifications/mark-all-read/ — Mark all user notifications as read."""
    updated = Notification.objects.filter(user=request.user, read=False).update(read=True)
    return Response({'message': f'{updated} notifications marked as read.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_notification_internal(request):
    """
    POST /api/notifications/create/ — Admin-only: create a notification for a user.
    Body: { user_id, type, priority, title, message, region?, crop? }
    """
    try:
        profile = request.user.profile
        if profile.role != 'admin':
            return Response({'error': 'Admin access required.'}, status=403)
    except UserProfile.DoesNotExist:
        return Response({'error': 'Access denied.'}, status=403)

    target_user_id = request.data.get('user_id')
    if not target_user_id:
        return Response({'error': 'user_id is required.'}, status=400)

    try:
        target_user = User.objects.get(id=target_user_id)
    except User.DoesNotExist:
        return Response({'error': 'Target user not found.'}, status=404)

    notif = Notification.create_if_unique(
        user=target_user,
        notif_type=request.data.get('type', 'system'),
        priority=request.data.get('priority', 'medium'),
        title=request.data.get('title', ''),
        message=request.data.get('message', ''),
        region=request.data.get('region', ''),
        crop=request.data.get('crop'),
    )

    if notif is None:
        return Response({'message': 'Duplicate notification — skipped.'}, status=200)

    return Response(NotificationSerializer(notif).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_summary(request):
    """GET /api/notifications/summary/ — Quick unread count + latest high-priority."""
    unread_count = Notification.objects.filter(user=request.user, read=False).count()
    latest_high = Notification.objects.filter(
        user=request.user, priority='high', read=False,
    ).first()

    return Response({
        'unread_count': unread_count,
        'latest_high_priority': NotificationSerializer(latest_high).data if latest_high else None,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def seed_demo_notifications(request):
    """POST /api/notifications/seed-demo/ — Create sample notifications for the current user."""
    import random
    from django.utils import timezone as tz

    user = request.user
    # Only seed if user has fewer than 3 notifications total
    if Notification.objects.filter(user=user).count() >= 3:
        return Response({'message': 'Notifications already exist — skipping seed.'})

    profile = getattr(user, 'profile', None)
    region = getattr(profile, 'region', '') or 'Dar es Salaam'
    crops = ['Maize', 'Rice', 'Beans', 'Sunflower', 'Coffee']

    demos = [
        {
            'type': 'price_alert', 'priority': 'high',
            'title': f'{random.choice(crops)} price alert in {region}',
            'message': f'{random.choice(crops)} prices have changed significantly in {region}. Review your price alerts for the latest updates.',
            'region': region, 'crop': random.choice(crops),
        },
        {
            'type': 'opportunity', 'priority': 'medium',
            'title': 'Market opportunity: High demand nearby',
            'message': f'A market in {region} is offering above-average prices for quality produce. Consider selling this week.',
            'region': region, 'crop': random.choice(crops),
        },
        {
            'type': 'transport', 'priority': 'medium',
            'title': 'Transport route update',
            'message': f'Road conditions on the main route to {region} markets have improved. Transport costs may be lower this week.',
            'region': region, 'crop': '',
        },
        {
            'type': 'price_alert', 'priority': 'low',
            'title': f'{random.choice(crops)} price stable in your area',
            'message': f'{random.choice(crops)} prices in {region} have remained stable over the past week. No major fluctuations detected.',
            'region': region, 'crop': random.choice(crops),
        },
        {
            'type': 'system', 'priority': 'low',
            'title': 'Welcome to Smart Crops!',
            'message': 'Thank you for using Smart Crops Market Price Tracker. Set up price alerts to stay informed about market changes in your region.',
            'region': '', 'crop': '',
        },
        {
            'type': 'opportunity', 'priority': 'high',
            'title': 'Price gap alert: Buy low, sell high',
            'message': f'A significant price gap has been detected for {random.choice(crops)} between regions. Check the price comparison tool for details.',
            'region': region, 'crop': random.choice(crops),
        },
    ]

    # Create notifications (auto_now_add sets all to now)
    now = tz.now()
    ids = []
    for i, d in enumerate(demos):
        notif = Notification.objects.create(
            user=user,
            type=d['type'],
            priority=d['priority'],
            title=d['title'],
            message=d['message'],
            region=d['region'],
            crop=d['crop'],
        )
        ids.append(notif.id)

    # Back-date timestamps so they appear as a stream (bypasses auto_now_add)
    if ids:
        from django.db.models import F
        for i, nid in enumerate(ids):
            offset_minutes = i * 15
            Notification.objects.filter(id=nid).update(
                created_at=now - timedelta(minutes=offset_minutes)
            )

    return Response({
        'message': f'{len(demos)} demo notifications created.',
        'count': len(demos),
    })


# ── Reports ────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_report(request, fmt):
    """Generate and download a price report in CSV, Excel, or PDF format.
    GET /api/reports/{csv|xlsx|pdf}/?crop=&market=&region=&date_from=&date_to=
    GET /api/reports/summary/csv/?crop=&market=&region=&date_from=&date_to=
    """
    valid_formats = {
        'csv': reports.generate_csv,
        'xlsx': reports.generate_excel,
        'pdf': reports.generate_pdf,
    }
    if fmt == 'summary/csv':
        return reports.generate_summary_csv(request.query_params)

    generator = valid_formats.get(fmt)
    if not generator:
        return Response({'error': f'Unsupported format: {fmt}'}, status=400)

    return generator(request.query_params)


# ── Search ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search(request):
    """Full-text search across crops, markets, regions, and price entries.
    GET /api/search/?q=maize&type=all&crop=&region=&market=&min_price=&max_price=&market_type=
    """
    q = request.query_params.get('q', '').strip()
    search_type = request.query_params.get('type', 'all')
    crop_id = request.query_params.get('crop')
    region_id = request.query_params.get('region')
    market_id = request.query_params.get('market')
    min_price = request.query_params.get('min_price')
    max_price = request.query_params.get('max_price')
    market_type = request.query_params.get('market_type')

    results = {
        'crops': [],
        'markets': [],
        'regions': [],
        'prices': [],
        'total_count': 0,
    }

    if not q and not crop_id and not region_id and not market_id and not min_price and not max_price and not market_type:
        return Response(results)

    # Search crops
    if search_type in ('all', 'crops'):
        crops_qs = Crop.objects.all()
        if q:
            crops_qs = crops_qs.filter(name__icontains=q) | crops_qs.filter(category__icontains=q) | crops_qs.filter(description__icontains=q)
        results['crops'] = list(crops_qs.values('id', 'name', 'category', 'unit')[:10])

    # Search markets
    if search_type in ('all', 'markets'):
        markets_qs = Market.objects.select_related('region')
        if q:
            markets_qs = markets_qs.filter(name__icontains=q) | markets_qs.filter(district__icontains=q) | markets_qs.filter(region__name__icontains=q)
        if region_id:
            markets_qs = markets_qs.filter(region_id=region_id)
        results['markets'] = [
            {'id': m.id, 'name': m.name, 'region': m.region.name, 'district': m.district, 'market_type': m.market_type}
            for m in markets_qs[:10]
        ]

    # Search regions
    if search_type in ('all', 'regions'):
        regions_qs = Region.objects.all()
        if q:
            regions_qs = regions_qs.filter(name__icontains=q) | regions_qs.filter(zone__icontains=q)
        results['regions'] = list(regions_qs.values('id', 'name', 'zone')[:10])

    # Search price entries
    if search_type in ('all', 'prices'):
        prices_qs = PriceEntry.objects.select_related('crop', 'market__region').filter(status='approved')
        if q:
            prices_qs = prices_qs.filter(crop__name__icontains=q) | prices_qs.filter(crop__description__icontains=q) | prices_qs.filter(market__name__icontains=q) | prices_qs.filter(market__region__name__icontains=q)
        if crop_id:
            prices_qs = prices_qs.filter(crop_id=crop_id)
        if region_id:
            prices_qs = prices_qs.filter(market__region_id=region_id)
        if market_id:
            prices_qs = prices_qs.filter(market_id=market_id)
        if min_price:
            prices_qs = prices_qs.filter(price__gte=float(min_price))
        if max_price:
            prices_qs = prices_qs.filter(price__lte=float(max_price))
        if market_type == 'consumer':
            prices_qs = prices_qs.filter(market__market_type__in=['daily', 'periodic'])
        elif market_type == 'wholesale':
            prices_qs = prices_qs.filter(market__market_type='wholesale')
        prices_qs = prices_qs.order_by('-price_date')[:20]
        results['prices'] = [
            {
                'id': p.id,
                'crop': p.crop.name,
                'crop_id': p.crop_id,
                'market': p.market.name,
                'market_id': p.market_id,
                'region': p.market.region.name,
                'price': p.price,
                'quantity': p.quantity,
                'date': p.price_date.isoformat(),
                'status': p.status,
            }
            for p in prices_qs
        ]

    results['total_count'] = (
        len(results['crops']) + len(results['markets']) +
        len(results['regions']) + len(results['prices'])
    )
    return Response(results)


# ── Weather ─────────────────────────────────────────────────────

WEATHER_CODE_MAP = {
    0: {'label': 'Clear', 'icon': 'sun'},
    1: {'label': 'Mainly Clear', 'icon': 'sun'},
    2: {'label': 'Partly Cloudy', 'icon': 'cloud-sun'},
    3: {'label': 'Overcast', 'icon': 'cloud'},
    45: {'label': 'Foggy', 'icon': 'fog'},
    48: {'label': 'Depositing rime fog', 'icon': 'fog'},
    51: {'label': 'Light Drizzle', 'icon': 'cloud-drizzle'},
    53: {'label': 'Moderate Drizzle', 'icon': 'cloud-drizzle'},
    55: {'label': 'Dense Drizzle', 'icon': 'cloud-rain'},
    56: {'label': 'Light Freezing Drizzle', 'icon': 'cloud-drizzle'},
    57: {'label': 'Dense Freezing Drizzle', 'icon': 'cloud-rain'},
    61: {'label': 'Slight Rain', 'icon': 'cloud-rain'},
    63: {'label': 'Moderate Rain', 'icon': 'cloud-rain'},
    65: {'label': 'Heavy Rain', 'icon': 'cloud-rain'},
    66: {'label': 'Light Freezing Rain', 'icon': 'cloud-rain'},
    67: {'label': 'Heavy Freezing Rain', 'icon': 'cloud-rain'},
    71: {'label': 'Slight Snow', 'icon': 'snowflake'},
    73: {'label': 'Moderate Snow', 'icon': 'snowflake'},
    75: {'label': 'Heavy Snow', 'icon': 'snowflake'},
    77: {'label': 'Snow Grains', 'icon': 'snowflake'},
    80: {'label': 'Slight Rain Showers', 'icon': 'cloud-rain'},
    81: {'label': 'Moderate Rain Showers', 'icon': 'cloud-rain'},
    82: {'label': 'Violent Rain Showers', 'icon': 'cloud-rain'},
    85: {'label': 'Slight Snow Showers', 'icon': 'snowflake'},
    86: {'label': 'Heavy Snow Showers', 'icon': 'snowflake'},
    95: {'label': 'Thunderstorm', 'icon': 'cloud-lightning'},
    96: {'label': 'Thunderstorm with slight hail', 'icon': 'cloud-lightning'},
    99: {'label': 'Thunderstorm with heavy hail', 'icon': 'cloud-lightning'},
}

SOIL_MOISTURE_LABELS = {
    'dry': (0, 0.15),
    'moist': (0.15, 0.30),
    'wet': (0.30, 0.50),
    'saturated': (0.50, 1.0),
}

UV_INDEX_LABELS = [
    (0, 2, 'Low'),
    (3, 5, 'Moderate'),
    (6, 7, 'High'),
    (8, 10, 'Very High'),
    (11, 999, 'Extreme'),
]


def _get_soil_moisture_label(moisture):
    if moisture is None:
        return None
    for label, (lo, hi) in SOIL_MOISTURE_LABELS.items():
        if lo <= moisture <= hi:
            return label
    return 'dry'


def _get_uv_label(uv):
    if uv is None:
        return None
    for lo, hi, label in UV_INDEX_LABELS:
        if lo <= uv <= hi:
            return label
    return 'Low'


def _enrich_weather(record):
    code = record.get('weather_code')
    wc = WEATHER_CODE_MAP.get(code)
    if wc:
        record['weather_label'] = wc['label']
        record['weather_icon'] = wc['icon']
    else:
        record['weather_label'] = 'No data' if code is None else 'Unknown'
        record['weather_icon'] = 'cloud'
    sm = record.get('soil_moisture_0_1cm')
    if sm is not None:
        try:
            record['soil_moisture_label'] = _get_soil_moisture_label(float(sm))
        except (TypeError, ValueError):
            pass
    uv = record.get('uv_index')
    if uv is not None:
        try:
            record['uv_label'] = _get_uv_label(float(uv))
        except (TypeError, ValueError):
            pass
    return record


def _enrich_hourly(record):
    code = record.get('weather_code')
    wc = WEATHER_CODE_MAP.get(code)
    if wc:
        record['weather_label'] = wc['label']
        record['weather_icon'] = wc['icon']
    else:
        record['weather_label'] = 'No data' if code is None else 'Unknown'
        record['weather_icon'] = 'cloud'
    uv = record.get('uv_index')
    if uv is not None:
        try:
            record['uv_label'] = _get_uv_label(float(uv))
        except (TypeError, ValueError):
            pass
    return record


@api_view(['GET'])
def get_weather(request):
    """Return weather data for regions.

    Query params:
        region       — filter by region name (case-insensitive)
        date         — specific date (YYYY-MM-DD)
        date_from, date_to — date range
        latest       — if 'true', return most recent date per region
        fields       — comma-separated field list to include (optional)
    """
    qs = WeatherData.objects.select_related('region').all().order_by('-date')

    region = request.query_params.get('region')
    if region:
        qs = qs.filter(region__name__iexact=region)

    date_param = request.query_params.get('date')
    if date_param:
        qs = qs.filter(date=date_param)

    date_from = request.query_params.get('date_from')
    if date_from:
        qs = qs.filter(date__gte=date_from)

    date_to = request.query_params.get('date_to')
    if date_to:
        qs = qs.filter(date__lte=date_to)

    latest = request.query_params.get('latest')
    if latest and latest.lower() == 'true':
        latest_ids = WeatherData.objects.filter(
            region_id=OuterRef('region_id')
        ).order_by('-date').values('id')[:1]
        qs = qs.filter(id=Subquery(latest_ids))

    serializer = WeatherSerializer(qs, many=True)
    data = [_enrich_weather(d) for d in serializer.data]

    fields = request.query_params.get('fields')
    if fields:
        allowed = {f.strip() for f in fields.split(',')}
        allowed.add('id')
        data = [{k: v for k, v in d.items() if k in allowed} for d in data]

    return Response(data)


@api_view(['GET'])
def get_hourly_weather(request):
    """Return hourly weather data for a region.

    Query params:
        region       — region name (required)
        date         — specific date (YYYY-MM-DD)
        hours        — number of most recent hours to return (default 24)
    """
    region_name = request.query_params.get('region')
    if not region_name:
        return Response({'error': 'region parameter required'}, status=400)

    try:
        region = Region.objects.get(name__iexact=region_name)
    except Region.DoesNotExist:
        return Response({'error': 'Region not found'}, status=404)

    qs = HourlyWeatherData.objects.filter(region=region).order_by('-timestamp')

    date_param = request.query_params.get('date')
    if date_param:
        qs = qs.filter(timestamp__date=date_param)

    hours = int(request.query_params.get('hours', 24))
    qs = qs[:hours]

    serializer = HourlyWeatherSerializer(qs, many=True)
    data = [_enrich_hourly(d) for d in serializer.data]
    data.reverse()
    return Response(data)


@api_view(['GET'])
def get_crop_weather(request):
    """Return weather data cross-referenced with crop calendars.

    Query params:
        region       — region name
        crop         — crop id (optional)
        date         — specific date (optional, defaults to today)
    """
    from .models import CropCalendar, Crop

    region_name = request.query_params.get('region')
    crop_id = request.query_params.get('crop')
    target_date = request.query_params.get('date', str(timezone.now().date()))

    if not region_name:
        return Response({'error': 'region parameter required'}, status=400)

    try:
        region = Region.objects.get(name__iexact=region_name)
    except Region.DoesNotExist:
        return Response({'error': 'Region not found'}, status=404)

    weather_qs = WeatherData.objects.filter(region=region, date=target_date)
    weather_serializer = WeatherSerializer(weather_qs, many=True)
    weather_data = [_enrich_weather(d) for d in weather_serializer.data]

    cal_qs = CropCalendar.objects.filter(region=region)
    if crop_id:
        cal_qs = cal_qs.filter(crop_id=crop_id)

    target_month = timezone.now().month
    season_info = []
    for cal in cal_qs:
        in_planting = False
        in_harvest = False
        if cal.planting_start and cal.planting_end:
            in_planting = _month_in_range(target_month, cal.planting_start, cal.planting_end)
        if cal.harvest_start and cal.harvest_end:
            in_harvest = _month_in_range(target_month, cal.harvest_start, cal.harvest_end)
        season_info.append({
            'crop': cal.crop.name,
            'crop_id': cal.crop_id,
            'season_name': cal.season_name,
            'in_planting': in_planting,
            'in_harvest': in_harvest,
            'planting': f"{cal.planting_start}-{cal.planting_end}" if cal.planting_start else None,
            'harvest': f"{cal.harvest_start}-{cal.harvest_end}" if cal.harvest_start else None,
        })

    favorable = None
    if weather_data:
        w = weather_data[0]
        try:
            precip = float(w.get('precipitation') or 0)
            temp = float(w.get('temp_max') or 0)
            soil_m = float(w.get('soil_moisture_0_1cm') or 0) if w.get('soil_moisture_0_1cm') else None
            if precip > 20 or temp > 38:
                favorable = 'unfavorable'
            elif soil_m is not None and 0.15 <= soil_m <= 0.35:
                favorable = 'good'
            elif precip < 5 and temp < 32:
                favorable = 'favorable'
            else:
                favorable = 'fair'
        except (TypeError, ValueError):
            pass

    return Response({
        'region': region.name,
        'date': target_date,
        'weather': weather_data,
        'crop_seasons': season_info,
        'favorable': favorable,
        'seasonal_crops': [s['crop'] for s in season_info if s['in_planting'] or s['in_harvest']],
    })


def _month_in_range(month, start, end):
    if start <= end:
        return start <= month <= end
    return month >= start or month <= end


@api_view(['GET'])
def get_weather_alert(request):
    """Return weather-based alerts for a region.

    Query params:
        region — region name (required)

    Returns extreme weather alerts (thunderstorm, heavy rain, extreme heat, high wind).
    """
    region_name = request.query_params.get('region')
    if not region_name:
        return Response({'error': 'region parameter required'}, status=400)

    try:
        region = Region.objects.get(name__iexact=region_name)
    except Region.DoesNotExist:
        return Response({'error': 'Region not found'}, status=404)

    today = timezone.now().date()
    records = WeatherData.objects.filter(region=region, date__gte=today).order_by('date')[:3]

    alerts = []
    for r in records:
        try:
            temp = float(r.temp_max or 0)
            wind = float(r.wind_speed or 0)
            precip = float(r.precipitation or 0)
            uv = float(r.uv_index or 0)
        except (TypeError, ValueError):
            continue

        code = r.weather_code
        day_label = 'Today' if r.date == today else r.date.strftime('%a')

        if code and code >= 95:
            alerts.append({'level': 'danger', 'date': str(r.date),
                           'message': f'{day_label}: Thunderstorm warning'})
        elif code and code >= 80:
            alerts.append({'level': 'warning', 'date': str(r.date),
                           'message': f'{day_label}: Heavy rain expected'})
        elif precip and precip > 20:
            alerts.append({'level': 'warning', 'date': str(r.date),
                           'message': f'{day_label}: {precip}mm rain — may affect market access'})
        if temp > 38:
            alerts.append({'level': 'warning', 'date': str(r.date),
                           'message': f'{day_label}: Extreme heat — take precautions'})
        if wind > 50:
            alerts.append({'level': 'caution', 'date': str(r.date),
                           'message': f'{day_label}: Strong winds — secure farm equipment'})
        if uv >= 8:
            alerts.append({'level': 'caution', 'date': str(r.date),
                           'message': f'{day_label}: Very high UV — use sun protection'})

    return Response({
        'region': region.name,
        'alerts': alerts[:5],
        'alert_count': len(alerts),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def check_weather_notifications(request):
    """Check weather conditions and create notifications for users in affected regions.

    Body:
        region  — region name (optional, checks all regions if omitted)

    Creates notifications for users who have weather alerts active in their region.
    """
    from django.contrib.auth.models import User

    region_name = request.data.get('region')

    try:
        today = timezone.now().date()
        qs = WeatherData.objects.select_related('region').filter(date=today)
        if region_name:
            qs = qs.filter(region__name__iexact=region_name)
    except Exception as e:
        return Response({'error': str(e)}, status=400)

    created_count = 0
    alerts_data = []

    for record in qs:
        region = record.region
        try:
            temp = float(record.temp_max or 0)
            wind = float(record.wind_speed or 0)
            precip = float(record.precipitation or 0)
        except (TypeError, ValueError):
            continue

        code = record.weather_code
        region_alerts = []

        if code and code >= 95:
            region_alerts.append(('high', 'Thunderstorm Warning',
                                  f'Thunderstorm expected in {region.name} today. Seek shelter and protect crops.'))
        elif code and code >= 80:
            region_alerts.append(('medium', 'Heavy Rain Warning',
                                  f'Heavy rain expected in {region.name} today. May affect market access and transport.'))
        if precip > 20:
            region_alerts.append(('medium', 'High Rainfall Alert',
                                  f'{precip}mm rain in {region.name} — flooding possible. Plan transport accordingly.'))
        if temp > 38:
            region_alerts.append(('medium', 'Extreme Heat Warning',
                                  f'Temperatures reaching {temp}°C in {region.name}. Keep crops hydrated and avoid midday transport.'))
        if wind > 50:
            region_alerts.append(('low', 'Strong Wind Advisory',
                                  f'Strong winds ({wind} km/h) in {region.name}. Secure farm structures and equipment.'))

        if region_alerts:
            alerts_data.append({'region': region.name, 'alerts': region_alerts})
            users = User.objects.filter(profile__region__iexact=region.name, is_active=True)
            for priority, title, message in region_alerts:
                for user in users:
                    notif = Notification.create_if_unique(
                        user=user,
                        notif_type='system',
                        priority=priority,
                        title=title,
                        message=message,
                        region=region.name,
                    )
                    if notif:
                        created_count += 1

    return Response({
        'regions_checked': qs.count(),
        'alerts_found': len(alerts_data),
        'notifications_created': created_count,
        'region_alerts': alerts_data[:10],
    })


def get_weather_context(region_name):
    """Return weather summary for a region (used by sell-advisor, transport, recommendations).

    Returns dict with current conditions and 3-day forecast or None if no data.
    """
    try:
        region = Region.objects.get(name__iexact=region_name)
    except Region.DoesNotExist:
        return None

    today = timezone.now().date()
    records = WeatherData.objects.filter(region=region, date__gte=today).order_by('date')[:3]

    if not records:
        return None

    current = records[0]
    has_extreme = False
    conditions = []

    for r in records:
        try:
            precip = float(r.precipitation or 0)
            temp = float(r.temp_max or 0)
            wind = float(r.wind_speed or 0)
        except (TypeError, ValueError):
            continue

        if r.weather_code and r.weather_code >= 80:
            has_extreme = True
            conditions.append('heavy_rain')
        if precip > 20:
            conditions.append('wet')
        if temp > 38:
            conditions.append('extreme_heat')
        if wind > 50:
            conditions.append('strong_wind')

    return {
        'region': region.name,
        'condition': 'extreme' if has_extreme else ('wet' if 'wet' in conditions else 'fair'),
        'temp_max': float(current.temp_max) if current.temp_max else None,
        'temp_min': float(current.temp_min) if current.temp_min else None,
        'precipitation': float(current.precipitation) if current.precipitation else None,
        'wind_speed': float(current.wind_speed) if current.wind_speed else None,
        'wind_direction': int(current.wind_direction) if current.wind_direction else None,
        'humidity': float(current.humidity) if current.humidity else None,
        'pressure': float(current.pressure) if current.pressure else None,
        'uv_index': float(current.uv_index) if current.uv_index else None,
        'cloud_cover': int(current.cloud_cover) if current.cloud_cover else None,
        'forecast_days': [
            {
                'date': str(r.date),
                'precipitation': float(r.precipitation) if r.precipitation else 0,
                'condition': 'rain' if float(r.precipitation or 0) > 10 else 'dry',
            }
            for r in records
        ],
    }


def health_check(request):
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return JsonResponse({'status': 'ok', 'database': 'connected'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'database': str(e)}, status=503)

