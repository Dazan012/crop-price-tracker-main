from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


class UserProfile(models.Model):
    """Extended user profile with role-based access control and role-specific fields."""
    ROLE_CHOICES = [
        ('admin', 'Administrator'),
        ('agent', 'Market Agent'),
        ('trader', 'Trader'),
        ('farmer', 'Farmer'),
        ('general', 'General User'),
    ]
    APPROVAL_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('suspended', 'Suspended'),
    ]
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Prefer not to say'),
    ]
    FARMING_TYPE_CHOICES = [
        ('subsistence', 'Subsistence (for household use)'),
        ('commercial', 'Commercial (for sale)'),
        ('mixed', 'Mixed (both)'),
    ]
    LAND_OWNERSHIP_CHOICES = [
        ('owned', 'Owned outright'),
        ('family', 'Family land (shared)'),
        ('rented', 'Rented / leased'),
        ('cooperative', 'Cooperative land'),
        ('government', 'Government-allocated'),
    ]
    ENTITY_TYPE_CHOICES = [
        ('individual', 'Individual trader'),
        ('business', 'Business entity'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('mobile_money', 'Mobile Money'),
        ('bank', 'Bank Transfer'),
    ]
    MOBILE_MONEY_CHOICES = [
        ('mpesa', 'Vodacom M-Pesa'),
        ('tigo', 'Tigo Pesa'),
        ('airtel', 'Airtel Money'),
        ('halopesa', 'Halopesa'),
        ('none', 'None'),
    ]
    REPORTING_FREQ_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('as_available', 'As available'),
    ]
    AUTHORITY_TYPE_CHOICES = [
        ('lga', 'Local Government Authority (LGA)'),
        ('district', 'District council'),
        ('tmx', 'Tanzania Mercantile Exchange (TMX)'),
        ('eagc', 'Eastern Africa Grain Council (EAGC)'),
        ('private', 'Private market operator'),
        ('cooperative', 'Cooperative / Farmers association'),
        ('other', 'Other'),
    ]
    VOLUME_UNIT_CHOICES = [
        ('bags', 'Bags'),
        ('tonnes', 'Tonnes'),
        ('kilograms', 'Kilograms'),
    ]
    FARM_SIZE_UNIT_CHOICES = [
        ('acres', 'Acres'),
        ('hectares', 'Hectares'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='general')
    phone = models.CharField(max_length=20, blank=True)
    phone_verified = models.BooleanField(default=False)
    region = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    approval_status = models.CharField(max_length=20, choices=APPROVAL_CHOICES, default='approved',
        help_text="Agents require admin approval; others are auto-approved")
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Email verification ──────────────────────────────────────
    email_verification_code = models.CharField(max_length=6, blank=True, help_text="6-digit email verification code")
    email_verified = models.BooleanField(default=False, help_text="Whether the user has verified their email")
    email_code_sent_at = models.DateTimeField(null=True, blank=True, help_text="When the verification code was sent")

    # ── Onboarding ────────────────────────────────────────────
    onboarding_complete = models.BooleanField(default=False, help_text="Whether user has completed the role onboarding wizard")

    # ── Auth provider tracking ──────────────────────────────────
    AUTH_PROVIDER_CHOICES = [
        ('email', 'Email / Password'),
        ('google', 'Google OAuth'),
        ('phone', 'Phone OTP'),
        ('magic_link', 'Email Magic Link'),
    ]
    auth_provider = models.CharField(max_length=20, choices=AUTH_PROVIDER_CHOICES, default='email', blank=True)

    # ── Account lockout fields ─────────────────────────────────
    failed_login_attempts = models.PositiveIntegerField(default=0,
        help_text="Consecutive failed login attempts")
    locked_until = models.DateTimeField(null=True, blank=True,
        help_text="Account is locked until this timestamp")

    # ── Identity fields (shared) ──────────────────────────────
    nida_number = models.CharField(max_length=20, blank=True, help_text="National ID number (20 digits)")
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True)
    profile_photo = models.URLField(blank=True, help_text="URL to uploaded profile photo")

    # ── Farmer-specific fields ────────────────────────────────
    main_crops = models.TextField(blank=True, help_text="Comma-separated list of crops grown")
    farm_size = models.FloatField(null=True, blank=True, help_text="Farm size")
    farm_size_unit = models.CharField(max_length=10, choices=FARM_SIZE_UNIT_CHOICES, default='acres', blank=True)
    preferred_markets = models.TextField(blank=True, help_text="Comma-separated market names")
    ward = models.CharField(max_length=100, blank=True, help_text="Ward / Village name")
    land_ownership = models.CharField(max_length=20, choices=LAND_OWNERSHIP_CHOICES, blank=True)
    farming_type = models.CharField(max_length=20, choices=FARMING_TYPE_CHOICES, blank=True)
    cooperative_name = models.CharField(max_length=200, blank=True)
    mobile_money_provider = models.CharField(max_length=20, choices=MOBILE_MONEY_CHOICES, blank=True)
    mobile_money_number = models.CharField(max_length=20, blank=True)
    avg_harvest_qty = models.FloatField(null=True, blank=True)
    avg_harvest_unit = models.CharField(max_length=20, choices=VOLUME_UNIT_CHOICES, blank=True)

    # ── Trader-specific fields ────────────────────────────────
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPE_CHOICES, blank=True)
    business_name = models.CharField(max_length=200, blank=True)
    brela_number = models.CharField(max_length=50, blank=True, help_text="BRELA registration number")
    tin_number = models.CharField(max_length=50, blank=True, help_text="Tax Identification Number")
    contact_person_name = models.CharField(max_length=100, blank=True)
    contact_person_role = models.CharField(max_length=100, blank=True)
    operating_regions = models.TextField(blank=True, help_text="Comma-separated regions of operation")
    crops_of_interest = models.TextField(blank=True, help_text="Comma-separated crop names")
    trade_types = models.TextField(blank=True, help_text="Comma-separated: wholesale, retail, exporter, importer, broker, processor")
    primary_source_region = models.CharField(max_length=100, blank=True)
    primary_sales_region = models.CharField(max_length=100, blank=True)
    avg_monthly_volume = models.FloatField(null=True, blank=True)
    volume_unit = models.CharField(max_length=20, choices=VOLUME_UNIT_CHOICES, blank=True)
    transport_capacity = models.CharField(max_length=100, blank=True, help_text="e.g. 5 tons, pickup truck")
    has_transport = models.BooleanField(null=True, blank=True)
    vehicle_count = models.IntegerField(null=True, blank=True)
    vehicle_types = models.TextField(blank=True, help_text="Comma-separated: lorry, pickup, motorbike")
    trading_since_year = models.IntegerField(null=True, blank=True)
    business_licence_number = models.CharField(max_length=50, blank=True)
    crop_board_permits = models.TextField(blank=True, help_text="Comma-separated: coffee, cashew, cotton, tea, sisal")
    has_export_licence = models.BooleanField(null=True, blank=True)
    export_licence_number = models.CharField(max_length=50, blank=True)
    referee_name = models.CharField(max_length=100, blank=True)
    referee_phone = models.CharField(max_length=20, blank=True)
    referee_relationship = models.CharField(max_length=100, blank=True)
    supporting_document = models.URLField(blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_account_name = models.CharField(max_length=100, blank=True)

    # ── Agent-specific fields ─────────────────────────────────
    assigned_market = models.ForeignKey('Market', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_agents')
    id_verification = models.TextField(blank=True, help_text="ID verification document reference")
    experience = models.TextField(blank=True, help_text="Experience description")
    market_type = models.CharField(max_length=50, blank=True, help_text="daily, periodic, wholesale, mixed")
    operating_days = models.TextField(blank=True, help_text="Comma-separated: Mon, Tue, Wed...")
    crops_at_market = models.TextField(blank=True, help_text="Comma-separated crop names at market")
    authority_type = models.CharField(max_length=20, choices=AUTHORITY_TYPE_CHOICES, blank=True)
    authority_name = models.CharField(max_length=200, blank=True)
    is_officially_appointed = models.BooleanField(null=True, blank=True)
    official_agent_id = models.CharField(max_length=50, blank=True)
    supervisor_name = models.CharField(max_length=100, blank=True)
    supervisor_phone = models.CharField(max_length=20, blank=True)
    supervisor_title = models.CharField(max_length=100, blank=True)
    appointment_document = models.URLField(blank=True)
    reporting_frequency = models.CharField(max_length=20, choices=REPORTING_FREQ_CHOICES, blank=True)
    price_collection_methods = models.TextField(blank=True, help_text="Comma-separated: observation, sellers, buyers, board, records")
    earns_commission = models.BooleanField(null=True, blank=True)
    commission_mobile_money_provider = models.CharField(max_length=20, choices=MOBILE_MONEY_CHOICES, blank=True)
    commission_mobile_money_number = models.CharField(max_length=20, blank=True)
    commitment_confirmed = models.BooleanField(default=False)
    guidelines_accepted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    @property
    def is_approved(self):
        return self.approval_status == 'approved'

    @property
    def can_submit_prices(self):
        """Only approved admins and agents can submit prices."""
        if self.role in ('admin', 'agent'):
            return self.is_approved
        return False


class MagicLink(models.Model):
    """One-time use magic link tokens for passwordless email authentication."""
    email = models.EmailField()
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    def __str__(self):
        return f"MagicLink({self.email}, used={self.used})"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.used and not self.is_expired


class PhoneVerification(models.Model):
    """Phone OTP verification codes for passwordless phone authentication."""
    phone = models.CharField(max_length=20)
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    attempts = models.PositiveIntegerField(default=0)
    last_channel = models.CharField(max_length=20, blank=True)
    last_error = models.TextField(blank=True)

    def __str__(self):
        return f"PhoneVerification({self.phone}, used={self.used})"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.used and not self.is_expired


class Region(models.Model):
    """Tanzanian regions for market categorization."""
    name = models.CharField(max_length=100, unique=True)
    zone = models.CharField(max_length=100, blank=True, help_text="Geographic zone (Northern, Southern, etc.)")

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.strip().title()
        if self.zone:
            self.zone = self.zone.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Market(models.Model):
    """Physical crop markets across Tanzania."""
    MARKET_TYPE_CHOICES = [
        ('daily', 'Daily market'),
        ('periodic', 'Periodic / Weekly market'),
        ('wholesale', 'Wholesale market'),
        ('mixed', 'Mixed retail and wholesale'),
    ]

    name = models.CharField(max_length=200)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='markets')
    district = models.CharField(max_length=100, blank=True, help_text="District the market is in")
    ward = models.CharField(max_length=100, blank=True, help_text="Ward / area of the market")
    location_description = models.TextField(blank=True)
    market_type = models.CharField(max_length=20, choices=MARKET_TYPE_CHOICES, default='daily')
    operating_days = models.TextField(blank=True, help_text="Comma-separated: Mon, Tue, Wed, Thu, Fri, Sat, Sun")
    governing_authority = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['name', 'region']
        ordering = ['name']

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.strip().title()
        if self.district:
            self.district = self.district.strip().title()
        if self.ward:
            self.ward = self.ward.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.region.name})"


