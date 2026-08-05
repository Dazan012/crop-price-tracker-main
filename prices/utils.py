import numpy as np
from datetime import timedelta


def calculate_z_score(new_price, prices):
    """Calculate Z-score for anomaly detection."""
    if len(prices) < 3:
        return 0.0

    mean = np.mean(prices)
    std = np.std(prices, ddof=1)

    if std == 0:
        return 0.0

    return float((new_price - mean) / std)


def calculate_iqr_score(new_price, prices):
    """Calculate IQR-based anomaly score (robust to outliers)."""
    if len(prices) < 4:
        return 0.0

    q1 = np.percentile(prices, 25)
    q3 = np.percentile(prices, 75)
    iqr = q3 - q1

    if iqr == 0:
        return 0.0

    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    if new_price < lower_bound or new_price > upper_bound:
        deviation = max(abs(new_price - lower_bound), abs(new_price - upper_bound))
        return float(deviation / iqr)
    return 0.0


def get_weather_context_for_anomaly(crop_name, market_id=None):
    """Fetch weather data that might explain price anomalies.

    Returns dict with recent weather conditions or None.
    """
    try:
        from .models import Market, WeatherData, Crop
        from django.utils import timezone

        if market_id:
            market = Market.objects.get(id=market_id)
            region = market.region
        else:
            crop = Crop.objects.filter(name__iexact=crop_name).first()
            if not crop:
                return None
            first_price = crop.prices.filter(status='approved').first()
            if not first_price:
                return None
            region = first_price.market.region

        today = timezone.now().date()
        recent = WeatherData.objects.filter(
            region=region,
            date__gte=today - timedelta(days=7),
        ).order_by('-date')[:5]

        if not recent:
            return None

        total_precip = sum(float(r.precipitation or 0) for r in recent)
        avg_temp = sum(float(r.temp_max or 0) for r in recent) / len(recent)
        max_temp = max(float(r.temp_max or 0) for r in recent)
        extreme_weather = any(
            (r.weather_code and r.weather_code >= 80) or
            (float(r.precipitation or 0) > 20) or
            (float(r.temp_max or 0) > 38)
            for r in recent
        )

        return {
            'region': region.name,
            'total_precip_7d': round(total_precip, 1),
            'avg_temp_max': round(avg_temp, 1),
            'max_temp': round(max_temp, 1),
            'extreme_weather': extreme_weather,
            'days_checked': len(recent),
            'season': 'rainy' if total_precip > 50 else 'dry',
        }
    except Exception:
        return None


def detect_anomaly(new_price, crop_name, market_id=None, historical_prices=None):
    """
    Combined anomaly detection using Z-score and IQR methods.
    Incorporates weather context when available.

    Returns (is_anomaly, score, reason) tuple.
    """
    if historical_prices is None or len(historical_prices) < 3:
        return False, 0.0, "Insufficient historical data for validation"

    prices = list(historical_prices)

    z_score = calculate_z_score(new_price, prices)
    iqr_score = calculate_iqr_score(new_price, prices)

    mean_price = float(np.mean(prices))
    min_price = float(np.min(prices))
    max_price = float(np.max(prices))
    pct_deviation = abs(new_price - mean_price) / mean_price * 100 if mean_price > 0 else 0

    reasons = []
    is_anomaly = False

    if abs(z_score) > 2.5:
        is_anomaly = True
        direction = "above" if z_score > 0 else "below"
        reasons.append(f"Z-score anomaly: price is {abs(z_score):.2f} std deviations {direction} mean")

    if iqr_score > 1.5:
        is_anomaly = True
        reasons.append(f"IQR anomaly: deviation score {iqr_score:.2f}")

    if pct_deviation > 50:
        is_anomaly = True
        reasons.append(f"Price deviates {pct_deviation:.1f}% from historical mean (TZS {mean_price:.0f})")

    if new_price <= 0:
        is_anomaly = True
        reasons.append("Price is zero or negative")

    if is_anomaly:
        weather_ctx = get_weather_context_for_anomaly(crop_name, market_id)
        if weather_ctx and weather_ctx['extreme_weather']:
            reasons.append(
                f"Weather context: {weather_ctx['total_precip_7d']}mm rain in 7 days, "
                f"max temp {weather_ctx['max_temp']}°C — may explain price fluctuation"
            )

    if not reasons:
        reasons.append("Price within normal range")

    # Combine signals so flagged entries always carry a meaningful score,
    # even when the historical prices are identical (std=0 -> z and IQR are 0).
    combined_score = 0.5 * abs(z_score) + 0.3 * iqr_score + 0.2 * (pct_deviation / 50)

    return is_anomaly, round(combined_score, 4), "; ".join(reasons)
