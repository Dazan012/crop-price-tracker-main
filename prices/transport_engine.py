"""
Tanzania Inter-Regional Transport Cost Engine

Implements Dijkstra's shortest path algorithm on the region graph
and dynamic cost calculation with multipliers.

Supports:
- Multi-hop routing (e.g., Kigoma → Tabora → Dodoma → Dar es Salaam)
- Fastest route (by time) and cheapest route (by cost)
- Dynamic pricing: base_rate × distance × tonnage × multipliers
- Region condition factors (remote areas cost more)
- Vehicle type multipliers
- Large cargo discounts
- Travel time estimation based on road type speeds
- ALL transport modes returned at once (truck, bus, motorcycle, pickup)
- Smart pricing layer (demand, popularity, per-mode adjustments)
"""

import heapq
import random
from collections import defaultdict


# ─────────────────────────────────────────────────────────────
# TRANSPORT MODES CONFIG
# Real-world Tanzania transport pricing (2024/2025 rates)
#
# Trucks/Semi-trucks: 170–200 TSH per 100kg cargo (weight-based)
#   → rate = midpoint 185 TSH per km per ton  (1.85 per km per kg)
# Bus: 2000–5000 TSH per 20kg parcel/package
#   → rate = midpoint 3500 per 20kg = 8.75 per km per kg-equivalent
# Motorcycle (Bodaboda pickup): 5000–6000 TSH per 25km
#   → rate = 220 TSH per km (flat, independent of cargo weight)
#   → last-mile pickup: farm ↔ terminal / terminal ↔ market (both ways)
# Pickup truck: versatile mid-range vehicle
# ─────────────────────────────────────────────────────────────

TRANSPORT_MODES = {
    'truck': {
        'speed': 50,
        'rate': 1.85,
        'display': 'Truck / Semi-Truck',
        'min_cost': 170,
        'max_cost': 200,
        'unit': 'per 100kg',
        'unit_kg': 100,
        'cost_type': 'weight',
    },
    'bus': {
        'speed': 65,
        'rate': 8.75,
        'display': 'Bus / Express Bus',
        'min_cost': 2000,
        'max_cost': 5000,
        'unit': 'per 20kg',
        'unit_kg': 20,
        'cost_type': 'weight',
    },
    'motorcycle': {
        'speed': 40,
        'rate': 220,   # base rate TSH/km (used for short distance ≤25km)
        'display': 'Motorcycle Pickup (Bodaboda)',
        'min_cost': 5000,
        'max_cost': 6000,
        'min_charge': 5000,    # Minimum charge for any trip
        'unit': 'per 25km',
        'unit_km': 25,
        'cost_type': 'distance',
        # Distance tiers: bodaboda is practical for short hauls,
        # increasingly impractical (and expensive) for long distances.
        # Tiers: (max_km, rate_per_km, display_label)
        'distance_tiers': [
            (25,  220, 'Mfupi (Short: 0–25km)'),
            (100, 300, 'Wastani (Medium: 25–100km)'),
            (300, 500, 'Mbali (Long: 100–300km)'),
            (999999, 800, 'Mbali Sana (Very Long: 300km+)'),
        ],
    },
    'pickup': {
        'speed': 70,
        'rate': 3.0,
        'display': 'Pickup Truck',
        'min_cost': 2000,
        'max_cost': 8000,
        'unit': 'per 100kg',
        'unit_kg': 100,
        'cost_type': 'weight',
    },
}

# ─────────────────────────────────────────────────────────────
# DESTINATION TYPES (Aina ya Safari)
# Different transport scenarios use different stages and modes
# ─────────────────────────────────────────────────────────────

DESTINATION_TYPES = {
    'region_to_region': {
        'display': 'Mkoa hadi Mkoa (Region to Region)',
        'description': 'Inter-regional transport on main road network',
        'stages': ['road_transport'],
        'default_farm_leg': False,
        'default_motorcycle_pickup': False,
        'suitable_modes': ['truck', 'bus', 'pickup'],
        'icon': 'map',
    },
    'shamba_to_road': {
        'display': 'Shamba hadi Barabara (Farm to Road)',
        'description': 'First-leg transport from farm to nearest vehicle-accessible road',
        'stages': ['farm_leg', 'loading'],
        'default_farm_leg': True,
        'default_motorcycle_pickup': False,
        'suitable_modes': ['punda', 'toyo', 'binadamu'],
        'icon': 'sprout',
    },
    'shamba_to_warehouse': {
        'display': 'Shamba hadi Ghala (Farm to Warehouse)',
        'description': 'Full journey: farm to road, then road to storage facility',
        'stages': ['farm_leg', 'loading', 'road_transport', 'unloading'],
        'default_farm_leg': True,
        'default_motorcycle_pickup': False,
        'suitable_modes': ['truck', 'pickup', 'punda'],
        'icon': 'warehouse',
    },
    'road_to_market': {
        'display': 'Barabara hadi Soko (Road to Market)',
        'description': 'Last-mile from terminal/bus stop to market — motorcycle or pickup',
        'stages': ['road_transport', 'motorcycle_pickup'],
        'default_farm_leg': False,
        'default_motorcycle_pickup': True,
        'suitable_modes': ['motorcycle', 'pickup'],
        'icon': 'store',
    },
    'shamba_to_market': {
        'display': 'Shamba hadi Soko (Farm to Market — Full Journey)',
        'description': 'Complete transport chain: farm → road → market with all stages',
        'stages': ['farm_leg', 'loading', 'road_transport', 'unloading', 'motorcycle_pickup'],
        'default_farm_leg': True,
        'default_motorcycle_pickup': True,
        'suitable_modes': ['truck', 'bus', 'pickup', 'motorcycle', 'punda', 'toyo'],
        'icon': 'route',
    },
}

# Road condition → time multiplier (spec: good=1.0, average=1.15, poor=1.3)
ROAD_CONDITION_FACTORS = {
    'good':    1.0,
    'average': 1.15,
    'poor':    1.3,
}

# ─────────────────────────────────────────────────────────────
# SMART PRICING CONFIG
# ─────────────────────────────────────────────────────────────

# Demand-based adjustment: estimated from route corridor traffic
HIGH_DEMAND_CORRIDORS = {'northern', 'central', 'southern'}   # major trade routes
LOW_DEMAND_CORRIDORS = {'western', 'none'}                    # remote routes