class Crop(models.Model):
    """Crop types tracked by the system."""
    CATEGORY_CHOICES = [
        ('grain', 'Grains & Cereals'),
        ('legume', 'Legumes & Pulses'),
        ('vegetable', 'Vegetables'),
        ('fruit', 'Fruits'),
        ('cash', 'Cash Crops'),
        ('root', 'Roots & Tubers'),
        ('spice', 'Spices'),
    ]

    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    unit = models.CharField(max_length=50, default='kg', help_text="Standard unit of measurement")
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.strip().title()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PriceEntry(models.Model):
    """Crop price submissions from markets with anomaly tracking."""
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('flagged', 'Flagged as Anomaly'),
    ]

    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name='prices')
    market = models.ForeignKey(Market, on_delete=models.CASCADE, related_name='prices')
    price = models.FloatField(help_text="Price in TZS per unit")
    quantity = models.FloatField(null=True, blank=True, help_text="Quantity available")
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='submissions')
    submitted_at = models.DateTimeField(auto_now_add=True)
    price_date = models.DateField(help_text="Date the price was observed")

    # Anomaly detection fields
    is_anomaly = models.BooleanField(default=False)
    anomaly_score = models.FloatField(null=True, blank=True, help_text="Z-score or deviation metric")
    anomaly_reason = models.TextField(blank=True, help_text="Explanation of why flagged")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved')
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviews')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # GPS capture
    latitude = models.FloatField(null=True, blank=True, help_text="GPS latitude at submission")
    longitude = models.FloatField(null=True, blank=True, help_text="GPS longitude at submission")

    class Meta:
        ordering = ['-price_date', '-submitted_at']
        verbose_name_plural = 'Price entries'

    def __str__(self):
        return f"{self.crop.name} @ {self.market.name}: TZS {self.price} ({self.price_date})"


