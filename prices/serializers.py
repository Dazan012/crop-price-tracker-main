from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    UserProfile, Region, Market, Crop, PriceEntry,
    MarketAgentSubmission, TransportRoute, PriceAlert,
    Cooperative, CooperativeMembership, MarketMatch,
    Notification, WeatherData, HourlyWeatherData,
)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'role', 'phone', 'phone_verified', 'region', 'district',
            'approval_status', 'main_crops', 'farm_size', 'preferred_markets',
            'operating_regions', 'crops_of_interest', 'transport_capacity',
            'assigned_market', 'id_verification', 'experience',
        ]
        read_only_fields = ['approval_status', 'phone_verified']


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    approval_status = serializers.SerializerMethodField()
    is_approved = serializers.SerializerMethodField()
    can_submit_prices = serializers.SerializerMethodField()
    email_verified = serializers.SerializerMethodField()
    onboarding_complete = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    # Profile fields flattened for frontend convenience
    phone = serializers.SerializerMethodField()
    region = serializers.SerializerMethodField()
    district = serializers.SerializerMethodField()
    main_crops = serializers.SerializerMethodField()
    farm_size = serializers.SerializerMethodField()
    preferred_markets = serializers.SerializerMethodField()
    cooperative_name = serializers.SerializerMethodField()
    mobile_money_provider = serializers.SerializerMethodField()
    mobile_money_number = serializers.SerializerMethodField()
    operating_regions = serializers.SerializerMethodField()
    crops_of_interest = serializers.SerializerMethodField()
    transport_capacity = serializers.SerializerMethodField()
    assigned_market = serializers.SerializerMethodField()
    nida_number = serializers.SerializerMethodField()
    date_of_birth = serializers.SerializerMethodField()
    gender = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role',
                  'approval_status', 'is_approved', 'can_submit_prices', 'email_verified',
                  'onboarding_complete', 'has_password',
                  'phone', 'region', 'district', 'main_crops', 'farm_size',
                  'preferred_markets', 'cooperative_name', 'mobile_money_provider',
                  'mobile_money_number', 'operating_regions', 'crops_of_interest',
                  'transport_capacity', 'assigned_market', 'nida_number',
                  'date_of_birth', 'gender']

    def _profile(self, obj):
        try:
            return obj.profile
        except Exception:
            return None

    def get_role(self, obj):
        p = self._profile(obj)
        return p.role if p else 'general'

    def get_approval_status(self, obj):
        p = self._profile(obj)
        return p.approval_status if p else 'approved'

    def get_is_approved(self, obj):
        p = self._profile(obj)
        return p.is_approved if p else True

    def get_can_submit_prices(self, obj):
        p = self._profile(obj)
        return p.can_submit_prices if p else False

    def get_email_verified(self, obj):
        p = self._profile(obj)
        return p.email_verified if p else False

    def get_onboarding_complete(self, obj):
        p = self._profile(obj)
        return p.onboarding_complete if p else False

    def get_has_password(self, obj):
        return obj.has_usable_password()

    def get_phone(self, obj):
        p = self._profile(obj)
        return p.phone if p else ''

    def get_region(self, obj):
        p = self._profile(obj)
        return p.region if p else ''

    def get_district(self, obj):
        p = self._profile(obj)
        return p.district if p else ''

    def get_main_crops(self, obj):
        p = self._profile(obj)
        return p.main_crops if p else ''

    def get_farm_size(self, obj):
        p = self._profile(obj)
        return p.farm_size if p else None

    def get_preferred_markets(self, obj):
        p = self._profile(obj)
        return p.preferred_markets if p else ''

    def get_cooperative_name(self, obj):
        p = self._profile(obj)
        return p.cooperative_name if p else ''

    def get_mobile_money_provider(self, obj):
        p = self._profile(obj)
        return p.mobile_money_provider if p else ''

    def get_mobile_money_number(self, obj):
        p = self._profile(obj)
        return p.mobile_money_number if p else ''

    def get_operating_regions(self, obj):
        p = self._profile(obj)
        return p.operating_regions if p else ''

    def get_crops_of_interest(self, obj):
        p = self._profile(obj)
        return p.crops_of_interest if p else ''

    def get_transport_capacity(self, obj):
        p = self._profile(obj)
        return p.transport_capacity if p else ''

    def get_assigned_market(self, obj):
        p = self._profile(obj)
        try:
            return p.assigned_market.id if p and p.assigned_market else None
        except Exception:
            return None

    def get_nida_number(self, obj):
        p = self._profile(obj)
        return p.nida_number if p else ''

    def get_date_of_birth(self, obj):
        p = self._profile(obj)
        return p.date_of_birth if p else None

    def get_gender(self, obj):
        p = self._profile(obj)
        return p.gender if p else ''


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, default='general')
    phone = serializers.CharField(required=False, allow_blank=True)
    region = serializers.CharField(required=False, allow_blank=True)
    district = serializers.CharField(required=False, allow_blank=True)
    # Identity fields (all roles)
    nida_number = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(required=False, allow_blank=True)
    # Payment fields (all roles)
    mobile_money_provider = serializers.CharField(required=False, allow_blank=True)
    mobile_money_number = serializers.CharField(required=False, allow_blank=True)
    # Farmer fields
    main_crops = serializers.CharField(required=False, allow_blank=True)
    farm_size = serializers.FloatField(required=False, allow_null=True)
    preferred_markets = serializers.CharField(required=False, allow_blank=True)
    # Trader fields
    operating_regions = serializers.CharField(required=False, allow_blank=True)
    crops_of_interest = serializers.CharField(required=False, allow_blank=True)
    transport_capacity = serializers.CharField(required=False, allow_blank=True)
    # Agent fields
    assigned_market = serializers.IntegerField(required=False, allow_null=True)
    id_verification = serializers.CharField(required=False, allow_blank=True)
    experience = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'first_name', 'last_name',
            'role', 'phone', 'region', 'district',
            'nida_number', 'date_of_birth', 'gender',
            'mobile_money_provider', 'mobile_money_number',
            'main_crops', 'farm_size', 'preferred_markets',
            'operating_regions', 'crops_of_interest', 'transport_capacity',
            'assigned_market', 'id_verification', 'experience',
        ]

    def create(self, validated_data):
        role = validated_data.pop('role', 'general')
        phone = validated_data.pop('phone', '')
        region = validated_data.pop('region', '')
        district = validated_data.pop('district', '')
        nida_number = validated_data.pop('nida_number', '')
        date_of_birth = validated_data.pop('date_of_birth', None)
        gender = validated_data.pop('gender', '')
        mobile_money_provider = validated_data.pop('mobile_money_provider', '')
        mobile_money_number = validated_data.pop('mobile_money_number', '')
        main_crops = validated_data.pop('main_crops', '')
        farm_size = validated_data.pop('farm_size', None)
        preferred_markets = validated_data.pop('preferred_markets', '')
        operating_regions = validated_data.pop('operating_regions', '')
        crops_of_interest = validated_data.pop('crops_of_interest', '')
        transport_capacity = validated_data.pop('transport_capacity', '')
        assigned_market_id = validated_data.pop('assigned_market', None)
        id_verification = validated_data.pop('id_verification', '')
        experience = validated_data.pop('experience', '')
        password = validated_data.pop('password')

        user = User.objects.create_user(password=password, **validated_data)

        # Agents start as pending, all others auto-approved
        approval_status = 'pending' if role == 'agent' else 'approved'

        profile_kwargs = dict(
            user=user, role=role, phone=phone, region=region, district=district,
            approval_status=approval_status,
            nida_number=nida_number, date_of_birth=date_of_birth, gender=gender,
            mobile_money_provider=mobile_money_provider, mobile_money_number=mobile_money_number,
            main_crops=main_crops, farm_size=farm_size,
            preferred_markets=preferred_markets,
            operating_regions=operating_regions, crops_of_interest=crops_of_interest,
            transport_capacity=transport_capacity,
            id_verification=id_verification, experience=experience,
        )

        if assigned_market_id:
            try:
                profile_kwargs['assigned_market'] = Market.objects.get(id=assigned_market_id)
            except Market.DoesNotExist:
                pass

        UserProfile.objects.create(**profile_kwargs)
        return user