# Per-mode popularity adjustment (cheaper for bulk, expensive for small)
MODE_POPULARITY = {
    'truck':      -0.05,   # popular/bulk → 5% cheaper
    'bus':         0.0,    # neutral
    'pickup':      0.05,   # somewhat rare → 5% more
    'motorcycle':  0.10,   # most expensive per kg → 10% more
}


# ─────────────────────────────────────────────────────────────
# TERRAIN / ENVIRONMENT FACTORS (Mazingira)
# From field interviews: terrain type significantly affects
# transport difficulty, fuel consumption, and vehicle wear
# ─────────────────────────────────────────────────────────────

TERRAIN_FACTORS = {
    'tambarare': {'factor': 1.0,  'display': 'Tambarare (Plain / Flat)',     'description': 'Flat land, easy transport'},
    'milima':    {'factor': 1.35, 'display': 'Milima (Mountain / Hills)',     'description': 'Steep slopes, higher fuel consumption, slower'},
    'mito':      {'factor': 1.20, 'display': 'Mito (River areas)',            'description': 'River crossings, bridge delays, flood risk'},
    'mabonde':   {'factor': 1.15, 'display': 'Mabonde (Valleys)',             'description': 'Low-lying valleys, muddy in rain, steep climbs out'},
}


# ─────────────────────────────────────────────────────────────
# SEASON FACTORS (Msimu)
# mvua = rainy season (March–May, Nov–Dec in Tanzania)
# jua  = dry/sunny season (June–October, Jan–Feb)
# ─────────────────────────────────────────────────────────────

SEASON_FACTORS = {
    'mvua': {'factor': 1.25, 'display': 'Msimu wa Mvua (Rainy Season)', 'description': 'Heavy rain: flooded roads, mud, slower travel, vehicle stuck risk'},
    'jua':  {'factor': 1.0,  'display': 'Msimu wa Jua (Dry Season)',    'description': 'Dry roads, normal transport conditions'},
}


# ─────────────────────────────────────────────────────────────
# SOIL TYPES (Aina ya Udongo) + Season Interaction
# Clay soil (mfinyanzi) becomes extremely slippery in rain
# Sandy soil (mchanga) is easier year-round
# ─────────────────────────────────────────────────────────────

SOIL_TYPES = {
    'mfinyanzi': {
        'display': 'Udongo wa Mfinyanzi (Clay)',
        'season_factor': {
            'mvua': 1.40,   # clay + rain = very slippery, almost impassable for vehicles
            'jua':  1.0,    # dry clay is firm and passable
        },
    },
    'mchanga': {
        'display': 'Udongo wa Mchanga (Sandy)',
        'season_factor': {
            'mvua': 1.10,   # sand + rain = slightly firmer, minor impact
            'jua':  1.0,    # normal sandy conditions
        },
    },
    'loam': {
        'display': 'Udongo wa Loam (Mixed / Average)',
        'season_factor': {
            'mvua': 1.20,   # moderate impact from rain
            'jua':  1.0,
        },
    },
}


# ─────────────────────────────────────────────────────────────
# FUEL PRICE CONFIG (Bei ya Mafuta)
# Diesel price in TSH per liter — directly affects transport cost
# When fuel prices rise, transport cost rises proportionally
# Reference consumption: truck ~30L/100km, pickup ~15L/100km
# ─────────────────────────────────────────────────────────────

FUEL_PRICE_CONFIG = {
    'baseline_tsh_per_liter': 3200,    # Reference diesel price (Tanzania avg ~2025)
    'min_price': 2500,                 # Floor price
    'max_price': 5000,                 # Ceiling for calculation
    'consumption_liters_per_100km': {
        'truck': 30,
        'bus': 25,
        'pickup': 15,
        'motorcycle': 3,
    },
}


def get_actual_season(region_name=None):
    """
    Determine the current season based on actual weather data.

    Queries WeatherData for the given region (or uses Tanzania-average)
    to determine if we're in rainy (mvua) or dry (jua) season.

    Returns:
        dict with 'season' key: 'mvua' or 'jua', plus supporting data
    """
    try:
        from prices.models import WeatherData, Region
        from django.utils import timezone

        today = timezone.now().date()
        month = today.month

        if region_name:
            try:
                region = Region.objects.get(name__iexact=region_name)
            except Region.DoesNotExist:
                region = None
        else:
            region = None

        if region:
            recent = WeatherData.objects.filter(
                region=region,
                date__gte=today - timedelta(days=14),
            ).order_by('-date')[:14]

            if recent.count() >= 3:
                total_precip = sum(float(r.precipitation or 0) for r in recent)
                days_with_rain = sum(1 for r in recent if float(r.precipitation or 0) > 1)
                avg_humidity = sum(float(r.humidity or 50) for r in recent) / len(recent)

                if total_precip > 60 or days_with_rain >= len(recent) * 0.4 or avg_humidity > 75:
                    return {
                        'season': 'mvua',
                        'source': 'weather_data',
                        'total_precip_14d': round(total_precip, 1),
                        'rain_days_14d': days_with_rain,
                        'avg_humidity': round(avg_humidity, 1),
                        'month': month,
                    }

        long_rains = month in (3, 4, 5)
        short_rains = month in (11, 12)
        is_rainy = long_rains or short_rains

        return {
            'season': 'mvua' if is_rainy else 'jua',
            'source': 'calendar',
            'month': month,
        }
    except Exception:
        month = timezone.now().month
        long_rains = month in (3, 4, 5)
        short_rains = month in (11, 12)
        return {
            'season': 'mvua' if (long_rains or short_rains) else 'jua',
            'source': 'fallback',
            'month': month,
        }


def get_fuel_factor(fuel_price_tsh):
    """
    Compute fuel price multiplier relative to baseline.

    If diesel is 3200 TSH/L (baseline) → factor = 1.0
    If diesel is 4000 TSH/L → factor = 4000/3200 = 1.25 (25% more)
    If diesel is 2800 TSH/L → factor = 2800/3200 = 0.875 (12.5% less)

    Clamped to [0.7, 1.8] to prevent extreme swings.
    """
    if fuel_price_tsh is None or fuel_price_tsh <= 0:
        return 1.0
    baseline = FUEL_PRICE_CONFIG['baseline_tsh_per_liter']
    factor = fuel_price_tsh / baseline
    return max(0.7, min(1.8, factor))


