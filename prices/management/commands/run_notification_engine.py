"""
Notification Engine — Background analysis trigger for Smart Crops.

Runs as a Django management command on a cron schedule:
  python manage.py run_notification_engine              # all checks
  python manage.py run_notification_engine --mode=opportunity   # high-priority only (every 10 min)
  python manage.py run_notification_engine --mode=price         # price movement (every 30 min)
  python manage.py run_notification_engine --mode=transport     # transport + personalized (every 60 min)

Modes:
  opportunity  — Cross-region price arbitrage (priority: high)
  price        — Price movement ≥ 10% in last 24h (priority: medium)
  transport    — Transport cost change > 15% (priority: medium)
  personalized — User preference–filtered alerts (priority: low)
  all          — Run everything (default)
"""

import sys
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth.models import User
from django.db.models import Avg, Max, Min, OuterRef, Subquery

# Fix stdout encoding on Windows for Swahili text
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


class Command(BaseCommand):
    help = 'Run the Smart Crops notification trigger engine'

    def add_arguments(self, parser):
        parser.add_argument(
            '--mode',
            type=str,
            default='all',
            choices=['all', 'opportunity', 'price', 'transport', 'personalized', 'weather'],
            help='Which notification checks to run',
        )

    def handle(self, *args, **options):
        mode = options['mode']
        self.stdout.write(f'[{timezone.now().isoformat()}] Notification engine starting (mode={mode})...')

        created_count = 0

        if mode in ('all', 'opportunity'):
            created_count += self.check_opportunities()

        if mode in ('all', 'price'):
            created_count += self.check_price_movements()

        if mode in ('all', 'transport'):
            created_count += self.check_transport_changes()

        if mode in ('all', 'personalized'):
            created_count += self.check_personalized_alerts()

        if mode in ('all', 'weather'):
            created_count += self.check_weather_alerts()

        self.stdout.write(
            self.style.SUCCESS(f'Engine complete. {created_count} notifications created.')
        )

    # ──────────────────────────── A) PRICE MOVEMENT ALERTS ────────────────────────────

    def check_price_movements(self):
        """
        Trigger: price change ≥ 10% in last 24h per crop per region.
        Compares today's average price vs yesterday's average.
        """
        from prices.models import PriceEntry, Crop, Region, Notification

        today = timezone.now().date()
        yesterday = today - timedelta(days=1)
        created = 0

        # Get crop-region pairs with prices on both days
        crops = Crop.objects.all()
        regions = Region.objects.all()

        for crop in crops:
            for region in regions:
                today_prices = list(PriceEntry.objects.filter(
                    crop=crop,
                    market__region=region,
                    status='approved',
                    price_date=today,
                ).values_list('price', flat=True))

                yesterday_prices = list(PriceEntry.objects.filter(
                    crop=crop,
                    market__region=region,
                    status='approved',
                    price_date=yesterday,
                ).values_list('price', flat=True))

                if not today_prices or not yesterday_prices:
                    continue

                today_avg = sum(today_prices) / len(today_prices)
                yesterday_avg = sum(yesterday_prices) / len(yesterday_prices)

                if yesterday_avg <= 0:
                    continue

                pct_change = ((today_avg - yesterday_avg) / yesterday_avg) * 100

                if abs(pct_change) >= 10:
                    direction = 'rose' if pct_change > 0 else 'dropped'
                    title = f'{crop.name} price in {region.name} {direction} by {abs(pct_change):.0f}% today'
                    message = (
                        f'{crop.name} average price in {region.name} moved from '
                        f'TZS {yesterday_avg:,.0f} to TZS {today_avg:,.0f} '
                        f'({direction} {abs(pct_change):.1f}%).'
                    )

                    # Send to all users who have this region/crop in their profile
                    target_users = self._get_users_for_region_crop(region.name, crop.name)
                    for user in target_users:
                        notif = Notification.create_if_unique(
                            user=user,
                            notif_type='price_alert',
                            priority='medium',
                            title=title,
                            message=message,
                            region=region.name,
                            crop=crop.name,
                        )
                        if notif:
                            created += 1

        self.stdout.write(f'  Price movements: {created} notifications created')
        return created

    # ──────────────────────────── B) MARKET OPPORTUNITY ALERTS ────────────────────────────

    def check_opportunities(self):
        """
        Trigger: price difference > TZS 200/kg between regions for same crop.
        Finds arbitrage opportunities for traders.
        """
        from prices.models import PriceEntry, Crop, Notification

        today = timezone.now().date()
        cutoff = today - timedelta(days=3)  # last 3 days for coverage
        created = 0

        for crop in Crop.objects.all():
            # Get latest price per region for this crop
            region_prices = {}
            entries = PriceEntry.objects.filter(
                crop=crop,
                status='approved',
                price_date__gte=cutoff,
            ).values(
                'market__region__name', 'price'
            ).order_by('-price_date')

            for e in entries:
                rname = e['market__region__name']
                if rname not in region_prices:
                    region_prices[rname] = []
                region_prices[rname].append(e['price'])

            if len(region_prices) < 2:
                continue

            # Compute average per region
            region_avgs = {}
            for rname, prices in region_prices.items():
                region_avgs[rname] = sum(prices) / len(prices)

            # Find max-min pairs
            sorted_regions = sorted(region_avgs.items(), key=lambda x: x[1])
            lowest_region, lowest_price = sorted_regions[0]
            highest_region, highest_price = sorted_regions[-1]

            spread = highest_price - lowest_price

            if spread > 200:
                title = f'Sell {crop.name} in {highest_region} for +TZS {spread:,.0f}/kg vs {lowest_region}'
                message = (
                    f'Arbitrage opportunity: {crop.name} is TZS {highest_price:,.0f}/kg in '
                    f'{highest_region} vs TZS {lowest_price:,.0f}/kg in {lowest_region}. '
                    f'Potential profit: TZS {spread:,.0f}/kg before transport costs.'
                )

                # Send to traders and farmers in relevant regions
                target_users = self._get_traders_and_farmers(
                    regions=[highest_region, lowest_region],
                    crop=crop.name,
                )
                for user in target_users:
                    notif = Notification.create_if_unique(
                        user=user,
                        notif_type='opportunity',
                        priority='high',
                        title=title,
                        message=message,
                        region=highest_region,
                        crop=crop.name,
                    )
                    if notif:
                        created += 1

        self.stdout.write(f'  Opportunities: {created} notifications created')
        return created

    # ──────────────────────────── C) TRANSPORT ALERTS ────────────────────────────

    def check_transport_changes(self):
        """
        Trigger: transport economics change > 15% between today and yesterday.

        Strategy: For each RegionRoute (connected region pair), compare today's
        crop price spread vs yesterday's. A significant spread change signals
        that transport costs now represent a different share of the profit margin,
        which matters to farmers deciding where to sell and traders planning routes.

        Also flags newly created TransportRoute entries with significant costs.
        """
        from prices.models import (
            RegionRoute, TransportRoute, PricingRule, PriceEntry,
            Crop, Region, Notification, UserProfile, UserPreferences,
        )

        today = timezone.now().date()
        yesterday = today - timedelta(days=1)
        created = 0

        # ── Part 1: Price spread changes across connected regions ──

        # Build region name → id mapping
        regions = list(Region.objects.all())
        region_name_map = {r.name: r.id for r in regions}
        region_id_map = {r.id: r.name for r in regions}

        # Get all direct region-to-region routes
        routes = list(RegionRoute.objects.select_related('from_region', 'to_region').all())
        if not routes:
            self.stdout.write('  Transport alerts: no RegionRoutes configured')
            return 0

        # Precompute truck pricing rule (most common for crop transport)
        try:
            truck_rule = PricingRule.objects.get(vehicle_type='truck')
        except PricingRule.DoesNotExist:
            truck_rule = None

        # Calculate approximate transport cost per kg for each route
        route_costs = {}
        for route in routes:
            distance = route.distance_km
            if truck_rule:
                # Simplified cost: distance × base_rate × condition × (1/1000 ton)
                cost_per_kg = (
                    distance * truck_rule.base_rate_per_km * route.condition_factor / 1000
                )
            else:
                # Fallback: rough estimate at 150 TZS per km per ton
                cost_per_kg = distance * 150 / 1000
            route_costs[(route.from_region.name, route.to_region.name)] = cost_per_kg

        # For each crop, check price spreads across connected routes
        crops = list(Crop.objects.all())
        cutoff = today - timedelta(days=3)  # Look back 3 days for data coverage

        for crop in crops:
            # Get recent approved prices grouped by region
            entries = list(
                PriceEntry.objects.filter(
                    crop=crop,
                    status='approved',
                    price_date__gte=cutoff,
                ).values(
                    'market__region__name', 'price', 'price_date'
                )
            )

            if not entries:
                continue

            # Group prices by region and date
            region_day_prices = {}  # {(region_name, date): [prices]}
            for e in entries:
                rname = e['market__region__name']
                pdate = e['price_date']
                key = (rname, pdate)
                if key not in region_day_prices:
                    region_day_prices[key] = []
                region_day_prices[key].append(e['price'])

            # Check each route for spread changes
            checked_pairs = set()
            for route in routes:
                from_name = route.from_region.name
                to_name = route.to_region.name
                pair_key = tuple(sorted([from_name, to_name]))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)

                # Get average prices for today and yesterday in both regions
                from_today = region_day_prices.get((from_name, today), [])
                from_yesterday = region_day_prices.get((from_name, yesterday), [])
                to_today = region_day_prices.get((to_name, today), [])
                to_yesterday = region_day_prices.get((to_name, yesterday), [])

                # Need data for both days in both regions
                if not (from_today and from_yesterday and to_today and to_yesterday):
                    continue

                from_today_avg = sum(from_today) / len(from_today)
                from_yesterday_avg = sum(from_yesterday) / len(from_yesterday)
                to_today_avg = sum(to_today) / len(to_today)
                to_yesterday_avg = sum(to_yesterday) / len(to_yesterday)

                if from_yesterday_avg <= 0 or from_today_avg <= 0:
                    continue

                # Calculate net margin at destination (price spread minus transport cost)
                cost_per_kg = route_costs.get((from_name, to_name), 0)
                today_spread = to_today_avg - from_today_avg - cost_per_kg
                yesterday_spread = to_yesterday_avg - from_yesterday_avg - cost_per_kg

                # Only flag if there's a meaningful spread and it changed significantly
                if abs(yesterday_spread) < 50:
                    continue  # Spread too small to matter

                pct_change = ((today_spread - yesterday_spread) / abs(yesterday_spread)) * 100

                if abs(pct_change) >= 15:
                    if pct_change > 0:
                        direction = 'more profitable'
                        priority = 'medium'
                    else:
                        direction = 'less profitable'
                        priority = 'medium'

                    title = (
                        f'Transport update: Selling {crop.name} in {to_name} '
                        f'is now {direction}'
                    )
                    message = (
                        f'The net margin for transporting {crop.name} from '
                        f'{from_name} to {to_name} changed by '
                        f'{abs(pct_change):.0f}% overnight. '
                        f'Today\'s spread: TZS {today_spread:,.0f}/kg '
                        f'(transport cost ~TZS {cost_per_kg:,.0f}/kg). '
                        f'Yesterday\'s spread: TZS {yesterday_spread:,.0f}/kg.'
                    )

                    # Target farmers in origin region and traders in both regions
                    target_users = self._get_traders_and_farmers(
                        regions=[from_name, to_name],
                        crop=crop.name,
                    )
                    for user in target_users:
                        notif = Notification.create_if_unique(
                            user=user,
                            notif_type='transport',
                            priority=priority,
                            title=title,
                            message=message,
                            region=to_name,
                            crop=crop.name,
                        )
                        if notif:
                            created += 1

        # ── Part 2: Flag high-cost transport routes ──

        # Check TransportRoute entries for seasonal/impassable routes
        seasonal_routes = TransportRoute.objects.filter(
            is_seasonal=True,
        ).select_related('origin_market__region', 'destination_market__region')

        for route in seasonal_routes:
            origin_region = route.origin_market.region.name if route.origin_market.region else None
            dest_region = route.destination_market.region.name if route.destination_market.region else None

            if not origin_region or not dest_region:
                continue

            # Alert users about seasonal route availability
            target_users = self._get_traders_and_farmers(
                regions=[origin_region, dest_region],
            )
            title = (
                f'Transport alert: {route.origin_market.name} → '
                f'{route.destination_market.name} is a seasonal route'
            )
            message = (
                f'The transport route from {route.origin_market.name} to '
                f'{route.destination_market.name} ({route.distance_km:.0f}km) '
                f'is seasonal. Base cost: TZS {route.base_cost_tzs:,.0f}. '
                f'Road quality: {route.road_quality or "unknown"}. '
                f'Plan your logistics accordingly.'
            )

            for user in target_users[:10]:  # Cap to avoid spam
                notif = Notification.create_if_unique(
                    user=user,
                    notif_type='transport',
                    priority='low',
                    title=title,
                    message=message,
                    region=dest_region,
                )
                if notif:
                    created += 1

        self.stdout.write(f'  Transport alerts: {created} notifications created')
        return created

    # ──────────────────────────── D) PERSONALIZED ALERTS ────────────────────────────

    def check_personalized_alerts(self):
        """
        Check user preferences and send relevant alerts.
        Matches user's tracked crops/regions against recent price movements.
        """
        from prices.models import UserProfile, UserPreferences, PriceEntry, Crop, Notification

        today = timezone.now().date()
        yesterday = today - timedelta(days=1)
        created = 0

        # Get users with preferences enabled
        profiles = UserProfile.objects.filter(
            approval_status='approved',
        ).select_related('user').prefetch_related('user__preferences')

        for profile in profiles:
            user = profile.user

            # Check if user has price_alerts enabled
            try:
                prefs = user.preferences
                if not prefs.price_alerts:
                    continue
            except UserPreferences.DoesNotExist:
                pass  # Default: send alerts

            # Get user's crops of interest
            user_crops = []
            if profile.role == 'farmer' and profile.main_crops:
                user_crops = [c.strip() for c in profile.main_crops.split(',') if c.strip()]
            elif profile.role == 'trader' and profile.crops_of_interest:
                user_crops = [c.strip() for c in profile.crops_of_interest.split(',') if c.strip()]

            if not user_crops:
                continue

            user_region = profile.region

            # Check if any of their crops had significant price changes
            for crop_name in user_crops[:5]:  # Limit to 5 crops
                try:
                    crop = Crop.objects.get(name__icontains=crop_name)
                except (Crop.DoesNotExist, Crop.MultipleObjectsReturned):
                    continue

                # Get prices for this crop in user's region
                qs = PriceEntry.objects.filter(
                    crop=crop, status='approved',
                )
                if user_region:
                    qs = qs.filter(market__region__name__icontains=user_region)

                today_prices = list(
                    qs.filter(price_date=today).values_list('price', flat=True)
                )
                yesterday_prices = list(
                    qs.filter(price_date=yesterday).values_list('price', flat=True)
                )

                if not today_prices or not yesterday_prices:
                    continue

                today_avg = sum(today_prices) / len(today_prices)
                yesterday_avg = sum(yesterday_prices) / len(yesterday_prices)

                if yesterday_avg <= 0:
                    continue

                pct_change = ((today_avg - yesterday_avg) / yesterday_avg) * 100

                # Lower threshold for personalized (5% instead of 10%)
                if abs(pct_change) >= 5:
                    direction = 'up' if pct_change > 0 else 'down'
                    region_label = user_region or 'your area'
                    title = f'Your crop update: {crop.name} is {direction} {abs(pct_change):.0f}% in {region_label}'
                    message = (
                        f'{crop.name} prices in {region_label} moved from '
                        f'TZS {yesterday_avg:,.0f} to TZS {today_avg:,.0f}. '
                        f'Based on your profile preferences.'
                    )

                    notif = Notification.create_if_unique(
                        user=user,
                        notif_type='price_alert',
                        priority='low',
                        title=title,
                        message=message,
                        region=user_region,
                        crop=crop.name,
                    )
                    if notif:
                        created += 1

        self.stdout.write(f'  Personalized: {created} notifications created')
        return created

    # ──────────────────────────── HELPERS ────────────────────────────

    def _get_users_for_region_crop(self, region_name, crop_name):
        """Get users who have interest in a specific region/crop."""
        from prices.models import UserProfile, UserPreferences

        profiles = UserProfile.objects.filter(
            approval_status='approved',
        ).select_related('user')

        users = []
        for p in profiles:
            # Check region match
            region_match = (
                p.region and region_name.lower() in p.region.lower()
            ) or (
                p.operating_regions and region_name.lower() in p.operating_regions.lower()
            )

            # Check crop match
            crop_match = (
                (p.main_crops and crop_name.lower() in p.main_crops.lower())
                or (p.crops_of_interest and crop_name.lower() in p.crops_of_interest.lower())
            )

            if region_match or crop_match:
                try:
                    prefs = p.user.preferences
                    if prefs.price_alerts:
                        users.append(p.user)
                except UserPreferences.DoesNotExist:
                    users.append(p.user)

        return users

    def check_weather_alerts(self):
        """Check weather conditions and create notifications for users in affected regions."""
        from prices.models import WeatherData, Region, Notification
        from django.contrib.auth.models import User

        today = timezone.now().date()
        latest_ids = WeatherData.objects.filter(
            region_id=OuterRef('region_id'),
            date__gte=today - timedelta(days=1),
        ).order_by('-date').values('id')[:1]
        records = WeatherData.objects.select_related('region').filter(
            id=Subquery(latest_ids),
        )

        created = 0
        for record in records:
            if not record.weather_code and not record.precipitation and not record.temp_max:
                continue

            try:
                temp = float(record.temp_max or 0)
                wind = float(record.wind_speed or 0)
                precip = float(record.precipitation or 0)
                code = record.weather_code
            except (TypeError, ValueError):
                continue

            region = record.region
            alerts = []

            if code and code >= 95:
                alerts.append(('high', 'Thunderstorm Warning',
                               f'Thunderstorm expected in {region.name}. Seek shelter and protect crops.'))
            elif code and code >= 80:
                alerts.append(('medium', 'Heavy Rain Warning',
                               f'Heavy rain in {region.name}. May affect market access and transport.'))
            if precip > 20:
                alerts.append(('medium', 'High Rainfall Alert',
                               f'{precip}mm rain in {region.name}. Flooding possible — plan transport.'))
            if temp > 38:
                alerts.append(('medium', 'Extreme Heat Warning',
                               f'{temp}°C in {region.name}. Keep crops hydrated, avoid midday transport.'))
            if wind > 50:
                alerts.append(('low', 'Strong Wind Advisory',
                               f'{wind} km/h winds in {region.name}. Secure farm structures.'))

            if not alerts:
                continue

            users = User.objects.filter(
                profile__region__iexact=region.name,
                is_active=True,
            ).select_related('profile')

            for priority, title, message in alerts:
                for user in users:
                    if Notification.create_if_unique(
                        user=user,
                        notif_type='system',
                        priority=priority,
                        title=title,
                        message=message,
                        region=region.name,
                    ):
                        created += 1

        if created:
            self.stdout.write(f'  weather: {created} notifications created')

        return created

    def _get_traders_and_farmers(self, regions=None, crop=None):
        """Get all trader/farmer users, optionally filtered by region/crop."""
        from prices.models import UserProfile, UserPreferences

        profiles = UserProfile.objects.filter(
            role__in=['trader', 'farmer'],
            approval_status='approved',
        ).select_related('user')

        users = []
        for p in profiles:
            # Check region interest
            if regions:
                region_match = False
                for r in regions:
                    if (p.region and r.lower() in p.region.lower()) or \
                       (p.operating_regions and r.lower() in p.operating_regions.lower()) or \
                       (p.primary_sales_region and r.lower() in p.primary_sales_region.lower()):
                        region_match = True
                        break
                if not region_match:
                    continue

            # Check crop interest
            if crop:
                crop_match = (
                    (p.main_crops and crop.lower() in p.main_crops.lower())
                    or (p.crops_of_interest and crop.lower() in p.crops_of_interest.lower())
                )
                if not crop_match:
                    continue

            # Check preferences
            try:
                prefs = p.user.preferences
                if not prefs.price_alerts:
                    continue
            except UserPreferences.DoesNotExist:
                pass

            users.append(p.user)

        return users