class RegionSerializer(serializers.ModelSerializer):
    market_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Region
        fields = ['id', 'name', 'zone', 'market_count']


class MarketSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)

    class Meta:
        model = Market
        fields = ['id', 'name', 'region', 'region_name', 'district', 'ward',
                  'location_description', 'market_type', 'operating_days',
                  'governing_authority', 'is_active', 'created_at']


class CropSerializer(serializers.ModelSerializer):
    class Meta:
        model = Crop
        fields = ['id', 'name', 'category', 'unit', 'description']


class PriceEntrySerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source='crop.name', read_only=True)
    market_name = serializers.CharField(source='market.name', read_only=True)
    region_name = serializers.CharField(source='market.region.name', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.username', read_only=True, default=None)
    price_category = serializers.SerializerMethodField()

    class Meta:
        model = PriceEntry
        fields = [
            'id', 'crop', 'crop_name', 'market', 'market_name', 'region_name',
            'price', 'quantity', 'submitted_by', 'submitted_by_name',
            'submitted_at', 'price_date', 'is_anomaly', 'anomaly_score',
            'anomaly_reason', 'status', 'reviewed_by', 'reviewed_at',
            'price_category', 'latitude', 'longitude',
        ]
        read_only_fields = ['submitted_by', 'is_anomaly', 'anomaly_score', 'anomaly_reason', 'status']

    def get_price_category(self, obj):
        """Categorize price as low/medium/high relative to crop average."""
        cache = getattr(self, '_crop_avgs', None)
        if cache is None:
            from django.db.models import Avg
            cache = dict(PriceEntry.objects.filter(
                status='approved'
            ).values('crop_id').annotate(avg=Avg('price')).values_list('crop_id', 'avg'))
            self._crop_avgs = cache
        avg = cache.get(obj.crop_id)
        if avg is None:
            return 'unknown'
        if obj.price < avg * 0.85:
            return 'low'
        elif obj.price > avg * 1.15:
            return 'high'
        return 'medium'


class PriceSubmitSerializer(serializers.Serializer):
    """Serializer for submitting a new price entry."""
    crop = serializers.PrimaryKeyRelatedField(queryset=Crop.objects.all())
    market = serializers.PrimaryKeyRelatedField(queryset=Market.objects.all())
    price = serializers.FloatField(min_value=0.01)
    quantity = serializers.FloatField(required=False, allow_null=True, min_value=0)
    price_date = serializers.DateField()
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)