class MarketAgentSubmission(models.Model):
    """Tracks individual price submissions by market agents with status workflow."""
    STATUS_CHOICES = [
        ('published', 'Published'),
        ('under_review', 'Under Review'),
        ('flagged', 'Flagged'),
        ('live', 'Live'),
    ]

    price_entry = models.OneToOneField(PriceEntry, on_delete=models.CASCADE, related_name='agent_submission')
    agent = models.ForeignKey(User, on_delete=models.CASCADE, related_name='agent_submissions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='published')
    agent_notes = models.TextField(blank=True, help_text="Notes from agent, especially for flagged submissions")

    # Status change timestamps
    submitted_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)
    under_review_at = models.DateTimeField(null=True, blank=True)
    flagged_at = models.DateTimeField(null=True, blank=True)
    live_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-submitted_at']
        verbose_name_plural = 'Agent submissions'

    def __str__(self):
        return f"Submission by {self.agent.username} — {self.price_entry} [{self.status}]"

    def set_status(self, new_status):
        """Update status and set the corresponding timestamp."""
        self.status = new_status
        now = timezone.now()
        timestamp_map = {
            'published': 'published_at',
            'under_review': 'under_review_at',
            'flagged': 'flagged_at',
            'live': 'live_at',
        }
        field = timestamp_map.get(new_status)
        if field:
            setattr(self, field, now)
        self.save()


