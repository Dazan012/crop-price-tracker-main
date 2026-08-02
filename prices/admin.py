from django.contrib import admin
from django.urls import path, reverse
from django.shortcuts import redirect
from django.utils.html import format_html
from .models import (
    UserProfile, Region, Market, Crop, PriceEntry,
    MarketAgentSubmission, TransportRoute, Notification,
    SyncSource, SyncLog, CropCalendar, WeatherData, HourlyWeatherData
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'phone', 'region', 'approval_status', 'created_at']
    list_filter = ['role', 'approval_status']
    search_fields = ['user__username', 'phone', 'region', 'nida_number']


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ['name', 'zone']
    list_filter = ['zone']
    search_fields = ['name']


@admin.register(Market)
class MarketAdmin(admin.ModelAdmin):
    list_display = ['name', 'region', 'district', 'market_type', 'is_active', 'created_at']
    list_filter = ['is_active', 'region', 'market_type']
    search_fields = ['name', 'location_description', 'district']


@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'unit']
    list_filter = ['category']
    search_fields = ['name', 'description']


@admin.register(PriceEntry)
class PriceEntryAdmin(admin.ModelAdmin):
    list_display = ['crop', 'market', 'price', 'price_date', 'status', 'is_anomaly', 'submitted_by']
    list_filter = ['status', 'is_anomaly', 'price_date']
    search_fields = ['crop__name', 'market__name', 'anomaly_reason']
    date_hierarchy = 'price_date'


@admin.register(MarketAgentSubmission)
class MarketAgentSubmissionAdmin(admin.ModelAdmin):
    list_display = ['agent', 'price_entry', 'status', 'submitted_at', 'published_at']
    list_filter = ['status']
    search_fields = ['agent__username', 'agent_notes', 'price_entry__crop__name']
    date_hierarchy = 'submitted_at'


@admin.register(TransportRoute)
class TransportRouteAdmin(admin.ModelAdmin):
    list_display = ['origin_market', 'destination_market', 'distance_km', 'base_cost_tzs', 'estimated_hours']
    list_filter = ['road_quality', 'is_seasonal']
    search_fields = ['origin_market__name', 'destination_market__name']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'type', 'priority', 'read', 'sms_sent', 'whatsapp_sent', 'created_at']
    list_filter = ['type', 'priority', 'read', 'sms_sent', 'whatsapp_sent', 'created_at']
    search_fields = ['title', 'message', 'user__username', 'region', 'crop']
    date_hierarchy = 'created_at'
    readonly_fields = ['created_at', 'delivery_attempted']


@admin.register(SyncSource)
class SyncSourceAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'update_interval_display', 'is_active',
                    'last_sync_at', 'last_status', 'last_items_imported', 'sync_now_link']
    list_filter = ['is_active', 'last_status']
    readonly_fields = ['last_sync_at', 'last_status', 'last_items_found',
                       'last_items_imported', 'created_at']
    fieldsets = [
        (None, {
            'fields': ['name', 'slug', 'scraper_command', 'update_interval_seconds', 'is_active']
        }),
        ('Last Sync', {
            'fields': ['last_sync_at', 'last_status', 'last_items_found',
                       'last_items_imported', 'last_items_skipped'],
            'classes': ['collapse']
        }),
    ]

    def update_interval_display(self, obj):
        secs = obj.update_interval_seconds
        if secs >= 86400:
            return f'{secs // 86400}d'
        elif secs >= 3600:
            return f'{secs // 3600}h'
        else:
            return f'{secs // 60}m'
    update_interval_display.short_description = 'Interval'

    def sync_now_link(self, obj):
        return format_html(
            '<a class="button" href="{}">Sync Now</a>',
            reverse('admin:sync-source-sync-now', args=[obj.pk])
        )
    sync_now_link.short_description = 'Action'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:pk>/sync-now/',
                self.admin_site.admin_view(self.sync_now_view),
                name='sync-source-sync-now',
            ),
            path(
                'sync-all/',
                self.admin_site.admin_view(self.sync_all_view),
                name='sync-source-sync-all',
            ),
        ]
        return custom_urls + urls

    def sync_now_view(self, request, pk):
        from django.core.management import call_command
        from django.contrib import messages
        try:
            call_command('sync_all_data', source=SyncSource.objects.get(pk=pk).slug, force=True, verbosity=0)
            messages.success(request, 'Sync completed.')
        except Exception as e:
            messages.error(request, f'Sync failed: {e}')
        return redirect('admin:prices_syncsource_changelist')

    def sync_all_view(self, request):
        from django.core.management import call_command
        from django.contrib import messages
        try:
            call_command('sync_all_data', force=True, verbosity=0)
            messages.success(request, 'All sources synced.')
        except Exception as e:
            messages.error(request, f'Sync failed: {e}')
        return redirect('admin:prices_syncsource_changelist')

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['sync_all_url'] = reverse('admin:sync-source-sync-all')
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    list_display = ['source', 'started_at', 'finished_at', 'status',
                    'items_found', 'items_imported', 'items_skipped']
    list_filter = ['status', 'source', 'started_at']
    readonly_fields = ['source', 'started_at', 'finished_at', 'status',
                       'items_found', 'items_imported', 'items_skipped',
                       'error_message', 'details']
    date_hierarchy = 'started_at'
    search_fields = ['source__name', 'error_message']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(CropCalendar)
class CropCalendarAdmin(admin.ModelAdmin):
    list_display = ['crop', 'region', 'season_name', 'planting_start', 'planting_end',
                    'harvest_start', 'harvest_end']
    list_filter = ['region', 'season_name']
    search_fields = ['crop__name', 'region__name', 'season_name']


@admin.register(WeatherData)
class WeatherDataAdmin(admin.ModelAdmin):
    list_display = ['region', 'date', 'temp_max', 'temp_min', 'precipitation', 'precipitation_probability',
                    'humidity', 'wind_speed', 'weather_code']
    list_filter = ['region', 'date']
    search_fields = ['region__name']
    date_hierarchy = 'date'
    readonly_fields = ['fetched_at']


@admin.register(HourlyWeatherData)
class HourlyWeatherDataAdmin(admin.ModelAdmin):
    list_display = ['region', 'timestamp', 'temperature', 'precipitation', 'humidity', 'wind_speed', 'weather_code']
    list_filter = ['region', 'timestamp']
    search_fields = ['region__name']
    date_hierarchy = 'timestamp'
    readonly_fields = ['fetched_at']
