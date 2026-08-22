-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260823_v13_profiles_province_contract.sql
--
-- CONTRACT phase. Run ONLY after v12 is deployed, live and settled, and after
-- the code that reads/writes profiles.province is in production.
--
-- Postgres refuses to drop a column a view depends on, so admin_province_stats
-- is recreated without the compatibility alias first.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP VIEW IF EXISTS public.admin_province_stats;
CREATE VIEW public.admin_province_stats AS
SELECT
  p.province,
  COUNT(*)::INTEGER AS user_count,
  ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::NUMERIC AS percentage
FROM public.profiles p
WHERE p.province IS NOT NULL
GROUP BY p.province
ORDER BY user_count DESC;

DROP TRIGGER IF EXISTS profiles_sync_province ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profiles_province();
DROP INDEX IF EXISTS public.idx_profiles_province_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS province_id;

COMMIT;