class PriceReviewSerializer(serializers.Serializer):
    """Serializer for admin review of flagged entries."""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    reason = serializers.CharField(required=False, allow_blank=True)


class AgentApprovalSerializer(serializers.Serializer):
    """Serializer for admin approving/rejecting agent accounts."""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    reason = serializers.CharField(required=False, allow_blank=True)


# ── New serializers for Phase 2 features ──────────────────────

class AgentSubmissionSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source='price_entry.crop.name', read_only=True)
    crop_id = serializers.IntegerField(source='price_entry.crop.id', read_only=True)
    market_name = serializers.CharField(source='price_entry.market.name', read_only=True)
    market_id = serializers.IntegerField(source='price_entry.market.id', read_only=True)
    region_name = serializers.CharField(source='price_entry.market.region.name', read_only=True)
    price = serializers.FloatField(source='price_entry.price', read_only=True)
    price_date = serializers.DateField(source='price_entry.price_date', read_only=True)
    quantity = serializers.FloatField(source='price_entry.quantity', read_only=True)
    is_anomaly = serializers.BooleanField(source='price_entry.is_anomaly', read_only=True)
    anomaly_score = serializers.FloatField(source='price_entry.anomaly_score', read_only=True)
    agent_name = serializers.CharField(source='agent.username', read_only=True)

    class Meta:
        model = MarketAgentSubmission
        fields = [
            'id', 'price_entry', 'agent', 'agent_name', 'status', 'agent_notes',
            'submitted_at', 'published_at', 'under_review_at', 'flagged_at', 'live_at',
            'crop_name', 'crop_id', 'market_name', 'market_id', 'region_name',
            'price', 'price_date', 'quantity', 'is_anomaly', 'anomaly_score',
        ]
        read_only_fields = ['agent', 'price_entry']


class AgentSubmissionDetailSerializer(AgentSubmissionSerializer):
    """Extended serializer with full anomaly details."""
    anomaly_reason = serializers.CharField(source='price_entry.anomaly_reason', read_only=True)
    entry_status = serializers.CharField(source='price_entry.status', read_only=True)

    class Meta(AgentSubmissionSerializer.Meta):
        fields = AgentSubmissionSerializer.Meta.fields + ['anomaly_reason', 'entry_status']


class AgentSubmissionNoteSerializer(serializers.Serializer):
    """Serializer for updating agent notes on a submission."""
    agent_notes = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(
        choices=['published', 'under_review', 'flagged', 'live'],
        required=False,
    )


class TransportRouteSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin_market.name', read_only=True)
    destination_name = serializers.CharField(source='destination_market.name', read_only=True)
    origin_region = serializers.CharField(source='origin_market.region.name', read_only=True)
    destination_region = serializers.CharField(source='destination_market.region.name', read_only=True)

    class Meta:
        model = TransportRoute
        fields = [
            'id', 'origin_market', 'origin_name', 'origin_region',
            'destination_market', 'destination_name', 'destination_region',
            'distance_km', 'base_cost_tzs', 'cost_per_kg', 'vehicle_costs',
            'estimated_hours', 'road_quality', 'is_seasonal',
        ]


