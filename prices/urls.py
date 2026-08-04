from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/me/', views.me, name='me'),
    path('auth/delete-account/', views.delete_account, name='delete-account'),
    path('auth/change-password/', views.change_password, name='change-password'),
    path('auth/set-password/', views.set_password, name='set-password'),
    path('auth/forgot-password/', views.forgot_password, name='forgot-password'),
    path('auth/reset-password/', views.reset_password, name='reset-password'),
    path('auth/send-verification/', views.send_verification_code, name='send-verification'),
    path('auth/verify-email/', views.verify_email, name='verify-email'),
    path('auth/resend-verification/', views.resend_verification_code, name='resend-verification'),
    path('auth/profile/', views.update_profile, name='update-profile'),
    path('auth/preferences/', views.user_preferences, name='user-preferences'),
    # Frictionless auth (passwordless)
    path('auth/magic-link/send/', views.send_magic_link, name='send-magic-link'),
    path('auth/magic-link/verify/', views.verify_magic_link, name='verify-magic-link'),
    path('auth/phone/send-code/', views.send_phone_code, name='send-phone-code'),
    path('auth/phone/verify/', views.verify_phone_code, name='verify-phone-code'),
    path('auth/google/', views.google_auth, name='google-auth'),
    path('auth/complete-onboarding/', views.complete_onboarding, name='complete-onboarding'),
    # Security
    path('auth/login-history/', views.login_history, name='login-history'),
    path('auth/account-status/', views.account_status, name='account-status'),
    # Admin user management
    path('admin/users/', views.admin_list_users, name='admin-users'),
    path('admin/users/<int:user_id>/', views.admin_update_user, name='admin-update-user'),
    # Data
    path('regions/', views.list_regions, name='regions'),
    path('markets/', views.list_markets, name='markets'),
    path('crops/', views.list_crops, name='crops'),
    path('region-crops/', views.region_crops, name='region-crops'),
    # Prices
    path('prices/', views.get_prices, name='prices'),
    path('prices/submit/', views.submit_price, name='submit-price'),
    path('prices/<int:pk>/', views.delete_price, name='delete-price'),
    path('prices/segments/<int:crop_id>/', views.price_segments, name='price-segments'),
    path('prices/ohlc/', views.price_ohlc, name='price-ohlc'),
    path('prices/heatmap/', views.price_heatmap, name='price-heatmap'),
    path('prices/forecast/', views.price_forecast_enhanced, name='price-forecast-enhanced'),
    # Forecasting
    path('forecast/<int:crop_id>/', views.crop_forecast, name='crop-forecast'),
    path('forecast/<int:crop_id>/<int:market_id>/', views.crop_market_forecast, name='crop-market-forecast'),
    # Anomalies
    path('anomalies/', views.get_anomalies, name='anomalies'),
    path('reviews/', views.get_pending_reviews, name='reviews'),
    path('reviews/<int:pk>/', views.review_price, name='review-price'),
    # Agent management
    path('agents/pending/', views.pending_agents, name='pending-agents'),
    path('agents/<int:user_id>/approve/', views.approve_agent, name='approve-agent'),
    # Agent submissions
    path('agent/submissions/', views.agent_submissions_list, name='agent-submissions'),
    path('agent/stats/', views.agent_submissions_stats, name='agent-stats'),
    path('agent/submission/<int:pk>/note/', views.agent_submission_note, name='agent-submission-note'),
    # Trader intelligence
    path('spread-analysis/', views.spread_analysis, name='spread-analysis'),
    path('supply-tracker/', views.supply_tracker, name='supply-tracker'),
    # Farmer intelligence
    path('best-market/', views.best_market, name='best-market'),
    path('transport-cost/', views.transport_cost, name='transport-cost'),
    path('calculate-transport/', views.calculate_transport, name='calculate-transport'),
    path('multi-stage-transport/', views.multi_stage_transport, name='multi-stage-transport'),
    path('transport-routes/', views.list_transport_routes, name='transport-routes'),
    path('pricing-rules/', views.list_pricing_rules, name='pricing-rules'),
    path('sell-advisor/', views.sell_advisor, name='sell-advisor'),
    # Recommendations
    path('recommendations/', views.recommendations, name='recommendations'),
    # Dashboard
    path('dashboard/', views.dashboard_stats, name='dashboard'),
    # Price Alerts
    path('alerts/', views.list_alerts, name='list-alerts'),
    path('alerts/create/', views.create_alert, name='create-alert'),
    path('alerts/<int:pk>/', views.delete_alert, name='delete-alert'),
    path('alerts/check/', views.check_alerts, name='check-alerts'),
    # Cooperatives
    path('cooperatives/', views.list_cooperatives, name='list-cooperatives'),
    path('cooperatives/create/', views.create_cooperative, name='create-cooperative'),
    path('cooperatives/my/', views.my_cooperatives, name='my-cooperatives'),
    path('cooperatives/<int:pk>/join/', views.join_cooperative, name='join-cooperative'),
    path('cooperatives/<int:pk>/leave/', views.leave_cooperative, name='leave-cooperative'),
    # Market Matches
    path('matches/', views.list_matches, name='list-matches'),
    path('matches/create/', views.create_match, name='create-match'),
    path('matches/my/', views.my_matches, name='my-matches'),
    path('matches/<int:pk>/cancel/', views.cancel_match, name='cancel-match'),
    # Notifications
    path('notifications/', views.list_notifications, name='list-notifications'),
    path('notifications/summary/', views.notification_summary, name='notification-summary'),
    path('notifications/mark-all-read/', views.mark_all_notifications_read, name='mark-all-read'),
    path('notifications/create/', views.create_notification_internal, name='create-notification'),
    path('notifications/seed-demo/', views.seed_demo_notifications, name='seed-demo-notifications'),
    path('notifications/<int:pk>/read/', views.mark_notification_read, name='mark-notification-read'),
    # Reports
    path('reports/<path:fmt>/', views.generate_report, name='generate-report'),
    # Weather
    path('weather/', views.get_weather, name='weather'),
    path('weather/hourly/', views.get_hourly_weather, name='weather-hourly'),
    path('weather/alert/', views.get_weather_alert, name='weather-alert'),
    path('weather/crop-weather/', views.get_crop_weather, name='crop-weather'),
    path('weather/check-notifications/', views.check_weather_notifications, name='weather-notifications'),
    # Search
    path('search/', views.search, name='search'),
    # Health
    path('health/', views.health_check, name='health-check'),
]
