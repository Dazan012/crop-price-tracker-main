-- Smart Crops: Supabase PostgreSQL Schema
-- Generated from Django models for migration

-- Regions
CREATE TABLE IF NOT EXISTS prices_region (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    zone VARCHAR(100) DEFAULT ''
);

-- Crops
CREATE TABLE IF NOT EXISTS prices_crop (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'grain',
    unit VARCHAR(50) NOT NULL DEFAULT 'kg',
    description TEXT DEFAULT ''
);

-- Markets
CREATE TABLE IF NOT EXISTS prices_market (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    region_id BIGINT REFERENCES prices_region(id) ON DELETE CASCADE,
    district VARCHAR(100) DEFAULT '',
    ward VARCHAR(100) DEFAULT '',
    location_description TEXT DEFAULT '',
    market_type VARCHAR(20) NOT NULL DEFAULT 'daily',
    operating_days TEXT DEFAULT '',
    governing_authority VARCHAR(200) DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, region_id)
);

-- Auth Users (mirror for Django compatibility)
CREATE TABLE IF NOT EXISTS auth_user (
    id SERIAL PRIMARY KEY,
    password VARCHAR(128) NOT NULL DEFAULT '',
    last_login TIMESTAMPTZ,
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    username VARCHAR(150) UNIQUE NOT NULL,
    first_name VARCHAR(150) DEFAULT '',
    last_name VARCHAR(150) DEFAULT '',
    email VARCHAR(254) DEFAULT '',
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    date_joined TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auth Tokens
CREATE TABLE IF NOT EXISTS authtoken_token (
    key VARCHAR(40) PRIMARY KEY,
    created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id INTEGER UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE
);

-- User Profiles
CREATE TABLE IF NOT EXISTS prices_userprofile (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'general',
    phone VARCHAR(20) DEFAULT '',
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    region VARCHAR(100) DEFAULT '',
    district VARCHAR(100) DEFAULT '',
    approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Email verification
    email_verification_code VARCHAR(6) DEFAULT '',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_code_sent_at TIMESTAMPTZ,
    -- Identity
    nida_number VARCHAR(20) DEFAULT '',
    date_of_birth DATE,
    gender VARCHAR(10) DEFAULT '',
    profile_photo VARCHAR(200) DEFAULT '',
    -- Farmer fields
    main_crops TEXT DEFAULT '',
    farm_size DOUBLE PRECISION,
    farm_size_unit VARCHAR(10) DEFAULT 'acres',
    preferred_markets TEXT DEFAULT '',
    ward VARCHAR(100) DEFAULT '',
    land_ownership VARCHAR(20) DEFAULT '',
    farming_type VARCHAR(20) DEFAULT '',
    cooperative_name VARCHAR(200) DEFAULT '',
    mobile_money_provider VARCHAR(20) DEFAULT '',
    mobile_money_number VARCHAR(20) DEFAULT '',
    avg_harvest_qty DOUBLE PRECISION,
    avg_harvest_unit VARCHAR(20) DEFAULT '',
    -- Trader fields
    entity_type VARCHAR(20) DEFAULT '',
    business_name VARCHAR(200) DEFAULT '',
    brela_number VARCHAR(50) DEFAULT '',
    tin_number VARCHAR(50) DEFAULT '',
    contact_person_name VARCHAR(100) DEFAULT '',
    contact_person_role VARCHAR(100) DEFAULT '',
    operating_regions TEXT DEFAULT '',
    crops_of_interest TEXT DEFAULT '',
    trade_types TEXT DEFAULT '',
    primary_source_region VARCHAR(100) DEFAULT '',
    primary_sales_region VARCHAR(100) DEFAULT '',
    avg_monthly_volume DOUBLE PRECISION,
    volume_unit VARCHAR(20) DEFAULT '',
    transport_capacity VARCHAR(100) DEFAULT '',
    has_transport BOOLEAN,
    vehicle_count INTEGER,
    vehicle_types TEXT DEFAULT '',
    trading_since_year INTEGER,
    business_licence_number VARCHAR(50) DEFAULT '',
    crop_board_permits TEXT DEFAULT '',
    has_export_licence BOOLEAN,
    export_licence_number VARCHAR(50) DEFAULT '',
    referee_name VARCHAR(100) DEFAULT '',
    referee_phone VARCHAR(20) DEFAULT '',
    referee_relationship VARCHAR(100) DEFAULT '',
    supporting_document VARCHAR(200) DEFAULT '',
    payment_method VARCHAR(20) DEFAULT '',
    bank_name VARCHAR(100) DEFAULT '',
    bank_account_number VARCHAR(50) DEFAULT '',
    bank_account_name VARCHAR(100) DEFAULT '',
    -- Agent fields
    assigned_market_id BIGINT REFERENCES prices_market(id) ON DELETE SET NULL,
    id_verification TEXT DEFAULT '',
    experience TEXT DEFAULT '',
    market_type VARCHAR(50) DEFAULT '',
    operating_days TEXT DEFAULT '',
    crops_at_market TEXT DEFAULT '',
    authority_type VARCHAR(20) DEFAULT '',
    authority_name VARCHAR(200) DEFAULT '',
    is_officially_appointed BOOLEAN,
    official_agent_id VARCHAR(50) DEFAULT '',
    supervisor_name VARCHAR(100) DEFAULT '',
    supervisor_phone VARCHAR(20) DEFAULT '',
    supervisor_title VARCHAR(100) DEFAULT '',
    appointment_document VARCHAR(200) DEFAULT '',
    reporting_frequency VARCHAR(20) DEFAULT '',
    price_collection_methods TEXT DEFAULT '',
    earns_commission BOOLEAN,
    commission_mobile_money_provider VARCHAR(20) DEFAULT '',
    commission_mobile_money_number VARCHAR(20) DEFAULT '',
    commitment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    guidelines_accepted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Price Entries
CREATE TABLE IF NOT EXISTS prices_priceentry (
    id BIGSERIAL PRIMARY KEY,
    crop_id BIGINT REFERENCES prices_crop(id) ON DELETE CASCADE,
    market_id BIGINT REFERENCES prices_market(id) ON DELETE CASCADE,
    price DOUBLE PRECISION NOT NULL,
    quantity DOUBLE PRECISION,
    submitted_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price_date DATE NOT NULL,
    is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
    anomaly_score DOUBLE PRECISION,
    anomaly_reason TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'approved',
    review_notes TEXT DEFAULT '',
    reviewed_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    validation_status VARCHAR(20) DEFAULT 'approved',
    z_score DOUBLE PRECISION,
    source VARCHAR(20) DEFAULT 'agent',
    segment_data JSONB DEFAULT '{}'::jsonb
);

-- Market Agent Submissions
CREATE TABLE IF NOT EXISTS prices_marketagentsubmission (
    id BIGSERIAL PRIMARY KEY,
    price_entry_id BIGINT REFERENCES prices_priceentry(id) ON DELETE CASCADE,
    agent_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    review_notes TEXT DEFAULT '',
    reviewed_by_id INTEGER REFERENCES auth_user(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ
);

-- Transport Routes
CREATE TABLE IF NOT EXISTS prices_transportroute (
    id BIGSERIAL PRIMARY KEY,
    origin_market_id BIGINT REFERENCES prices_market(id) ON DELETE CASCADE,
    destination_market_id BIGINT REFERENCES prices_market(id) ON DELETE CASCADE,
    distance_km DOUBLE PRECISION,
    cost_per_ton DOUBLE PRECISION,
    transport_mode VARCHAR(50) DEFAULT '',
    estimated_hours DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price Alerts
CREATE TABLE IF NOT EXISTS prices_pricealert (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
    crop_id BIGINT REFERENCES prices_crop(id) ON DELETE CASCADE,
    region VARCHAR(100) DEFAULT '',
    alert_type VARCHAR(20) NOT NULL DEFAULT 'price_drop',
    threshold DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ,
    message TEXT DEFAULT ''
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_priceentry_crop ON prices_priceentry(crop_id);
CREATE INDEX IF NOT EXISTS idx_priceentry_market ON prices_priceentry(market_id);
CREATE INDEX IF NOT EXISTS idx_priceentry_date ON prices_priceentry(price_date);
CREATE INDEX IF NOT EXISTS idx_priceentry_status ON prices_priceentry(status);
CREATE INDEX IF NOT EXISTS idx_market_region ON prices_market(region_id);
CREATE INDEX IF NOT EXISTS idx_userprofile_role ON prices_userprofile(role);
CREATE INDEX IF NOT EXISTS idx_userprofile_assigned ON prices_userprofile(assigned_market_id);

-- Enable Row Level Security (but allow all for now during migration)
ALTER TABLE prices_region ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_crop ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_market ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_priceentry ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices_userprofile ENABLE ROW LEVEL SECURITY;

-- Open policies for now (can be restricted later)
CREATE POLICY "Allow all select" ON prices_region FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON prices_region FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON prices_region FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON prices_region FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON prices_crop FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON prices_crop FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON prices_crop FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON prices_crop FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON prices_market FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON prices_market FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON prices_market FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON prices_market FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON prices_priceentry FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON prices_priceentry FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON prices_priceentry FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON prices_priceentry FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON prices_userprofile FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON prices_userprofile FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON prices_userprofile FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON prices_userprofile FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON auth_user FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON auth_user FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON auth_user FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON auth_user FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON authtoken_token FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON authtoken_token FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON authtoken_token FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON authtoken_token FOR DELETE USING (true);