class PriceAlertSerializer(serializers.ModelSerializer):
    crop_name = serializers.CharField(source='crop.name', read_only=True)
    market_name = serializers.SerializerMethodField()
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    def get_market_name(self, obj):
        return obj.market.name if obj.market else None

    class Meta:
        model = PriceAlert
        fields = [
            'id', 'crop', 'crop_name', 'market', 'market_name',
            'alert_type', 'alert_type_display',
            'threshold_price', 'pct_change',
            'status', 'status_display',
            'created_at', 'triggered_at', 'triggered_price', 'message',
        ]
        read_only_fields = ['status', 'triggered_at', 'triggered_price', 'message']


class PriceAlertCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceAlert
        fields = ['crop', 'market', 'alert_type', 'threshold_price', 'pct_change']

    def validate(self, data):
        alert_type = data.get('alert_type')
        if alert_type in ('above_threshold', 'below_threshold') and not data.get('threshold_price'):
            raise serializers.ValidationError('threshold_price is required for above/below threshold alerts.')
        if alert_type in ('price_drop', 'price_rise') and not data.get('pct_change'):
            data['pct_change'] = 10.0  # Default 10% change
        return data


class CooperativeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cooperative
        fields = ['id', 'name', 'region', 'description', 'founded_year', 'member_count', 'created_at']
        read_only_fields = ['id', 'member_count', 'created_at']


class CooperativeMembershipSerializer(serializers.ModelSerializer):
    cooperative_name = serializers.SerializerMethodField()

    class Meta:
        model = CooperativeMembership
        fields = ['id', 'cooperative', 'cooperative_name', 'user', 'joined_at', 'role']
        read_only_fields = ['id', 'joined_at']

    def get_cooperative_name(self, obj):
        return obj.cooperative.name if obj.cooperative else None


class MarketMatchSerializer(serializers.ModelSerializer):
    crop_name = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()

    class Meta:
        model = MarketMatch
        fields = [
            'id', 'user', 'username', 'match_type', 'crop', 'crop_name',
            'region', 'quantity_kg', 'target_price', 'description',
            'status', 'created_at', 'expires_at',
        ]
        read_only_fields = ['id', 'user', 'status', 'created_at']

    def get_crop_name(self, obj):
        return obj.crop.name if obj.crop else None

    def get_username(self, obj):
        return obj.user.username if obj.user else None


# ── Notification Serializer ──────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    time_ago = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'type_display', 'priority', 'priority_display',
            'title', 'message', 'region', 'crop', 'read', 'created_at',
            'time_ago', 'sms_sent', 'whatsapp_sent', 'delivery_attempted',
        ]
        read_only_fields = ['id', 'type', 'priority', 'title', 'message', 'region', 'crop', 'created_at']

class WeatherSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)

    class Meta:
        model = WeatherData
        fields = [
            'id', 'region', 'region_name', 'date',
            'temp_max', 'temp_min', 'precipitation',
            'precipitation_probability', 'humidity', 'wind_speed',
            'wind_direction', 'pressure', 'dew_point',
            'apparent_temp', 'uv_index', 'cloud_cover',
            'visibility', 'soil_temp_0cm', 'soil_temp_6cm',
            'soil_moisture_0_1cm', 'soil_moisture_1_3cm',
            'weather_code',
        ]


class HourlyWeatherSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)

    class Meta:
        model = HourlyWeatherData
        fields = [
            'id', 'region', 'region_name', 'timestamp',
            'temperature', 'precipitation', 'precipitation_probability',
            'humidity', 'wind_speed', 'wind_direction',
            'pressure', 'apparent_temp', 'uv_index',
            'cloud_cover', 'visibility', 'weather_code',
        ]


class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    time_ago = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'type_display', 'priority', 'priority_display',
            'title', 'message', 'region', 'crop', 'read', 'created_at',
            'time_ago', 'sms_sent', 'whatsapp_sent', 'delivery_attempted',
        ]
        read_only_fields = ['id', 'type', 'priority', 'title', 'message', 'region', 'crop', 'created_at']

    def get_time_ago(self, obj):
        """Human-readable relative time."""
        from django.utils import timezone as tz
        delta = tz.now() - obj.created_at
        seconds = int(delta.total_seconds())
        if seconds < 60:
            return 'just now'
        minutes = seconds // 60
        if minutes < 60:
            return f'{minutes}m ago'
        hours = minutes // 60
        if hours < 24:
            return f'{hours}h ago'
        days = hours // 24
        if days < 7:
            return f'{days}d ago'
        return obj.created_at.strftime('%b %d')


