-- ════════════════════════════════════════════════════════════════════════════
-- TunDee Admin Dashboard SQL
-- Run in Supabase SQL Editor BEFORE using the Analytics tab
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1: Add last_active_at column to profiles
-- (used to count daily active users in the analytics dashboard)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON public.profiles(last_active_at);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles(created_at);

-- STEP 2: Admin read-all RLS policies
-- These allow the admin email to read all rows in profiles and applications.
--
-- ⚠️  CHANGE THE EMAIL BELOW to your actual admin email before running!
--     It must match NEXT_PUBLIC_ADMIN_EMAIL in your Vercel env vars.

DO $$
BEGIN
  -- ── profiles: admin can read all rows ──────────────────────────────────
  DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
  CREATE POLICY "Admin reads all profiles"
    ON public.profiles
    FOR SELECT
    USING (
      (auth.jwt() ->> 'email') = 'tundee.org@gmail.com'  -- ⚠️ CHANGE THIS
    );

  -- ── applications: admin can read all rows ───────────────────────────────
  DROP POLICY IF EXISTS "Admin reads all applications" ON public.applications;
  CREATE POLICY "Admin reads all applications"
    ON public.applications
    FOR SELECT
    USING (
      (auth.jwt() ->> 'email') = 'tundee.org@gmail.com'  -- ⚠️ CHANGE THIS
    );

  -- ── scholarships: admin can read all rows (incl. inactive) ──────────────
  DROP POLICY IF EXISTS "Admin reads all scholarships" ON public.scholarships;
  CREATE POLICY "Admin reads all scholarships"
    ON public.scholarships
    FOR SELECT
    USING (
      (auth.jwt() ->> 'email') = 'tundee.org@gmail.com'  -- ⚠️ CHANGE THIS
    );
END;
$$;

-- STEP 3: Views for complex aggregations
-- These are used by the analytics dashboard

-- View 1: Daily new user signups for the last 365 days
CREATE OR REPLACE VIEW admin_daily_signups AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS day,
  COUNT(*)::INTEGER                             AS new_users
FROM public.profiles
WHERE created_at >= NOW() - INTERVAL '365 days'
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Bangkok')
ORDER BY day DESC;

-- View 2: Daily active users (had any application activity)
CREATE OR REPLACE VIEW admin_daily_active AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS day,
  COUNT(DISTINCT user_id)::INTEGER              AS active_users
FROM public.applications
WHERE created_at >= NOW() - INTERVAL '365 days'
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Bangkok')
ORDER BY day DESC;

-- View 3: Most saved / applied scholarships
CREATE OR REPLACE VIEW admin_top_scholarships AS
SELECT
  s.id,
  s.name_th,
  s.name_en,
  s.funder_name_th,
  s.tier,
  s.amount_thb,
  s.is_active,
  COUNT(a.id)::INTEGER                                                                        AS total_saves,
  SUM(CASE WHEN a.status IN ('started','in_progress') THEN 1 ELSE 0 END)::INTEGER            AS in_progress,
  SUM(CASE WHEN a.status = 'submitted'               THEN 1 ELSE 0 END)::INTEGER             AS submitted,
  SUM(CASE WHEN a.status = 'won'                     THEN 1 ELSE 0 END)::INTEGER             AS won
FROM public.scholarships s
LEFT JOIN public.applications a ON s.id = a.scholarship_id
GROUP BY s.id, s.name_th, s.name_en, s.funder_name_th, s.tier, s.amount_thb, s.is_active
ORDER BY total_saves DESC;

-- View 4: Province distribution
CREATE OR REPLACE VIEW admin_province_stats AS
SELECT
  province_id,
  COUNT(*)::INTEGER                                                        AS user_count,
  ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::NUMERIC AS percentage
FROM public.profiles
WHERE province_id IS NOT NULL
GROUP BY province_id
ORDER BY user_count DESC;

-- View 5: Single-row summary
CREATE OR REPLACE VIEW admin_summary AS
SELECT
  (SELECT COUNT(*)  FROM public.profiles)                                               AS total_users,
  (SELECT COUNT(*)  FROM public.profiles WHERE created_at >= NOW() - INTERVAL '7 days') AS new_users_7d,
  (SELECT COUNT(*)  FROM public.profiles WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users_30d,
  (SELECT COUNT(*)  FROM public.profiles WHERE last_active_at >= NOW() - INTERVAL '1 day')  AS active_today,
  (SELECT COUNT(*)  FROM public.profiles WHERE last_active_at >= NOW() - INTERVAL '7 days') AS active_7d,
  (SELECT COUNT(*)  FROM public.profiles WHERE last_active_at >= NOW() - INTERVAL '30 days') AS active_30d,
  (SELECT COUNT(*)  FROM public.applications)                                           AS total_saves,
  (SELECT COUNT(*)  FROM public.applications WHERE status IN ('started','in_progress')) AS in_progress,
  (SELECT COUNT(*)  FROM public.applications WHERE status = 'submitted')                AS submitted,
  (SELECT COUNT(*)  FROM public.applications WHERE status = 'won')                     AS won,
  (SELECT COUNT(*)  FROM public.scholarships WHERE is_active = TRUE)                   AS active_scholarships,
  (SELECT COUNT(*)  FROM public.profiles WHERE gpa IS NOT NULL)                        AS profiles_complete,
  (SELECT COUNT(*)  FROM public.profiles WHERE welfare_card = TRUE)                    AS welfare_card_users;

-- Grant access to views (authenticated users — admin email check is done in the app)
GRANT SELECT ON admin_daily_signups   TO authenticated;
GRANT SELECT ON admin_daily_active    TO authenticated;
GRANT SELECT ON admin_top_scholarships TO authenticated;
GRANT SELECT ON admin_province_stats  TO authenticated;
GRANT SELECT ON admin_summary         TO authenticated;

-- Verify
SELECT 'admin_views.sql applied successfully ✓' AS result;
SELECT 'last_active_at column added to profiles ✓' AS result2;
