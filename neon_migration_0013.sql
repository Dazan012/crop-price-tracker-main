-- Smart Crops: Frictionless Auth Migration (0013)
-- Run this in Neon SQL Editor if `python manage.py migrate` times out

-- 1. Add onboarding_complete to UserProfile
ALTER TABLE prices_userprofile ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false NOT NULL;

-- 2. Add auth_provider to UserProfile
ALTER TABLE prices_userprofile ADD COLUMN IF NOT EXISTS auth_provider varchar(20) DEFAULT 'email' NOT NULL;

-- 3. Create MagicLink table (email magic link tokens)
CREATE TABLE IF NOT EXISTS prices_magiclink (
    id bigserial PRIMARY KEY,
    email varchar(254) NOT NULL,
    token varchar(64) UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false
);

-- 4. Create PhoneVerification table (phone OTP codes)
CREATE TABLE IF NOT EXISTS prices_phoneverification (
    id bigserial PRIMARY KEY,
    phone varchar(20) NOT NULL,
    code varchar(6) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false
);

-- 5. Mark migration as applied in Django migrations table
INSERT INTO django_migrations (app, name, applied)
VALUES ('prices', '0013_magiclink_phoneverification_onboarding', now())
ON CONFLICT DO NOTHING;