class TransportRoute(models.Model):
    """Transport cost estimates between market pairs for farmer/trader logistics."""
    VEHICLE_TYPE_CHOICES = [
        ('lorry', 'Lorry'),
        ('pickup', 'Pickup Truck'),
        ('motorbike', 'Motorbike'),
        ('bus', 'Bus / Minibus'),
        ('bicycle', 'Bicycle'),
    ]

    origin_market = models.ForeignKey(Market, on_delete=models.CASCADE, related_name='routes_from')
    destination_market = models.ForeignKey(Market, on_delete=models.CASCADE, related_name='routes_to')
    distance_km = models.FloatField(help_text="Approximate distance in kilometers")
    base_cost_tzs = models.FloatField(help_text="Base transport cost in TZS")
    cost_per_kg = models.FloatField(default=0, help_text="Additional cost per kg of produce")

    # Vehicle-specific costs (comma-separated: vehicle_type:cost)
    vehicle_costs = models.TextField(blank=True,
        help_text="Comma-separated vehicle:cost pairs, e.g. lorry:50000,pickup:30000,motorbike:5000")

    estimated_hours = models.FloatField(null=True, blank=True, help_text="Estimated travel time in hours")
    road_quality = models.CharField(max_length=20, blank=True,
        help_text="tarmac, gravel, dirt")
    is_seasonal = models.BooleanField(default=False,
        help_text="True if route is only passable in certain seasons")

    class Meta:
        unique_together = ['origin_market', 'destination_market']
        ordering = ['origin_market__name', 'destination_market__name']

    def __str__(self):
        return f"{self.origin_market.name} → {self.destination_market.name} ({self.distance_km}km)"

    def get_vehicle_cost(self, vehicle_type):
        """Parse vehicle_costs and return cost for specific vehicle type."""
        if not self.vehicle_costs:
            return self.base_cost_tzs
        pairs = self.vehicle_costs.split(',')
        for pair in pairs:
            parts = pair.strip().split(':')
            if len(parts) == 2 and parts[0].strip().lower() == vehicle_type.lower():
                try:
                    return float(parts[1].strip())
                except ValueError:
                    continue
        return self.base_cost_tzs


