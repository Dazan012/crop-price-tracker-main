"""
ARIMA-based price forecasting for Smart Crops.
Uses statsmodels ARIMA when available, falls back to linear regression.
Trained on historical price data from kilimo.go.tz and user submissions.
"""
import numpy as np
from datetime import timedelta
import warnings

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False


def forecast_prices(daily_prices, horizon_days=30):
    """
    Forecast future prices using ARIMA or fallback methods.

    Args:
        daily_prices: list of (date_str, price) tuples, ordered by date
        horizon_days: how many days ahead to forecast (7, 14, or 30)

    Returns:
        dict with keys:
          - predictions: list of {date, price, lower, upper} for each forecast day
          - trend: 'rising', 'falling', or 'stable'
          - confidence: 0.0 to 1.0
          - method: 'arima', 'exponential_smoothing', or 'linear'
          - current_price: latest observed price
          - predicted_7, predicted_14, predicted_30: point forecasts
          - r_squared: goodness of fit
          - action: 'sell_now', 'hold', or 'wait'
          - action_reason: human-readable explanation
    """
    if not daily_prices or len(daily_prices) < 3:
        return {
            'predictions': [],
            'trend': 'stable',
            'confidence': 0.0,
            'method': 'insufficient_data',
            'current_price': 0,
            'predicted_7': 0, 'predicted_14': 0, 'predicted_30': 0,
            'r_squared': 0,
            'action': 'hold',
            'action_reason': 'Insufficient data for reliable forecast',
        }

    # Parse dates and prices
    dates = []
    prices = []
    for date_str, price in daily_prices:
        dates.append(str(date_str))
        prices.append(float(price))

    y = np.array(prices)
    n = len(y)
    current_price = float(y[-1])

    # Try ARIMA first (best for time series)
    if HAS_STATSMODELS and n >= 10:
        try:
            return _arima_forecast(y, dates, horizon_days, current_price)
        except Exception:
            pass  # Fall through to exponential smoothing

    # Try Exponential Smoothing (good for trend + seasonality)
    if HAS_STATSMODELS and n >= 6:
        try:
            return _exp_smoothing_forecast(y, dates, horizon_days, current_price)
        except Exception:
            pass  # Fall through to linear

    # Fallback: Linear regression
    return _linear_forecast(y, dates, horizon_days, current_price)


def _arima_forecast(y, dates, horizon_days, current_price):
    """ARIMA(p,d,q) forecasting with auto parameter selection."""
    n = len(y)

    # Auto-select ARIMA order based on data size
    if n >= 30:
        order = (2, 1, 2)  # ARIMA(2,1,2) for larger datasets
    elif n >= 15:
        order = (1, 1, 1)  # ARIMA(1,1,1) for medium datasets
    else:
        order = (1, 0, 1)  # ARIMA(1,0,1) for small datasets (no differencing)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = ARIMA(y, order=order)
        fitted = model.fit()

    # Generate forecasts
    forecast_result = fitted.get_forecast(steps=horizon_days)
    predicted = forecast_result.predicted_mean
    conf_int = forecast_result.conf_int(alpha=0.1)  # 90% confidence interval

    # Build prediction timeline
    predictions = []
    from datetime import datetime, timedelta
    try:
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
    except (ValueError, TypeError):
        last_date = datetime.now() - timedelta(days=1)

    for i in range(horizon_days):
        pred_date = last_date + timedelta(days=i + 1)
        pred_price = max(0, float(predicted.iloc[i])) if hasattr(predicted, 'iloc') else max(0, float(predicted[i]))
        lower = max(0, float(conf_int.iloc[i, 0])) if hasattr(conf_int, 'iloc') else max(0, float(conf_int[i, 0]))
        upper = float(conf_int.iloc[i, 1]) if hasattr(conf_int, 'iloc') else float(conf_int[i, 1])
        predictions.append({
            'date': pred_date.strftime('%Y-%m-%d'),
            'price': round(pred_price, 2),
            'lower': round(lower, 2),
            'upper': round(upper, 2),
        })

    # Extract key forecasts
    p7 = predictions[min(6, len(predictions) - 1)]['price']
    p14 = predictions[min(13, len(predictions) - 1)]['price']
    p30 = predictions[min(29, len(predictions) - 1)]['price']

    # Trend detection
    trend = _detect_trend(y, predictions)

    # R-squared from fitted model
    r_squared = float(fitted.rsquared) if hasattr(fitted, 'rsquared') else 0

    # Confidence based on model fit
    confidence = min(max(r_squared, 0), 1) * 0.7 + 0.3  # Boost slightly for ARIMA

    # Action recommendation
    action, reason = _recommend_action(current_price, p7, p14, confidence)

    return {
        'predictions': predictions,
        'trend': trend,
        'confidence': round(confidence, 3),
        'method': 'arima',
        'arima_order': order,
        'current_price': round(current_price, 2),
        'predicted_7': round(p7, 2),
        'predicted_14': round(p14, 2),
        'predicted_30': round(p30, 2),
        'r_squared': round(r_squared, 4),
        'action': action,
        'action_reason': reason,
    }


