-- ═════════════════════════════════════════════════════════════════════════════
-- v38_1 — store the covariates of an anonymous participant ON the assignment
--
-- Run in the Supabase SQL editor BEFORE deploying fix/start-research-data.
-- Order: this file, then 20261122_v38_2_anon_impressions_and_clicks.sql.
--
-- WHY
--   ANON_RANDOMIZATION=on is live (research/AMENDMENT-2026-10-26-*). anon_assignments
--   kept only the arm, stratum and consent, so for a visitor who never signs up the
--   §10.2 covariates (recruitment_source, grade level) and the target-population
--   filter (northeast AND income_bracket <= 3) could not be computed. The answers
--   sat in pending_intake under an id that is not joined to anon_id.
--
-- WHAT  Eleven nullable columns, written once by /api/start/randomize at insert:
--         level, province, region_group, income_bracket, gave_gpa,
--         utm_source, utm_medium, utm_campaign, utm_content,
--         recruitment_source, landing_variant
--       CHECKs on the new columns only. The freeze trigger is extended so they are
--       as immutable as the arm.
--
-- BACKFILL  Rows written before this file have no covariates. region_group and
--       income_bracket are recovered EXACTLY from `stratum` ('<region>|<bracket>',
--       stratumKey() in lib/research/assignment.ts) — before the trigger is extended,
--       so the update is allowed. Nothing else is guessed: level, province, UTMs,
--       recruitment_source and landing_variant stay NULL for those rows (unknown is
--       not 'organic').
--
-- SAFE / IDEMPOTENT  ADD COLUMN IF NOT EXISTS; DROP/ADD CONSTRAINT; the backfill only
--       touches rows whose region_group is NULL and whose stratum parses; CREATE OR
--       REPLACE FUNCTION. Re-running changes nothing.
--
-- NOT TOUCHED  the existing columns, the arm, any other table.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.anon_assignments
  ADD COLUMN IF NOT EXISTS level              TEXT,
  ADD COLUMN IF NOT EXISTS province           TEXT,
  ADD COLUMN IF NOT EXISTS region_group       TEXT,
  ADD COLUMN IF NOT EXISTS income_bracket     SMALLINT,
  ADD COLUMN IF NOT EXISTS gave_gpa           BOOLEAN,
  ADD COLUMN IF NOT EXISTS utm_source         TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium         TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign       TEXT,
  ADD COLUMN IF NOT EXISTS utm_content        TEXT,
  ADD COLUMN IF NOT EXISTS recruitment_source TEXT,
  ADD COLUMN IF NOT EXISTS landing_variant    TEXT;

ALTER TABLE public.anon_assignments DROP CONSTRAINT IF EXISTS anon_assignments_region_group_check;
ALTER TABLE public.anon_assignments ADD CONSTRAINT anon_assignments_region_group_check
  CHECK (region_group IS NULL OR region_group IN ('northeast', 'bangkok_metro', 'other'));

ALTER TABLE public.anon_assignments DROP CONSTRAINT IF EXISTS anon_assignments_income_bracket_check;
ALTER TABLE public.anon_assignments ADD CONSTRAINT anon_assignments_income_bracket_check
  CHECK (income_bracket IS NULL OR income_bracket BETWEEN 1 AND 7);

ALTER TABLE public.anon_assignments DROP CONSTRAINT IF EXISTS anon_assignments_recruitment_source_check;
ALTER TABLE public.anon_assignments ADD CONSTRAINT anon_assignments_recruitment_source_check
  CHECK (recruitment_source IS NULL OR recruitment_source IN ('isaan_2026', 'bkk_2026', 'organic'));

-- Free text from the URL: bounded, so a crafted link cannot store an essay.
ALTER TABLE public.anon_assignments DROP CONSTRAINT IF EXISTS anon_assignments_utm_length_check;
ALTER TABLE public.anon_assignments ADD CONSTRAINT anon_assignments_utm_length_check
  CHECK (COALESCE(length(utm_source), 0)   <= 200 AND COALESCE(length(utm_medium), 0)  <= 200
     AND COALESCE(length(utm_campaign), 0) <= 200 AND COALESCE(length(utm_content), 0) <= 200
     AND COALESCE(length(landing_variant), 0) <= 64);

-- ── Backfill from the stratum (exact), BEFORE the trigger below covers these columns ──
UPDATE public.anon_assignments
   SET region_group   = split_part(stratum, '|', 1),
       income_bracket = NULLIF(split_part(stratum, '|', 2), 'unknown')::SMALLINT
 WHERE region_group IS NULL
   AND split_part(stratum, '|', 1) IN ('northeast', 'bangkok_metro', 'other')
   AND split_part(stratum, '|', 2) ~ '^[1-7]$';

