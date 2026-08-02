from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth.models import User

from prices.models import PhoneVerification


class EmailLoginTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
        )

    def test_login_with_email_succeeds(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'test@example.com',
            'password': 'testpass123',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)

    def test_login_with_username_still_works(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'testuser',
            'password': 'testpass123',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)

    def test_login_with_invalid_email_fails(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'nonexistent@example.com',
            'password': 'testpass123',
        })
        self.assertEqual(response.status_code, 401)


class PhoneOtpFlowTests(TestCase):
    def test_send_phone_code_creates_verification_and_tracks_attempts(self):
        with patch('prices.views.deliver_otp_code', return_value={'status': 'sent', 'channel': 'whatsapp'}) as mocked_delivery:
            response = self.client.post('/api/auth/phone/send-code/', {'phone': '0712345678'})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(PhoneVerification.objects.filter(phone='+255712345678').exists())
        verification = PhoneVerification.objects.get(phone='+255712345678')
        self.assertEqual(verification.attempts, 0)
        mocked_delivery.assert_called_once()

    def test_verify_phone_code_increments_attempts_on_wrong_code(self):
        verification = PhoneVerification.objects.create(
            phone='+255712345678',
            code='123456',
            expires_at='2099-01-01T00:00:00Z',
            attempts=0,
        )

        with patch('prices.views.deliver_otp_code', return_value={'status': 'sent', 'channel': 'whatsapp'}):
            response = self.client.post('/api/auth/phone/verify/', {'phone': '+255712345678', 'code': '000000'})

        self.assertEqual(response.status_code, 400)
        verification.refresh_from_db()
        self.assertEqual(verification.attempts, 1)