# ─────────────────────────────────────────────────────────────
# FARM-TO-ROAD FIRST-LEG MODES (Shamba → Barabara)
# Vehicles & motorcycles often cannot reach inside farms.
# Farmers use animals, handcarts, or human labor to move
# produce from shamba (farm) to the nearest road.
#
# Pricing from field interviews:
#   Punda (donkey) with mkoteni/tololi: 3000–5000 TSH per gunia (100kg)
#   Toyo (handcart): ~3000 TSH per gunia per trip
#   Binadamu (human porter): 1000–2000 TSH per gunia
# ─────────────────────────────────────────────────────────────

FARM_STAGE_MODES = {
    'punda': {
        'display': 'Punda na Mkoteni / Tololi (Donkey Cart)',
        'cost_per_gunia_min': 3000,
        'cost_per_gunia_max': 5000,
        'cost_per_gunia_mid': 4000,
        'gunia_kg': 100,
        'speed_kmh': 4,
        'max_load_gunia': 3,
        'description': 'Donkey with saddle bags — most common for remote farms',
    },
    'toyo': {
        'display': 'Toyo (Handcart / Wheelbarrow)',
        'cost_per_gunia_min': 2500,
        'cost_per_gunia_max': 4000,
        'cost_per_gunia_mid': 3000,
        'gunia_kg': 100,
        'speed_kmh': 3,
        'max_load_gunia': 4,
        'description': 'Human-pushed handcart — used on wider farm paths',
    },
    'binadamu': {
        'display': 'Binadamu (Human Porter / Kichwani)',
        'cost_per_gunia_min': 1000,
        'cost_per_gunia_max': 2000,
        'cost_per_gunia_mid': 1500,
        'gunia_kg': 100,
        'speed_kmh': 3,
        'max_load_gunia': 2,
        'description': 'Head-carrying or backpack — last resort, narrow paths only',
    },
}


# ─────────────────────────────────────────────────────────────
# LOADING & UNLOADING COSTS (Kupakia na Kupakua)
# At every stage transition, labor costs are incurred:
#   Farm → road:  load produce onto donkey/toyo, then onto vehicle
#   Road → market: unload vehicle, carry into market stalls
# ─────────────────────────────────────────────────────────────

LOADING_UNLOADING = {
    'kupakia': {
        'display': 'Kupakia (Loading)',
        'cost_per_gunia': 500,          # TSH per 100kg bag — manual labor
        'cost_per_ton': 5000,           # TSH per 1000kg — mechanical/equipment
        'description': 'Loading produce onto transport at origin',
    },
    'kupakua': {
        'display': 'Kupakua (Unloading)',
        'cost_per_gunia': 500,
        'cost_per_ton': 5000,
        'description': 'Unloading produce at destination',
    },
}


# ─────────────────────────────────────────────────────────────
# TRIP-BASED PRICING (Malipo kwa Trip)
# From field interviews: some operators charge per trip,
# NOT per gunia. They have a minimum load per trip and a
# flat cost regardless of exact weight above minimum.
#
# Example: Piki piki driver charges 3000–5000 TSH per trip,
# but won't carry less than 2 gunia (200kg) per trip.
# If farmer has 5 gunia → 3 trips needed (ceil(5/2) = 3).
#
# This model applies to:
#   - Piki piki (motorcycle) for farm→road or last-mile
#   - Punda na tololi for farm→road (larger cart trips)
#   - Toyo for farm→road (handcart trips)
# ─────────────────────────────────────────────────────────────

TRIP_BASED_PRICING = {
    'piki_piki': {
        'display': 'Piki Piki (Motorcycle — per trip)',
        'cost_per_trip_min': 3000,
        'cost_per_trip_max': 5000,
        'cost_per_trip_mid': 4000,
        'min_gunia_per_trip': 2,       # won't carry less than 2 gunia
        'max_gunia_per_trip': 3,       # max load per trip (balance/safety)
        'gunia_kg': 100,
        'description': 'Motorcycle charges per trip — minimum 2 gunia (200kg) per trip',
    },
    'punda_tololi': {
        'display': 'Punda na Tololi (Donkey Cart — per trip)',
        'cost_per_trip_min': 3000,
        'cost_per_trip_max': 5000,
        'cost_per_trip_mid': 4000,
        'min_gunia_per_trip': 2,
        'max_gunia_per_trip': 3,       # donkey can pull ~300kg on tololi
        'gunia_kg': 100,
        'description': 'Donkey cart per trip — common on wider farm roads',
    },
    'toyo_trip': {
        'display': 'Toyo (Handcart — per trip)',
        'cost_per_trip_min': 2000,
        'cost_per_trip_max': 3500,
        'cost_per_trip_mid': 3000,
        'min_gunia_per_trip': 1,
        'max_gunia_per_trip': 4,       # handcart can push ~400kg
        'gunia_kg': 100,
        'description': 'Handcart per trip — operator charges per round trip',
    },
}