-- ── The freeze, extended: the covariates are written once, at insert ──────────
CREATE OR REPLACE FUNCTION public.anon_assignments_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.anon_id                      IS DISTINCT FROM OLD.anon_id
  OR NEW.ranking_variant              IS DISTINCT FROM OLD.ranking_variant
  OR NEW.ranking_assigned_at          IS DISTINCT FROM OLD.ranking_assigned_at
  OR NEW.assignment_algorithm_version IS DISTINCT FROM OLD.assignment_algorithm_version
  OR NEW.stratum                      IS DISTINCT FROM OLD.stratum
  OR NEW.fairness_eligible            IS DISTINCT FROM OLD.fairness_eligible
  OR NEW.research_consent_version     IS DISTINCT FROM OLD.research_consent_version
  OR NEW.research_consented_at        IS DISTINCT FROM OLD.research_consented_at THEN
    RAISE EXCEPTION 'anon_assignments: the assignment is immutable (anon %)', OLD.anon_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- v38: the covariates recorded with the assignment are as fixed as the arm.
  IF NEW.level              IS DISTINCT FROM OLD.level
  OR NEW.province           IS DISTINCT FROM OLD.province
  OR NEW.region_group       IS DISTINCT FROM OLD.region_group
  OR NEW.income_bracket     IS DISTINCT FROM OLD.income_bracket
  OR NEW.gave_gpa           IS DISTINCT FROM OLD.gave_gpa
  OR NEW.utm_source         IS DISTINCT FROM OLD.utm_source
  OR NEW.utm_medium         IS DISTINCT FROM OLD.utm_medium
  OR NEW.utm_campaign       IS DISTINCT FROM OLD.utm_campaign
  OR NEW.utm_content        IS DISTINCT FROM OLD.utm_content
  OR NEW.recruitment_source IS DISTINCT FROM OLD.recruitment_source
  OR NEW.landing_variant    IS DISTINCT FROM OLD.landing_variant THEN
    RAISE EXCEPTION 'anon_assignments: the covariates are written once, at assignment (anon %)', OLD.anon_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- A claim may be set once; the account may later be deleted (ON DELETE SET NULL).
  IF OLD.claimed_by IS NOT NULL AND NEW.claimed_by IS NOT NULL AND NEW.claimed_by <> OLD.claimed_by THEN
    RAISE EXCEPTION 'anon_assignments: already claimed (anon %)', OLD.anon_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$fn$;

-- The trigger itself (v28) already calls this function; recreated for idempotence.
DROP TRIGGER IF EXISTS trg_anon_assignments_freeze ON public.anon_assignments;
CREATE TRIGGER trg_anon_assignments_freeze
  BEFORE UPDATE ON public.anon_assignments
  FOR EACH ROW EXECUTE FUNCTION public.anon_assignments_freeze();

-- Still service role only (v28). Repeated so this file is safe on its own.
ALTER TABLE public.anon_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anon_assignments FROM anon, authenticated;

COMMENT ON COLUMN public.anon_assignments.recruitment_source IS
  'PREREG §5.4, from utm_campaign at assignment: isaan_2026 | bkk_2026 | organic. NULL = assigned before v38 (unknown, not organic).';
COMMENT ON COLUMN public.anon_assignments.region_group IS
  'PREREG §5.1, from the declared province (regionGroup()). Rows before v38 were backfilled from stratum.';

NOTIFY pgrst, 'reload schema';

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select count(*) as rows,
--          count(region_group) as with_region, count(income_bracket) as with_income,
--          count(level) as with_level, count(recruitment_source) as with_source
--     from public.anon_assignments;
--   -- every row whose stratum parses has region_group + income_bracket:
--   select count(*) as should_be_0 from public.anon_assignments
--    where region_group is null and split_part(stratum,'|',1) in ('northeast','bangkok_metro','other')
--      and split_part(stratum,'|',2) ~ '^[1-7]$';
--   -- the freeze holds (must raise restrict_violation, inside a transaction you roll back):
--   --   begin; update public.anon_assignments set level = 'x' where anon_id = (select anon_id from public.anon_assignments limit 1); rollback;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (restores the v28 trigger function; drops only what this file added)
-- ═════════════════════════════════════════════════════════════════════════════
--   CREATE OR REPLACE FUNCTION public.anon_assignments_freeze() RETURNS trigger LANGUAGE plpgsql AS $fn$
--   BEGIN
--     IF NEW.anon_id IS DISTINCT FROM OLD.anon_id OR NEW.ranking_variant IS DISTINCT FROM OLD.ranking_variant
--     OR NEW.ranking_assigned_at IS DISTINCT FROM OLD.ranking_assigned_at
--     OR NEW.assignment_algorithm_version IS DISTINCT FROM OLD.assignment_algorithm_version
--     OR NEW.stratum IS DISTINCT FROM OLD.stratum OR NEW.fairness_eligible IS DISTINCT FROM OLD.fairness_eligible
--     OR NEW.research_consent_version IS DISTINCT FROM OLD.research_consent_version
--     OR NEW.research_consented_at IS DISTINCT FROM OLD.research_consented_at THEN
--       RAISE EXCEPTION 'anon_assignments: the assignment is immutable (anon %)', OLD.anon_id USING ERRCODE = 'restrict_violation';
--     END IF;
--     IF OLD.claimed_by IS NOT NULL AND NEW.claimed_by IS NOT NULL AND NEW.claimed_by <> OLD.claimed_by THEN
--       RAISE EXCEPTION 'anon_assignments: already claimed (anon %)', OLD.anon_id USING ERRCODE = 'restrict_violation';
--     END IF;
--     RETURN NEW;
--   END $fn$;
--   ALTER TABLE public.anon_assignments
--     DROP CONSTRAINT IF EXISTS anon_assignments_utm_length_check,
--     DROP CONSTRAINT IF EXISTS anon_assignments_recruitment_source_check,
--     DROP CONSTRAINT IF EXISTS anon_assignments_income_bracket_check,
--     DROP CONSTRAINT IF EXISTS anon_assignments_region_group_check;
--   ALTER TABLE public.anon_assignments
--     DROP COLUMN IF EXISTS landing_variant, DROP COLUMN IF EXISTS recruitment_source,
--     DROP COLUMN IF EXISTS utm_content, DROP COLUMN IF EXISTS utm_campaign,
--     DROP COLUMN IF EXISTS utm_medium, DROP COLUMN IF EXISTS utm_source,
--     DROP COLUMN IF EXISTS gave_gpa, DROP COLUMN IF EXISTS income_bracket,
--     DROP COLUMN IF EXISTS region_group, DROP COLUMN IF EXISTS province, DROP COLUMN IF EXISTS level;
--   -- Deploy the previous app version first: the current one writes these columns.
