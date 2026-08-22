-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260822_v12_profiles_province_expand.sql
--
-- profiles.province_id has never held an id. It holds a Thai province NAME
-- ('สุรินทร์'), written from PROVINCES_TH by every writer and read as a name by
-- every reader — lib/matching/engine.ts does NORTHEAST_PROVINCES.has(...) on it.
--
-- EXPAND phase of an expand/contract rename. A bare RENAME COLUMN is atomic in
-- the database but NOT atomic with the deploy: between migration and rollout,
-- old code writing province_id would fail on a column that no longer exists and
-- real users would see profile saves break. So: add the new column, backfill,
-- and keep both in step with a trigger. Neither version of the code can break.
--
-- The CONTRACT step (drop trigger + old column) is v13 and must NOT run until
-- this deploy is live and settled.
--
-- profile_baselines.province_id is deliberately OUT OF SCOPE: it is an immutable
-- research snapshot, documented in docs/research-data-dictionary.md and queried
-- by collaborators' analysis SQL. Renaming it would invalidate their queries.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1 ── the honest column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS province TEXT;

COMMENT ON COLUMN public.profiles.province IS
  'Thai province name, e.g. ''สุรินทร์''. Matches lib/translations PROVINCES_TH.';
COMMENT ON COLUMN public.profiles.province_id IS
  'DEPRECATED — misnamed, holds a province NAME. Kept in sync by trigger during the expand/contract rename. Dropped in v13.';

-- 2 ── backfill (idempotent; safe to re-run)
UPDATE public.profiles
   SET province = province_id
 WHERE province IS NULL
   AND province_id IS NOT NULL;

-- 3 ── keep both columns in step, in BOTH directions, so old and new code can
--      run concurrently through the deploy window.
CREATE OR REPLACE FUNCTION public.sync_profiles_province()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.province IS NULL AND NEW.province_id IS NOT NULL THEN
      NEW.province := NEW.province_id;            -- old code inserted
    ELSIF NEW.province_id IS NULL AND NEW.province IS NOT NULL THEN
      NEW.province_id := NEW.province;            -- new code inserted
    END IF;
  ELSE
    -- Whichever side actually changed wins. An upsert that omits both leaves
    -- both untouched, so this never overwrites a value with a stale one.
    IF NEW.province IS DISTINCT FROM OLD.province THEN
      NEW.province_id := NEW.province;
    ELSIF NEW.province_id IS DISTINCT FROM OLD.province_id THEN
      NEW.province := NEW.province_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_province ON public.profiles;
CREATE TRIGGER profiles_sync_province
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profiles_province();

-- 4 ── index parity with the old column
CREATE INDEX IF NOT EXISTS idx_profiles_province ON public.profiles (province);

-- 5 ── admin_province_stats reads profiles.province_id. Exposing BOTH output
--      columns lets the old and new admin page work simultaneously; the alias
--      goes away in v13. CREATE OR REPLACE cannot add or rename output columns,
--      so this is a drop-and-create.
DROP VIEW IF EXISTS public.admin_province_stats;
CREATE VIEW public.admin_province_stats AS
SELECT
  p.province,
  p.province AS province_id,   -- compatibility alias; removed in v13
  COUNT(*)::INTEGER AS user_count,
  ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::NUMERIC AS percentage
FROM public.profiles p
WHERE p.province IS NOT NULL
GROUP BY p.province
ORDER BY user_count DESC;

COMMIT;