class PriceAlert(models.Model):
    """Price alerts for farmers/traders — notify on price drop or rise."""
    ALERT_TYPE_CHOICES = [
        ('price_drop', 'Price Drop'),
        ('price_rise', 'Price Rise'),
        ('above_threshold', 'Above Price Threshold'),
        ('below_threshold', 'Below Price Threshold'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('triggered', 'Triggered'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='price_alerts')
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name='price_alerts')
    market = models.ForeignKey(Market, on_delete=models.CASCADE, null=True, blank=True,
        related_name='price_alerts', help_text='Leave blank to monitor all markets')
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPE_CHOICES)
    threshold_price = models.FloatField(null=True, blank=True,
        help_text='Price threshold for above/below alerts (TZS)')
    pct_change = models.FloatField(null=True, blank=True,
        help_text='Percentage change to trigger alert (e.g. 10 for 10%)')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    triggered_at = models.DateTimeField(null=True, blank=True)
    last_checked = models.DateTimeField(null=True, blank=True)
    triggered_price = models.FloatField(null=True, blank=True,
        help_text='Price that triggered the alert')
    message = models.TextField(blank=True, help_text='Notification message when triggered')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        market_name = self.market.name if self.market else 'All Markets'
        return f"{self.user.username} — {self.get_alert_type_display()} alert for {self.crop.name} @ {market_name}"


