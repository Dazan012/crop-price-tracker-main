-- ============================================================
-- Smart Crops: Notification System — Direct SQL for Neon
-- Run this in Neon SQL Editor if `python manage.py migrate`
-- can't connect or times out.
-- ============================================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS prices_notification (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    type        VARCHAR(20) NOT NULL DEFAULT 'system',
    priority    VARCHAR(10) NOT NULL DEFAULT 'medium',
    title       VARCHAR(300) NOT NULL,
    message     TEXT NOT NULL,
    region      VARCHAR(100) DEFAULT '',
    crop        VARCHAR(100),
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_type CHECK (type IN ('price_alert', 'opportunity', 'transport', 'system')),
    CONSTRAINT chk_priority CHECK (priority IN ('high', 'medium', 'low'))
);

-- 2. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_notif_user_read_created
    ON prices_notification (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_user_type_created
    ON prices_notification (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_type_crop_region_created
    ON prices_notification (type, crop, region, created_at DESC);

-- 3. Deduplication helper function
--    Returns TRUE if a similar notification was sent in the last N hours
CREATE OR REPLACE FUNCTION notif_dedup_check(
    p_user_id   INTEGER,
    p_type      VARCHAR,
    p_crop      VARCHAR,
    p_region    VARCHAR,
    p_hours     INTEGER DEFAULT 2
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM prices_notification
        WHERE user_id = p_user_id
          AND type = p_type
          AND COALESCE(crop, '') = COALESCE(p_crop, '')
          AND COALESCE(region, '') = COALESCE(p_region, '')
          AND created_at >= NOW() - (p_hours || ' hours')::INTERVAL
    );
END;
$$ LANGUAGE plpgsql;

-- 4. Safe insert with dedup
CREATE OR REPLACE FUNCTION create_notification_if_unique(
    p_user_id   INTEGER,
    p_type      VARCHAR,
    p_priority  VARCHAR,
    p_title     VARCHAR,
    p_message   TEXT,
    p_region    VARCHAR DEFAULT '',
    p_crop      VARCHAR DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    IF notif_dedup_check(p_user_id, p_type, p_crop, p_region) THEN
        RETURN NULL; -- duplicate, skip
    END IF;

    INSERT INTO prices_notification (user_id, type, priority, title, message, region, crop, created_at)
    VALUES (p_user_id, p_type, p_priority, p_title, p_message, p_region, p_crop, NOW())
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Row-Level Security (RLS) — optional but recommended
--    Users can only SELECT/UPDATE their own notifications
ALTER TABLE prices_notification ENABLE ROW LEVEL SECURITY;

-- Note: RLS with Django auth requires mapping user IDs.
-- If using Neon's built-in auth, uncomment these policies:
-- CREATE POLICY notif_select_own ON prices_notification
--     FOR SELECT USING (user_id = auth.uid());
-- CREATE POLICY notif_update_own ON prices_notification
--     FOR UPDATE USING (user_id = auth.uid());
-- Only service role can INSERT (handled by Django views)

-- 6. Notification stats query (for dashboard)
-- SELECT
--     user_id,
--     COUNT(*) FILTER (WHERE NOT read) AS unread_count,
--     COUNT(*) FILTER (WHERE priority = 'high' AND NOT read) AS high_priority_unread,
--     MAX(created_at) FILTER (WHERE NOT read) AS latest_unread_at
-- FROM prices_notification
-- GROUP BY user_id;

-- ============================================================
-- 7. Granular notification preference fields on UserPreferences
--    (Migration 0012)
-- ============================================================
ALTER TABLE prices_userpreferences
    ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opportunity_alerts    BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS transport_alerts      BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS personalized_alerts   BOOLEAN DEFAULT TRUE;