def calculate_trip_cost(gunia_count, trip_mode='piki_piki', environment_factor=1.0):
    """
    Calculate transport cost using per-trip pricing model.

    Some operators charge per trip with a minimum load, not per gunia.
    This computes how many trips are needed and the total cost.

    Args:
        gunia_count: number of gunia (bags, each ~100kg) to transport
        trip_mode: key from TRIP_BASED_PRICING ('piki_piki', 'punda_tololi', 'toyo_trip')
        environment_factor: multiplier for terrain/season/soil conditions

    Returns:
        dict with trips needed, cost range, cost midpoint, and cost per gunia
    """
    cfg = TRIP_BASED_PRICING.get(trip_mode, TRIP_BASED_PRICING['piki_piki'])
    max_per_trip = cfg['max_gunia_per_trip']

    # Trips needed (ceiling division)
    trips_needed = max(1, -(-gunia_count // max_per_trip))

    # Cost per trip adjusted for environment
    trip_cost_min = cfg['cost_per_trip_min'] * environment_factor
    trip_cost_max = cfg['cost_per_trip_max'] * environment_factor
    trip_cost_mid = cfg['cost_per_trip_mid'] * environment_factor

    # Total cost
    total_min = round(trips_needed * trip_cost_min / 100) * 100
    total_max = round(trips_needed * trip_cost_max / 100) * 100
    total_mid = round(trips_needed * trip_cost_mid / 100) * 100

    # Cost per gunia (for comparison with per-gunia pricing)
    per_gunia_mid = round(total_mid / max(gunia_count, 1), 0) if gunia_count > 0 else total_mid

    return {
        'mode': trip_mode,
        'display': cfg['display'],
        'description': cfg['description'],
        'gunia_count': gunia_count,
        'max_gunia_per_trip': max_per_trip,
        'min_gunia_per_trip': cfg['min_gunia_per_trip'],
        'trips_needed': trips_needed,
        'cost_per_trip': {
            'min': round(trip_cost_min / 100) * 100,
            'max': round(trip_cost_max / 100) * 100,
            'mid': round(trip_cost_mid / 100) * 100,
        },
        'total_cost_min': int(total_min),
        'total_cost_max': int(total_max),
        'total_cost': int(total_mid),
        'cost_per_gunia': int(per_gunia_mid),
        'environment_factor': round(environment_factor, 2),
    }


def build_graph(routes):
    """
    Build an adjacency list graph from RegionRoute queryset.

    Args:
        routes: QuerySet of RegionRoute objects

    Returns:
        graph: dict of {region_id: [(neighbor_id, distance_km, route_obj), ...]}
    """
    graph = defaultdict(list)
    for route in routes:
        graph[route.from_region_id].append({
            'to': route.to_region_id,
            'distance': route.distance_km,
            'road_type': route.road_type,
            'condition': route.condition_factor,
            'speed': route.avg_speed_kmh,
            'corridor': route.corridor,
            'road_condition': route.road_condition,
            'route_id': route.id,
        })
        if route.is_bidirectional:
            graph[route.to_region_id].append({
                'to': route.from_region_id,
                'distance': route.distance_km,
                'road_type': route.road_type,
                'condition': route.condition_factor,
                'speed': route.avg_speed_kmh,
                'corridor': route.corridor,
                'road_condition': route.road_condition,
                'route_id': route.id,
            })
    return graph


def dijkstra(graph, start_id, end_id, weight='distance'):
    """
    Dijkstra's shortest path algorithm.

    Args:
        graph: adjacency list from build_graph()
        start_id: origin region ID
        end_id: destination region ID
        weight: 'distance' for shortest route, 'time' for fastest route

    Returns:
        (total_weight, path_ids, path_edges) or (None, [], []) if no path
    """
    if start_id == end_id:
        return (0, [start_id], [])

    # Priority queue: (cumulative_weight, region_id, path, edges)
    pq = [(0, start_id, [start_id], [])]
    visited = set()

    while pq:
        cum_weight, current, path, edges = heapq.heappop(pq)

        if current in visited:
            continue
        visited.add(current)

        if current == end_id:
            return (cum_weight, path, edges)

        for edge in graph.get(current, []):
            neighbor = edge['to']
            if neighbor in visited:
                continue

            if weight == 'time':
                # Weight = time in hours
                edge_weight = edge['distance'] / max(edge['speed'], 1)
            else:
                # Weight = distance in km
                edge_weight = edge['distance']

            new_weight = cum_weight + edge_weight
            heapq.heappush(pq, (
                new_weight,
                neighbor,
                path + [neighbor],
                edges + [edge],
            ))

    return (None, [], [])


# ─────────────────────────────────────────────────────────────
# REGION FACTORS — remote regions cost more to transport to/from
# ─────────────────────────────────────────────────────────────

REGION_FACTORS = {
    # Major hubs — lowest cost
    'Dar Es Salaam': 1.0,
    'Dodoma': 1.0,
    'Arusha': 1.0,
    'Mwanza': 1.0,
    'Mbeya': 1.0,
    'Tanga': 1.0,
    'Morogoro': 1.0,

    # Medium — slightly higher
    'Kilimanjaro': 1.05,
    'Iringa': 1.05,
    'Tabora': 1.05,
    'Pwani': 1.05,
    'Mara': 1.05,
    'Shinyanga': 1.05,
    'Singida': 1.05,
    'Lindi': 1.05,
    'Mtwara': 1.05,

    # Remote — highest cost
    'Kigoma': 1.2,
    'Rukwa': 1.3,
    'Katavi': 1.3,
    'Njombe': 1.15,
    'Songwe': 1.1,
    'Geita': 1.1,
    'Simiyu': 1.1,
    'Manyara': 1.05,
    'Ruvuma': 1.1,
}


def get_region_factor(region_name):
    """Get the transport cost factor for a region."""
    return REGION_FACTORS.get(region_name, 1.1)


def calculate_transport_cost(path_edges, weight_kg, pricing_rule, origin_name, dest_name):
    """
    Calculate the total transport cost for a route.

    Formula:
        base_cost = total_distance × base_rate_per_km × (weight_kg / 1000)
        final_cost = base_cost × condition_factor × region_factor × vehicle_multiplier × fuel_multiplier

    Args:
        path_edges: list of edge dicts from dijkstra()
        weight_kg: cargo weight in kg
        pricing_rule: PricingRule model instance
        origin_name: origin region name
        dest_name: destination region name

    Returns:
        dict with cost breakdown
    """
    if not path_edges:
        return None

    total_distance = sum(e['distance'] for e in path_edges)
    total_time_hours = sum(e['distance'] / max(e['speed'], 1) for e in path_edges)

    # Average condition factor across all edges
    avg_condition = sum(e['condition'] for e in path_edges) / len(path_edges)

    # Region factor — max of origin and destination
    region_factor = max(get_region_factor(origin_name), get_region_factor(dest_name))

    # Base cost: rate per km per ton × distance × tons
    tons = weight_kg / 1000.0
    base_cost = total_distance * pricing_rule.base_rate_per_km * tons

    # Apply multipliers
    cost = base_cost * avg_condition * region_factor * pricing_rule.vehicle_multiplier * pricing_rule.fuel_multiplier

    # Large cargo discount
    if weight_kg > pricing_rule.large_cargo_threshold_kg:
        cost *= pricing_rule.large_cargo_discount

    # Minimum charge
    cost = max(cost, pricing_rule.min_charge)

    # Build breakdown
    return {
        'total_distance_km': round(total_distance, 1),
        'estimated_time_hours': round(total_time_hours, 1),
        'estimated_time_display': _format_time(total_time_hours),
        'base_cost': round(base_cost, 0),
        'final_cost': round(cost, 0),
        'cost_per_kg': round(cost / max(weight_kg, 1), 2),
        'breakdown': {
            'base_rate_per_km': pricing_rule.base_rate_per_km,
            'tonnage': round(tons, 2),
            'condition_factor': round(avg_condition, 2),
            'region_factor': round(region_factor, 2),
            'vehicle_multiplier': pricing_rule.vehicle_multiplier,
            'fuel_multiplier': pricing_rule.fuel_multiplier,
            'large_cargo_discount': pricing_rule.large_cargo_discount if weight_kg > pricing_rule.large_cargo_threshold_kg else 1.0,
        },
        'road_types': list(set(e['road_type'] for e in path_edges)),
        'corridors': list(set(e['corridor'] for e in path_edges if e['corridor'] != 'none')),
    }


def _format_time(hours):
    """Format hours into human-readable string."""
    if hours < 1:
        return f"{int(hours * 60)} min"
    h = int(hours)
    m = int((hours - h) * 60)
    if h >= 24:
        days = h // 24
        remaining_h = h % 24
        return f"{days}d {remaining_h}h" if remaining_h else f"{days}d"
    return f"{h}h {m}min" if m else f"{h}h"


def find_routes(graph, start_id, end_id, region_names):
    """
    Find both fastest and cheapest routes.

    Args:
        graph: adjacency list from build_graph()
        start_id: origin region ID
        end_id: destination region ID
        region_names: dict of {region_id: region_name}

    Returns:
        dict with 'fastest' and 'cheapest' route info
    """
    # Cheapest route (by distance)
    dist_weight, dist_path, dist_edges = dijkstra(graph, start_id, end_id, weight='distance')

    # Fastest route (by time)
    time_weight, time_path, time_edges = dijkstra(graph, start_id, end_id, weight='time')

    result = {}

    if dist_path:
        result['cheapest'] = {
            'route': [region_names.get(rid, str(rid)) for rid in dist_path],
            'route_ids': dist_path,
            'total_distance_km': round(dist_weight, 1) if dist_weight else None,
            'edges': dist_edges,
        }

    if time_path:
        result['fastest'] = {
            'route': [region_names.get(rid, str(rid)) for rid in time_path],
            'route_ids': time_path,
            'total_time_hours': round(time_weight, 1) if time_weight else None,
            'edges': time_edges,
        }

    return result


# ─────────────────────────────────────────────────────────────
# NEW: FULL LOGISTICS ENGINE — all modes at once
# ─────────────────────────────────────────────────────────────

def _format_time_hm(hours):
    """Format hours as 'Xh Ym' string."""
    if hours < 1:
        return f"{int(hours * 60)}m"
    h = int(hours)
    m = int((hours - h) * 60)
    if h >= 24:
        days = h // 24
        remaining_h = h % 24
        return f"{days}d {remaining_h}h" if remaining_h else f"{days}d"
    return f"{h}h {m:02d}m" if m else f"{h}h 00m"


def _get_demand_factor(corridors):
    """Return smart-pricing demand adjustment based on corridors used."""
    corridor_set = set(corridors)
    if corridor_set & HIGH_DEMAND_CORRIDORS:
        return random.uniform(0.10, 0.20)    # +10% to +20%
    elif corridor_set & LOW_DEMAND_CORRIDORS:
        return random.uniform(-0.10, -0.05)  # -5% to -10%
    return 0.0


def _get_road_condition_from_edges(edges):
    """Determine overall road condition from path edges.
    Uses the worst condition found along the route."""
    worst = 'good'
    severity = {'good': 0, 'average': 1, 'poor': 2}
    for edge in edges:
        rc = edge.get('road_condition', 'good')
        if severity.get(rc, 0) > severity.get(worst, 0):
            worst = rc
    return worst


def calculate_all_modes(graph, start_id, end_id, region_names, weight_kg=1000,
                        terrain='tambarare', season='jua', soil_type='loam',
                        fuel_price_tsh=None):
    """
    Unified logistics function: find shortest path, then compute time + cost
    for ALL transport modes (truck, bus, motorcycle, pickup).

    Applies:
      - Dijkstra shortest path
      - Road condition time multiplier (good=1.0, average=1.15, poor=1.3)
      - Traffic factor +/-10-20%
      - Cargo delay +1 hour for goods
      - Weight scaling: >1000kg +10%, >5000kg +20%
      - Fuel price factor (based on current diesel price vs baseline)
      - Terrain factor (milima/mito/tambarare/mabonde)
      - Season factor (mvua/jua) × soil type interaction (mfinyanzi slippery in rain)
      - Poor road condition cost surcharge +10-25%
      - Smart pricing: demand, popularity, per-mode

    Args:
        graph: adjacency list from build_graph()
        start_id: origin region ID
        end_id: destination region ID
        region_names: dict of {region_id: region_name}
        weight_kg: cargo weight in kg (default 1000)
        terrain: one of 'tambarare', 'milima', 'mito', 'mabonde'
        season: one of 'mvua', 'jua'
        soil_type: one of 'mfinyanzi', 'mchanga', 'loam'
        fuel_price_tsh: current diesel price in TSH/liter (None = baseline)

    Returns dict matching the spec response structure:
    {
        route: ["Dar es Salaam", "Dodoma", "Arusha"],
        distance_km: 650,
        results: {
            truck:      { time: "13h 30m", cost: 780000, ... },
            ...
        }
    }
    """
    # 1. Dijkstra shortest path
    total_distance, path_ids, path_edges = dijkstra(graph, start_id, end_id, weight='distance')

    if not path_edges:
        return None

    # 2. Sum total distance
    total_distance = sum(e['distance'] for e in path_edges)
    route_names = [region_names.get(rid, str(rid)) for rid in path_ids]
    corridors = list(set(
        e.get('corridor', 'none') for e in path_edges if e.get('corridor', 'none') != 'none'
    ))

    # 3. Determine road condition (worst segment along route)
    overall_condition = _get_road_condition_from_edges(path_edges)
    condition_factor = ROAD_CONDITION_FACTORS.get(overall_condition, 1.0)

    # Traffic factor: +/-10-20% (randomized per call)
    traffic_factor = 1.0 + random.uniform(-0.20, 0.20)

    # Cargo delay: +1 hour base for goods transport
    cargo_delay_hours = 1.0

    # Weight scaling on cost
    if weight_kg > 5000:
        weight_scale = 1.20
    elif weight_kg > 1000:
        weight_scale = 1.10
    else:
        weight_scale = 1.0

    # ── NEW: Environment & fuel factors ──

    # Terrain factor (mazingira)
    terrain_cfg = TERRAIN_FACTORS.get(terrain, TERRAIN_FACTORS['tambarare'])
    terrain_factor = terrain_cfg['factor']

    # Season factor (msimu)
    season_cfg = SEASON_FACTORS.get(season, SEASON_FACTORS['jua'])
    season_factor = season_cfg['factor']

    # Soil × season interaction (udongo + msimu)
    soil_cfg = SOIL_TYPES.get(soil_type, SOIL_TYPES['loam'])
    soil_season_factor = soil_cfg['season_factor'].get(season, 1.0)

    # Fuel price factor (bei ya mafuta)
    fuel_factor = get_fuel_factor(fuel_price_tsh)

    # Combined environment multiplier
    environment_factor = terrain_factor * season_factor * soil_season_factor

    # Poor road surcharge on cost
    if overall_condition == 'poor':
        poor_road_surcharge = 1.0 + random.uniform(0.10, 0.25)
    elif overall_condition == 'average':
        poor_road_surcharge = 1.0 + random.uniform(0.0, 0.10)
    else:
        poor_road_surcharge = 1.0

    # Smart pricing: demand adjustment
    demand_factor = _get_demand_factor(corridors)

    # 4+5. Compute time + cost for each mode
    results = {}
    for mode_key, mode_cfg in TRANSPORT_MODES.items():
        speed = mode_cfg['speed']       # km/h
        rate = mode_cfg['rate']         # TSH per km per kg (weight modes) or TSH per km (distance mode)
        cost_type = mode_cfg.get('cost_type', 'weight')

        # Time: base_time = distance / speed, x condition, x traffic, + cargo delay
        # Terrain slows vehicles (milima = slower), season affects speed
        time_environment_factor = terrain_factor * (season_factor if season == 'mvua' else 1.0)
        base_time = total_distance / max(speed, 1)
        total_time = (base_time * condition_factor * traffic_factor * time_environment_factor) + cargo_delay_hours

        # Cost calculation differs by mode type
        if cost_type == 'distance':
            # Motorcycle/bodaboda: distance-tiered pricing
            # Short (<=25km): flat 5000-6000 TSH per 25km
            # Medium (25-100km): 300 TSH/km (within district)
            # Long (100-300km): 500 TSH/km (inter-district, uncommon for cargo)
            # Very long (>300km): 800 TSH/km (inter-regional, impractical for cargo)
            tiers = mode_cfg.get('distance_tiers', [])
            tier_label = 'Mfupi (Short)'
            if tiers:
                for max_km, tier_rate, label in tiers:
                    if total_distance <= max_km:
                        base_cost = total_distance * tier_rate
                        tier_label = label
                        break
                else:
                    # Beyond all tiers — use last tier
                    last_max, last_rate, last_label = tiers[-1]
                    base_cost = total_distance * last_rate
                    tier_label = last_label
            else:
                base_cost = total_distance * rate

            # Enforce minimum charge
            min_charge = mode_cfg.get('min_charge', 0)
            if base_cost < min_charge:
                base_cost = min_charge
        else:
            # Weight-based: truck, bus, pickup
            # Formula: distance_km × weight_kg × rate_per_km_per_kg
            base_cost = total_distance * weight_kg * rate

        # Apply all multipliers: weight scaling, fuel price, environment, poor-road surcharge
        cost = base_cost * weight_scale * fuel_factor * environment_factor * poor_road_surcharge
        # Smart pricing: demand + mode popularity
        smart_adj = 1.0 + demand_factor + MODE_POPULARITY.get(mode_key, 0)
        cost = cost * smart_adj
        # Round to nearest 100 TZS
        cost = round(cost / 100) * 100

        mode_result = {
            'time': _format_time_hm(total_time),
            'cost': int(cost),
            'time_hours': round(total_time, 2),
            'cost_raw': int(cost),
            'display': mode_cfg['display'],
            'unit': mode_cfg.get('unit', ''),
            'cost_type': cost_type,
        }

        # Add distance tier info for tiered modes (motorcycle/bodaboda)
        if cost_type == 'distance' and 'distance_tiers' in mode_cfg:
            mode_result['distance_tier'] = tier_label

        # Motorcycle pickup: add both-ways option (farm ↔ terminal / terminal ↔ market)
        if cost_type == 'distance':
            both_ways_cost = int(round(cost * 2 / 100) * 100)
            mode_result['both_ways_cost'] = both_ways_cost
            mode_result['both_ways_display'] = 'Farm ↔ Terminal (round trip)'

        results[mode_key] = mode_result

    # 6. Return structured result
    return {
        'route': route_names,
        'distance_km': round(total_distance, 1),
        'results': results,
        'road_condition': overall_condition,
        'traffic_factor': round(traffic_factor, 3),
        'weight_kg': weight_kg,
        'weight_scale': weight_scale,
        'corridors': corridors,
        # Environment & fuel factors for frontend display
        'terrain': terrain,
        'terrain_display': terrain_cfg['display'],
        'terrain_factor': round(terrain_factor, 2),
        'season': season,
        'season_display': season_cfg['display'],
        'season_factor': round(season_factor, 2),
        'soil_type': soil_type,
        'soil_display': soil_cfg['display'],
        'soil_season_factor': round(soil_season_factor, 2),
        'fuel_price_tsh': fuel_price_tsh or FUEL_PRICE_CONFIG['baseline_tsh_per_liter'],
        'fuel_factor': round(fuel_factor, 3),
        'environment_factor': round(environment_factor, 3),
    }


# ─────────────────────────────────────────────────────────────
# MULTI-STAGE TRANSPORT CALCULATOR (Safari Kamili)
# Full journey breakdown based on field interviews:
#
#   Stage 1: Shamba → Barabara  (farm to nearest road)
#     → punda na mkoteni/tololi, toyo, or binadamu
#     → vehicles cannot reach inside most farms
#
#   Stage 2: Kupakia (Loading at road)
#     → manual or mechanical loading onto vehicle
#
#   Stage 3: Barabara (Main road transport)
#     → truck, bus, pickup, motorcycle
#     → covers inter-regional distance
#
#   Stage 4: Kupakua (Unloading at destination)
#     → unload at market or terminal
#
#   Stage 5 (optional): Piki / Motorcycle pickup
#     → last-mile from terminal to final market
#     → works both ways: farm→terminal AND terminal→market
#
# ─────────────────────────────────────────────────────────────

def calculate_multi_stage_transport(graph, start_id, end_id, region_names,
                                    weight_kg=1000,
                                    farm_to_road_km=3.0,
                                    farm_mode='punda',
                                    terrain='tambarare',
                                    season='jua',
                                    soil_type='loam',
                                    fuel_price_tsh=None,
                                    needs_motorcycle_pickup=True):
    """
    Full multi-stage transport cost from farm to market.

    Args:
        graph: adjacency list from build_graph()
        start_id: origin region ID (nearest road point to farm)
        end_id: destination region ID (market region)
        region_names: dict of {region_id: region_name}
        weight_kg: total cargo weight in kg
        farm_to_road_km: distance from farm (shamba) to nearest road in km
        farm_mode: first-leg transport — 'punda', 'toyo', or 'binadamu'
        terrain: 'tambarare', 'milima', 'mito', 'mabonde'
        season: 'mvua' or 'jua'
        soil_type: 'mfinyanzi', 'mchanga', 'loam'
        fuel_price_tsh: current diesel price TSH/liter
        needs_motorcycle_pickup: whether last-mile motorcycle is needed at destination

    Returns:
        dict with stage-by-stage cost breakdown and grand total
    """
    # ── Environment factors ──
    terrain_cfg = TERRAIN_FACTORS.get(terrain, TERRAIN_FACTORS['tambarare'])
    terrain_factor = terrain_cfg['factor']
    season_cfg = SEASON_FACTORS.get(season, SEASON_FACTORS['jua'])
    season_factor = season_cfg['factor']
    soil_cfg = SOIL_TYPES.get(soil_type, SOIL_TYPES['loam'])
    soil_season_factor = soil_cfg['season_factor'].get(season, 1.0)
    fuel_factor = get_fuel_factor(fuel_price_tsh)
    environment_factor = terrain_factor * season_factor * soil_season_factor

    # Gunia (bags) calculation — 1 gunia = 100kg
    gunia_count = max(1, -(-weight_kg // 100))  # ceiling division
    tons = weight_kg / 1000.0

    stages = []
    grand_total = 0
    total_time_hours = 0

    # ══════════ STAGE 1: Shamba → Barabara (Farm to Road) ══════════
    farm_cfg = FARM_STAGE_MODES.get(farm_mode, FARM_STAGE_MODES['punda'])

    # Cost: per-gunia rate × number of gunia × environment factor
    # Clay soil in rain makes farm paths extremely muddy → higher cost
    farm_soil_season = soil_cfg['season_factor'].get(season, 1.0)
    farm_env_factor = terrain_factor * season_factor * farm_soil_season

    farm_cost_min = farm_cfg['cost_per_gunia_min'] * gunia_count * farm_env_factor
    farm_cost_max = farm_cfg['cost_per_gunia_max'] * gunia_count * farm_env_factor
    farm_cost_mid = farm_cfg['cost_per_gunia_mid'] * gunia_count * farm_env_factor
    farm_cost_mid = round(farm_cost_mid / 100) * 100

    # Time for farm leg
    farm_speed = farm_cfg['speed_kmh']
    # Multiple trips needed if cargo exceeds max load
    trips_needed = max(1, -(-gunia_count // farm_cfg['max_load_gunia']))  # ceiling
    farm_time = (farm_to_road_km / max(farm_speed, 1)) * trips_needed * 2  # ×2 for round trips
    farm_time *= terrain_factor  # hills slow down animals/humans

    # ── Trip-based pricing alternatives (malipo kwa trip) ──
    # Some operators charge per trip with min load, not per gunia
    trip_pricing = {}
    for trip_key in ('piki_piki', 'punda_tololi', 'toyo_trip'):
        trip_pricing[trip_key] = calculate_trip_cost(gunia_count, trip_key, farm_env_factor)

    # Pick cheapest option: per-gunia vs per-trip (for default cost)
    cheapest_trip = min(trip_pricing.values(), key=lambda t: t['total_cost'])
    per_gunia_cost = int(farm_cost_mid)
    per_trip_cost = cheapest_trip['total_cost']
    best_farm_cost = min(per_gunia_cost, per_trip_cost)
    best_pricing_model = 'per_trip' if per_trip_cost < per_gunia_cost else 'per_gunia'

    stages.append({
        'stage': 1,
        'name': 'Shamba → Barabara (Farm to Road)',
        'display': farm_cfg['display'],
        'mode': farm_mode,
        'description': farm_cfg['description'],
        'distance_km': round(farm_to_road_km, 1),
        'trips': trips_needed,
        'gunia_count': gunia_count,
        # Per-gunia pricing
        'cost_per_gunia': per_gunia_cost,
        'cost_min': round(farm_cost_min / 100) * 100,
        'cost_max': round(farm_cost_max / 100) * 100,
        # Per-trip pricing alternatives
        'trip_pricing': trip_pricing,
        # Best option (cheapest of both models)
        'best_pricing_model': best_pricing_model,
        'cost': best_farm_cost,
        'cost_savings': abs(per_gunia_cost - per_trip_cost),
        'time_hours': round(farm_time, 2),
        'time_display': _format_time_hm(farm_time),
    })
    grand_total += best_farm_cost
    total_time_hours += farm_time

    # ══════════ STAGE 2: Kupakia (Loading at Road) ══════════
    load_cfg = LOADING_UNLOADING['kupakia']
    if weight_kg >= 1000:
        loading_cost = load_cfg['cost_per_ton'] * tons
    else:
        loading_cost = load_cfg['cost_per_gunia'] * gunia_count

    stages.append({
        'stage': 2,
        'name': 'Kupakia (Loading at Road)',
        'display': load_cfg['display'],
        'description': load_cfg['description'],
        'cost': int(loading_cost),
        'time_hours': round(weight_kg / 500, 2),  # ~500kg per hour manual loading
    })
    grand_total += int(loading_cost)
    total_time_hours += weight_kg / 500

    # ══════════ STAGE 3: Barabara (Main Road Transport) ══════════
    # Use calculate_all_modes for the main road leg
    road_logistics = calculate_all_modes(
        graph, start_id, end_id, region_names,
        weight_kg=weight_kg,
        terrain=terrain,
        season=season,
        soil_type=soil_type,
        fuel_price_tsh=fuel_price_tsh,
    )

    if road_logistics:
        stages.append({
            'stage': 3,
            'name': 'Barabara (Main Road Transport)',
            'display': 'Road Transport — All Modes',
            'distance_km': road_logistics['distance_km'],
            'route': road_logistics['route'],
            'results': road_logistics['results'],
            'road_condition': road_logistics['road_condition'],
            'corridors': road_logistics['corridors'],
        })

    # ══════════ STAGE 4: Kupakua (Unloading at Destination) ══════════
    unload_cfg = LOADING_UNLOADING['kupakua']
    if weight_kg >= 1000:
        unloading_cost = unload_cfg['cost_per_ton'] * tons
    else:
        unloading_cost = unload_cfg['cost_per_gunia'] * gunia_count

    stages.append({
        'stage': 4,
        'name': 'Kupakua (Unloading at Destination)',
        'display': unload_cfg['display'],
        'description': unload_cfg['description'],
        'cost': int(unloading_cost),
        'time_hours': round(weight_kg / 600, 2),  # ~600kg per hour unloading
    })
    grand_total += int(unloading_cost)
    total_time_hours += weight_kg / 600

    # ══════════ STAGE 5: Motorcycle Pickup (Last Mile) ══════════
    motorcycle_pickup = None
    if needs_motorcycle_pickup and road_logistics:
        moto_data = road_logistics['results'].get('motorcycle', {})
        moto_cost = moto_data.get('cost', 0)
        moto_both_ways = moto_data.get('both_ways_cost', moto_cost * 2)

        # Per-trip pricing for piki piki last-mile
        trip_piki = calculate_trip_cost(gunia_count, 'piki_piki', environment_factor)

        # Pick cheaper: distance-based vs per-trip
        best_moto_cost = min(moto_cost, trip_piki['total_cost'])
        moto_pricing_model = 'per_trip' if trip_piki['total_cost'] < moto_cost else 'distance_based'

        motorcycle_pickup = {
            'stage': 5,
            'name': 'Piki Piki — Terminal → Soko (Last Mile)',
            'display': 'Motorcycle Pickup (Bodaboda)',
            'description': 'Last-mile delivery from bus/truck terminal to market. Works both ways: farm→terminal and terminal→market.',
            'cost_oneway': moto_cost,
            'cost_both_ways': moto_both_ways,
            # Per-trip alternative
            'trip_pricing': trip_piki,
            'best_pricing_model': moto_pricing_model,
            'cost': best_moto_cost,
            'both_ways_display': 'Farm ↔ Terminal (round trip)',
        }
        stages.append(motorcycle_pickup)
        grand_total += best_moto_cost

    # ══════════ GRAND TOTAL ══════════
    # Add road transport cost (cheapest mode: truck) to grand total
    cheapest_road_cost = 0
    if road_logistics:
        # Find the cheapest road mode
        road_costs = {k: v['cost'] for k, v in road_logistics['results'].items()}
        cheapest_road_cost = min(road_costs.values()) if road_costs else 0
        grand_total += cheapest_road_cost
        # Add road time from cheapest mode
        cheapest_mode = min(road_logistics['results'], key=lambda k: road_logistics['results'][k]['cost'])
        total_time_hours += road_logistics['results'][cheapest_mode]['time_hours']

    # Build complete response
    return {
        'stages': stages,
        'grand_total': int(round(grand_total / 100) * 100),
        'grand_total_time_hours': round(total_time_hours, 2),
        'grand_total_time_display': _format_time_hm(total_time_hours),
        'weight_kg': weight_kg,
        'gunia_count': gunia_count,
        'farm_to_road_km': farm_to_road_km,
        'farm_mode': farm_mode,
        'farm_mode_display': farm_cfg['display'],
        # Environment summary
        'terrain': terrain,
        'terrain_display': terrain_cfg['display'],
        'terrain_factor': round(terrain_factor, 2),
        'season': season,
        'season_display': season_cfg['display'],
        'season_factor': round(season_factor, 2),
        'soil_type': soil_type,
        'soil_display': soil_cfg['display'],
        'soil_season_factor': round(soil_season_factor, 2),
        'fuel_price_tsh': fuel_price_tsh or FUEL_PRICE_CONFIG['baseline_tsh_per_liter'],
        'fuel_factor': round(fuel_factor, 3),
        'environment_factor': round(environment_factor, 3),
        # Road logistics detail
        'road_logistics': road_logistics,
        'cheapest_road_cost': cheapest_road_cost,
        # Reference data for frontend dropdowns
        'available_farm_modes': {k: {'display': v['display'], 'cost_per_gunia': v['cost_per_gunia_mid']} for k, v in FARM_STAGE_MODES.items()},
        'available_terrains': {k: {'display': v['display'], 'factor': v['factor']} for k, v in TERRAIN_FACTORS.items()},
        'available_seasons': {k: {'display': v['display'], 'factor': v['factor']} for k, v in SEASON_FACTORS.items()},
        'available_soil_types': {k: {'display': v['display']} for k, v in SOIL_TYPES.items()},
        'fuel_baseline': FUEL_PRICE_CONFIG['baseline_tsh_per_liter'],
        # Trip-based pricing reference (malipo kwa trip)
        'trip_pricing_modes': {k: {
            'display': v['display'],
            'cost_per_trip': v['cost_per_trip_mid'],
            'min_gunia': v['min_gunia_per_trip'],
            'max_gunia': v['max_gunia_per_trip'],
        } for k, v in TRIP_BASED_PRICING.items()},
    }