def _exp_smoothing_forecast(y, dates, horizon_days, current_price):
    """Exponential Smoothing (Holt-Winters) for trend + seasonality."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = ExponentialSmoothing(y, trend='add', seasonal=None)
        fitted = model.fit(optimized=True)

    predicted = fitted.forecast(horizon_days)

    # Build predictions (no confidence intervals for ES, estimate from residuals)
    residuals = y - fitted.fittedvalues
    std_err = float(np.std(residuals))

    predictions = []
    from datetime import datetime, timedelta
    try:
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
    except (ValueError, TypeError):
        last_date = datetime.now() - timedelta(days=1)

    for i in range(horizon_days):
        pred_date = last_date + timedelta(days=i + 1)
        pred_price = max(0, float(predicted.iloc[i])) if hasattr(predicted, 'iloc') else max(0, float(predicted[i]))
        # Wider confidence bands further out
        band = std_err * (1 + i * 0.1) * 1.645  # 90% CI
        predictions.append({
            'date': pred_date.strftime('%Y-%m-%d'),
            'price': round(pred_price, 2),
            'lower': round(max(0, pred_price - band), 2),
            'upper': round(pred_price + band, 2),
        })

    p7 = predictions[min(6, len(predictions) - 1)]['price']
    p14 = predictions[min(13, len(predictions) - 1)]['price']
    p30 = predictions[min(29, len(predictions) - 1)]['price']

    trend = _detect_trend(y, predictions)
    r_squared = float(1 - np.sum(residuals**2) / np.sum((y - np.mean(y))**2)) if np.sum((y - np.mean(y))**2) > 0 else 0
    confidence = min(max(r_squared, 0), 1) * 0.6 + 0.2

    action, reason = _recommend_action(current_price, p7, p14, confidence)

    return {
        'predictions': predictions,
        'trend': trend,
        'confidence': round(confidence, 3),
        'method': 'exponential_smoothing',
        'current_price': round(current_price, 2),
        'predicted_7': round(p7, 2),
        'predicted_14': round(p14, 2),
        'predicted_30': round(p30, 2),
        'r_squared': round(r_squared, 4),
        'action': action,
        'action_reason': reason,
    }


def _linear_forecast(y, dates, horizon_days, current_price):
    """Simple linear regression fallback."""
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)

    # Predictions
    predictions = []
    from datetime import datetime, timedelta
    try:
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
    except (ValueError, TypeError):
        last_date = datetime.now() - timedelta(days=1)

    std_err = float(np.std(y - (slope * x + intercept)))

    for i in range(horizon_days):
        pred_date = last_date + timedelta(days=i + 1)
        pred_price = max(0, float(intercept + slope * (len(y) + i)))
        band = std_err * (1 + i * 0.15) * 1.645
        predictions.append({
            'date': pred_date.strftime('%Y-%m-%d'),
            'price': round(pred_price, 2),
            'lower': round(max(0, pred_price - band), 2),
            'upper': round(pred_price + band, 2),
        })

    p7 = predictions[min(6, len(predictions) - 1)]['price']
    p14 = predictions[min(13, len(predictions) - 1)]['price']
    p30 = predictions[min(29, len(predictions) - 1)]['price']

    # R-squared
    y_pred = slope * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0

    trend = _detect_trend(y, predictions)
    confidence = min(max(r_squared, 0), 1) * 0.5  # Lower confidence for linear

    action, reason = _recommend_action(current_price, p7, p14, confidence)

    return {
        'predictions': predictions,
        'trend': trend,
        'confidence': round(confidence, 3),
        'method': 'linear',
        'current_price': round(current_price, 2),
        'predicted_7': round(p7, 2),
        'predicted_14': round(p14, 2),
        'predicted_30': round(p30, 2),
        'r_squared': round(r_squared, 4),
        'action': action,
        'action_reason': reason,
    }


def _detect_trend(y, predictions):
    """Detect overall trend from historical + predicted data."""
    if len(predictions) < 2:
        return 'stable'
    first_pred = predictions[0]['price']
    last_pred = predictions[-1]['price']
    current = float(y[-1])

    pct_change = ((last_pred - current) / current * 100) if current > 0 else 0
    if pct_change > 5:
        return 'rising'
    elif pct_change < -5:
        return 'falling'
    return 'stable'


def _recommend_action(current_price, p7, p14, confidence):
    """Recommend sell/hold/wait based on forecast."""
    if confidence < 0.2:
        return 'hold', 'Low confidence in forecast — monitor prices daily before deciding'

    pct_7 = ((p7 - current_price) / current_price * 100) if current_price > 0 else 0
    pct_14 = ((p14 - current_price) / current_price * 100) if current_price > 0 else 0

    if pct_7 < -5 and pct_14 < -5:
        return 'wait', f'Prices expected to drop {abs(pct_7):.1f}% in 7 days — store your harvest and wait for recovery'
    elif pct_7 > 5:
        return 'hold', f'Prices expected to rise {pct_7:.1f}% in 7 days — consider waiting for better prices'
    elif pct_7 > 0 and pct_14 < 0:
        return 'sell_now', f'Prices may rise short-term but drop in 14 days — sell within the next week'
    elif abs(pct_7) < 3 and abs(pct_14) < 3:
        return 'hold', 'Prices are stable — no urgency to sell, but no significant gains expected either'
    elif pct_7 > 0:
        return 'hold', f'Mild price increase of {pct_7:.1f}% expected — hold for slightly better prices'
    else:
        return 'sell_now', 'Current prices are favorable compared to the forecast — consider selling now'