class MarketMatch(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('fulfilled', 'Fulfilled'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    TYPE_CHOICES = [
        ('buy', 'Buyer Looking'),
        ('sell', 'Seller Offering'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='market_matches')
    match_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name='market_matches')
    region = models.CharField(max_length=100, blank=True)
    quantity_kg = models.FloatField(null=True, blank=True)
    target_price = models.FloatField(null=True, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.match_type} {self.crop.name}"


class Cooperative(models.Model):
    name = models.CharField(max_length=200)
    region = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    founded_year = models.IntegerField(null=True, blank=True)
    member_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_cooperatives')

    def __str__(self):
        return self.name


class CooperativeMembership(models.Model):
    cooperative = models.ForeignKey(Cooperative, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cooperative_memberships')
    joined_at = models.DateTimeField(auto_now_add=True)
    role = models.CharField(max_length=20, default='member')  # member, admin, chairperson

    class Meta:
        unique_together = ('cooperative', 'user')


# ──────────────────────────── TRANSPORT ENGINE ────────────────────────────

class RegionRoute(models.Model):
    """Edge in the Tanzania transport graph — connects two regions with distance and road info."""
    ROAD_TYPE_CHOICES = [
        ('trunk', 'Trunk Road (National Highway)'),
        ('regional', 'Regional Road'),
        ('district', 'District Road'),
    ]
    CORRIDOR_CHOICES = [
        ('northern', 'Northern Corridor (Dar → Arusha → Kenya)'),
        ('central', 'Central Corridor (Dar → Dodoma → Mwanza → Kigoma)'),
        ('southern', 'Southern Corridor (Dar → Mbeya → Tunduma)'),
        ('lake', 'Lake Corridor (Arusha → Mwanza → Kagera)'),
        ('western', 'Western Corridor (Arusha → Katavi)'),
        ('coastal', 'Coastal Corridor (Tanga → Dar → Mtwara)'),
        ('none', 'Not on a major corridor'),
    ]

    from_region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='routes_from')
    to_region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='routes_to')
    distance_km = models.FloatField(help_text="Road distance in kilometers")
    road_type = models.CharField(max_length=20, choices=ROAD_TYPE_CHOICES, default='trunk')
    corridor = models.CharField(max_length=20, choices=CORRIDOR_CHOICES, default='none')
    ROAD_CONDITION_CHOICES = [
        ('good', 'Good (paved, well-maintained)'),
        ('average', 'Average (some potholes, partially paved)'),
        ('poor', 'Poor (unpaved, rough terrain)'),
    ]

    condition_factor = models.FloatField(default=1.0,
        help_text="Road condition multiplier: 1.0=good, 1.1=fair, 1.2-1.4=poor/remote")
    road_condition = models.CharField(max_length=10, choices=ROAD_CONDITION_CHOICES, default='good',
        help_text="Human-readable road condition: good/average/poor")
    avg_speed_kmh = models.FloatField(default=60.0,
        help_text="Average speed in km/h: trunk=60, regional=40, district=30")
    is_bidirectional = models.BooleanField(default=True,
        help_text="If True, route works both ways (most roads)")

    @property
    def road_condition_multiplier(self):
        """Map road_condition to the spec's time multiplier: good=1.0, average=1.15, poor=1.3."""
        return {'good': 1.0, 'average': 1.15, 'poor': 1.3}.get(self.road_condition, 1.0)

    class Meta:
        unique_together = ('from_region', 'to_region')
        ordering = ['from_region__name', 'to_region__name']

    def __str__(self):
        return f"{self.from_region.name} → {self.to_region.name} ({self.distance_km}km)"

    def save(self, *args, **kwargs):
        # Auto-derive road_condition from condition_factor if not explicitly set
        if self.condition_factor <= 1.05:
            self.road_condition = 'good'
        elif self.condition_factor <= 1.15:
            self.road_condition = 'average'
        else:
            self.road_condition = 'poor'
        super().save(*args, **kwargs)


class PricingRule(models.Model):
    """Dynamic pricing rules for transport cost calculation."""
    VEHICLE_TYPE_CHOICES = [
        ('truck', 'Truck / Lorry'),
        ('bus', 'Bus / Express Bus'),
        ('pickup', 'Pickup Truck'),
        ('motorcycle', 'Motorcycle (Bodaboda)'),
        ('bicycle', 'Bicycle'),
    ]

    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, unique=True)
    base_rate_per_km = models.FloatField(default=1.85,
        help_text="Base rate: TSH per km per kg (truck/bus/pickup) or TSH per km (motorcycle)")
    vehicle_multiplier = models.FloatField(default=1.0,
        help_text="Vehicle type multiplier applied to base rate")
    fuel_multiplier = models.FloatField(default=1.0,
        help_text="Fuel price adjustment factor")
    min_charge = models.FloatField(default=5000.0,
        help_text="Minimum charge in TZS regardless of distance")
    large_cargo_threshold_kg = models.FloatField(default=5000.0,
        help_text="Cargo above this gets volume discount")
    large_cargo_discount = models.FloatField(default=0.9,
        help_text="Discount factor for large cargo (0.9 = 10% off)")

    def __str__(self):
        return f"{self.get_vehicle_type_display()} — {self.base_rate_per_km} TZS/km"


