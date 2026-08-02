"""Create demo accounts for Smart Crops testing."""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from prices.models import UserProfile, Market


class Command(BaseCommand):
    help = 'Create demo accounts for testing'

    def handle(self, *args, **options):
        DEMO_ACCOUNTS = [
            {
                'username': 'demo_admin',
                'password': 'Demo@Admin2026',
                'email': 'demo_admin@smartcrops.test',
                'first_name': 'Demo',
                'last_name': 'Admin',
                'role': 'admin',
                'phone': '+255712000001',
                'region': 'Dar Es Salaam',
            },
            {
                'username': 'demo_farmer',
                'password': 'Demo@Farm2026',
                'email': 'demo_farmer@smartcrops.test',
                'first_name': 'Baraka',
                'last_name': 'Mwangi',
                'role': 'farmer',
                'phone': '+255712000002',
                'region': 'Arusha',
                'main_crops': 'Maize, Beans, Sunflower',
                'farm_size': 5.0,
                'preferred_markets': 'Arusha Central Market, Moshi Main Market',
            },
            {
                'username': 'demo_trader',
                'password': 'Demo@Trade2026',
                'email': 'demo_trader@smartcrops.test',
                'first_name': 'Juma',
                'last_name': 'Hassan',
                'role': 'trader',
                'phone': '+255712000003',
                'region': 'Dar Es Salaam',
                'operating_regions': 'Dar Es Salaam, Morogoro, Dodoma',
                'crops_of_interest': 'Rice, Maize, Cashew',
                'business_name': 'Hassan Agri-Traders Ltd',
            },
            {
                'username': 'demo_agent',
                'password': 'Demo@Agent2026',
                'email': 'demo_agent@smartcrops.test',
                'first_name': 'Grace',
                'last_name': 'Mushi',
                'role': 'agent',
                'phone': '+255712000004',
                'region': 'Mwanza',
                'experience': '3 years',
                'id_verification': 'NIDA-00000000000000000004',
            },
        ]

        self.stdout.write('Creating/updating demo accounts...')
        for acct in DEMO_ACCOUNTS:
            username = acct['username']
            
            assigned_market = None
            if acct['role'] == 'agent':
                assigned_market = Market.objects.filter(
                    region__name__icontains=acct['region']
                ).first()

            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                user.set_password(acct['password'])
                user.email = acct['email']
                user.first_name = acct['first_name']
                user.last_name = acct['last_name']
                user.save()
                
                profile, created = UserProfile.objects.get_or_create(user=user)
                profile.role = acct['role']
                profile.phone = acct.get('phone', '')
                profile.region = acct.get('region', '')
                profile.approval_status = 'approved'
                profile.email_verified = True
                profile.onboarding_complete = True
                profile.main_crops = acct.get('main_crops', '')
                profile.farm_size = acct.get('farm_size')
                profile.preferred_markets = acct.get('preferred_markets', '')
                profile.operating_regions = acct.get('operating_regions', '')
                profile.crops_of_interest = acct.get('crops_of_interest', '')
                profile.experience = acct.get('experience', '')
                profile.id_verification = acct.get('id_verification', '')
                profile.assigned_market = assigned_market
                profile.save()
                
                self.stdout.write(self.style.SUCCESS(f'  UPDATED: {username} (role={acct["role"]})'))
            else:
                user = User.objects.create_user(
                    username=username,
                    password=acct['password'],
                    email=acct['email'],
                    first_name=acct['first_name'],
                    last_name=acct['last_name'],
                )

                UserProfile.objects.create(
                    user=user,
                    role=acct['role'],
                    phone=acct.get('phone', ''),
                    region=acct.get('region', ''),
                    approval_status='approved',
                    email_verified=True,
                    onboarding_complete=True,
                    main_crops=acct.get('main_crops', ''),
                    farm_size=acct.get('farm_size'),
                    preferred_markets=acct.get('preferred_markets', ''),
                    operating_regions=acct.get('operating_regions', ''),
                    crops_of_interest=acct.get('crops_of_interest', ''),
                    experience=acct.get('experience', ''),
                    id_verification=acct.get('id_verification', ''),
                    assigned_market=assigned_market,
                )
                self.stdout.write(self.style.SUCCESS(f'  CREATED: {username} (role={acct["role"]})'))

        self.stdout.write(self.style.SUCCESS('Demo accounts ready!'))