class UserPreferences(models.Model):
    """User notification and display preferences."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preferences')
    price_alerts = models.BooleanField(default=True, help_text="Receive price drop/rise alerts")
    market_updates = models.BooleanField(default=True, help_text="Receive market update notifications")
    sms_notifications = models.BooleanField(default=False, help_text="Receive SMS notifications")
    email_notifications = models.BooleanField(default=True, help_text="Receive email notifications")
    language = models.CharField(max_length=10, default='en', help_text="Preferred language (en/sw)")
    updated_at = models.DateTimeField(auto_now=True)

    # ── Granular notification controls ──
    notifications_enabled = models.BooleanField(default=True, help_text="Master switch: enable/disable all in-app notifications")
    opportunity_alerts = models.BooleanField(default=True, help_text="Market arbitrage opportunity alerts")
    transport_alerts = models.BooleanField(default=True, help_text="Transport cost change alerts")
    personalized_alerts = models.BooleanField(default=True, help_text="Personalized alerts based on tracked crops/regions")

    class Meta:
        verbose_name_plural = 'User preferences'

    def __str__(self):
        return f"{self.user.username}'s preferences"

    def accepts_notification_type(self, notif_type):
        """Check if user wants this notification type."""
        if not self.notifications_enabled:
            return False
        type_map = {
            'price_alert': self.price_alerts,
            'opportunity': self.opportunity_alerts,
            'transport': self.transport_alerts,
            'system': True,  # system messages always delivered
        }
        return type_map.get(notif_type, True)


# ──────────────────────────── NOTIFICATIONS ────────────────────────────

class Notification(models.Model):
    """Real-time notification system for price alerts, opportunities, transport, and system messages."""
    TYPE_CHOICES = [
        ('price_alert', 'Price Alert'),
        ('opportunity', 'Market Opportunity'),
        ('transport', 'Transport Alert'),
        ('system', 'System'),
    ]
    PRIORITY_CHOICES = [
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='system')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    title = models.CharField(max_length=300)
    message = models.TextField()
    region = models.CharField(max_length=100, blank=True)
    crop = models.CharField(max_length=100, blank=True, null=True, help_text="Crop name (nullable)")
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # Delivery tracking
    sms_sent = models.BooleanField(default=False)
    whatsapp_sent = models.BooleanField(default=False)
    delivery_attempted = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'read', '-created_at']),
            models.Index(fields=['user', 'type', '-created_at']),
            models.Index(fields=['type', 'crop', 'region', '-created_at']),
        ]

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title} → {self.user.username}"

    @classmethod
    def dedup_check(cls, user, notif_type, crop, region, hours=2):
        """Return True if a similar notification exists within the last N hours."""
        from django.utils import timezone as tz
        cutoff = tz.now() - timedelta(hours=hours)
        return cls.objects.filter(
            user=user,
            type=notif_type,
            crop=crop or '',
            region=region or '',
            created_at__gte=cutoff,
        ).exists()

    @classmethod
    def create_if_unique(cls, user, notif_type, priority, title, message, region='', crop=None):
        """Create notification only if no duplicate exists in last 2 hours AND user wants this type."""
        # Check user preferences (fresh query — don't use cached reverse relation)
        from .models import UserPreferences
        try:
            prefs = UserPreferences.objects.get(user=user)
            if not prefs.accepts_notification_type(notif_type):
                return None
        except UserPreferences.DoesNotExist:
            pass  # No preferences set — default to sending

        if cls.dedup_check(user, notif_type, crop, region):
            return None
        notification = cls.objects.create(
            user=user,
            type=notif_type,
            priority=priority,
            title=title,
            message=message,
            region=region,
            crop=crop,
        )
        # Attempt SMS/WhatsApp delivery via Notify Africa
        try:
            from prices.notification_channels import deliver_notification
            deliver_notification(notification)
        except Exception:
            import logging
            logging.getLogger('prices').exception('Notification channel dispatch failed for #%s', notification.id)
        return notification


class CropCalendar(models.Model):
    """Planting and harvest seasons per crop per region."""
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name='calendars')
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='calendars',
        null=True, blank=True, help_text="Leave blank for national calendar")
    season_name = models.CharField(max_length=100, blank=True,
        help_text="e.g. Masika, Vuli, Main Season")
    planting_start = models.IntegerField(help_text="Planting start month (1-12)", null=True, blank=True)
    planting_end = models.IntegerField(help_text="Planting end month (1-12)", null=True, blank=True)
    harvest_start = models.IntegerField(help_text="Harvest start month (1-12)", null=True, blank=True)
    harvest_end = models.IntegerField(help_text="Harvest end month (1-12)", null=True, blank=True)
    notes = models.TextField(blank=True, help_text="Additional notes about the season")
    source = models.CharField(max_length=200, blank=True, help_text="Source of the data")

    class Meta:
        ordering = ['crop', 'region', 'harvest_start']
        verbose_name_plural = 'Crop calendars'
        unique_together = [('crop', 'region', 'season_name')]

    def __str__(self):
        return f'{self.crop.name} - {self.region.name if self.region else "National"}: {self.season_name or "Default"}'


class SyncSource(models.Model):
    """Config for each external data source to sync."""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    scraper_command = models.CharField(max_length=300, help_text="e.g. kilimo_pdfs/scrape_all.py --source kilimo")
    update_interval_seconds = models.IntegerField(default=86400, help_text="How often to check for new data")
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=20, default='never',
        choices=[('never', 'Never'), ('running', 'Running'), ('success', 'Success'),
                 ('partial', 'Partial'), ('failed', 'Failed')])
    last_items_found = models.IntegerField(default=0)
    last_items_imported = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.last_status})'


class SyncLog(models.Model):
    """Record of a single sync run for a source."""
    source = models.ForeignKey(SyncSource, on_delete=models.CASCADE, related_name='logs')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default='running',
        choices=[('running', 'Running'), ('success', 'Success'),
                 ('partial', 'Partial'), ('failed', 'Failed')])
    items_found = models.IntegerField(default=0)
    items_imported = models.IntegerField(default=0)
    items_skipped = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['source', '-started_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f'[{self.status}] {self.source.name} @ {self.started_at.strftime("%Y-%m-%d %H:%M")}'


class WeatherData(models.Model):
    """Daily weather observations per region, synced from Open-Meteo."""
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='weather_data')
    date = models.DateField()
    temp_max = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    temp_min = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    precipitation = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    precipitation_probability = models.IntegerField(null=True, blank=True, help_text="Precipitation probability (%)")
    humidity = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    wind_speed = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    wind_direction = models.IntegerField(null=True, blank=True, help_text="Wind direction in degrees")
    pressure = models.DecimalField(max_digits=7, decimal_places=1, null=True, blank=True, help_text="Surface pressure (hPa)")
    dew_point = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Dew point temperature (°C)")
    apparent_temp = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Apparent/feels-like temperature (°C)")
    uv_index = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True, help_text="UV index")
    cloud_cover = models.IntegerField(null=True, blank=True, help_text="Total cloud cover (%)")
    visibility = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True, help_text="Visibility (km)")
    soil_temp_0cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Soil temperature at surface (°C)")
    soil_temp_6cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Soil temperature at 6cm depth (°C)")
    soil_moisture_0_1cm = models.DecimalField(max_digits=5, decimal_places=3, null=True, blank=True, help_text="Soil moisture 0-1cm (m³/m³)")
    soil_moisture_1_3cm = models.DecimalField(max_digits=5, decimal_places=3, null=True, blank=True, help_text="Soil moisture 1-3cm (m³/m³)")
    weather_code = models.IntegerField(null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['region', 'date']
        ordering = ['-date']
        indexes = [
            models.Index(fields=['region', '-date']),
        ]

    def __str__(self):
        return f'{self.region.name} {self.date}'


class HourlyWeatherData(models.Model):
    """Hourly weather observations per region for detailed forecasts."""
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='hourly_weather')
    timestamp = models.DateTimeField()
    temperature = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    precipitation = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    precipitation_probability = models.IntegerField(null=True, blank=True, help_text="Precipitation probability (%)")
    humidity = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    wind_speed = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    wind_direction = models.IntegerField(null=True, blank=True, help_text="Wind direction in degrees")
    pressure = models.DecimalField(max_digits=7, decimal_places=1, null=True, blank=True, help_text="Surface pressure (hPa)")
    apparent_temp = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Apparent/feels-like temperature (°C)")
    uv_index = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True, help_text="UV index")
    cloud_cover = models.IntegerField(null=True, blank=True, help_text="Cloud cover (%)")
    visibility = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True, help_text="Visibility (km)")
    weather_code = models.IntegerField(null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['region', 'timestamp']
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['region', '-timestamp']),
        ]

    def __str__(self):
        return f'{self.region.name} {self.timestamp}'


class LoginAttempt(models.Model):
    """Records login attempts for security monitoring and account lockout."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True,
        related_name='login_attempts')
    username = models.CharField(max_length=150, help_text="Username attempted")
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    success = models.BooleanField(default=False)
    attempt_method = models.CharField(max_length=20, default='password',
        help_text="password, magic_link, phone_otp, google")

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['username', '-timestamp']),
        ]

    def __str__(self):
        status = '✓' if self.success else '✗'
        return f"{status} {self.username} @ {self.timestamp.strftime('%Y-%m-%d %H:%M')}"
