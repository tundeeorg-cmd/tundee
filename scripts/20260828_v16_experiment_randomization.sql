-- ═════════════════════════════════════════════════════════════════════════════
-- v16 — Experiment randomization foundation
--
-- Implements the design registered in research/PREREGISTRATION.md (commit
-- 4a3cc5b, 2026-08-28). Section references below are to that document.
--
--   [A] recruitment_source — REPURPOSED. The old column held the self-reported
--       "how did you hear about TunDee?" answer (v10, profile wizard step 7).
--       That is a different variable from the pre-registered §5.4
--       recruitment_source, which is derived from utm_campaign. The old values
--       move to heard_about_us; recruitment_source is rebuilt with a CHECK that
--       admits only {isaan_2026, bkk_2026, organic}.
--
--       ORDERING MATTERS. Apply this migration and deploy the matching code
--       together. Between the two, old code writing a self-report slug into
--       recruitment_source will RAISE rather than silently corrupt the variable
--       — the CHECK constraint is deliberately doing that job.
--
--   [B] cohort — every existing account becomes 'pilot' (§5.7). Pilot users are
--       never randomized and are excluded from the primary analysis. They keep
--       full product access and receive the baseline ranking.
--
--   [C] region_group / is_target_population — derived from the user's OWN
--       declared province and income (§5.1, §5.3), never from the campaign.
--       Both are GENERATED columns so they cannot drift from the definition.
--
--   [D] ranking_variant — the study's assignment (§5.6). A NEW column, distinct
--       from the legacy ab_arm, which is left untouched as pilot-era history.
--
--   [E] An immutability trigger on ranking_variant. Once written it cannot be
--       changed (§4). Enforced here, not in application code.
--
--   [F] fairness_eligible — recorded for users in BOTH arms (§5.5). Eligibility
--       is a property of the person; treatment is an assignment.
--
-- NOT done here: the counterfactual ranking store and the research-consent
-- columns. Those are v17, so this migration stays reviewable.
--
-- Idempotent: safe to re-run.
-- RLS: this migration does not disable, weaken, or drop any policy.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'income_bracket'
  ) THEN
    RAISE EXCEPTION 'profiles.income_bracket missing — run scripts/add_profile_columns.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'province'
  ) THEN
    RAISE EXCEPTION 'profiles.province missing — run 20260822_v12_profiles_province_expand.sql first';
  END IF;
END
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] recruitment_source: preserve the old meaning, rebuild under the new one
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS heard_about_us TEXT;

-- Move the self-report values across, once.
DO $mv$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'recruitment_source'
  ) THEN
    UPDATE public.profiles
       SET heard_about_us = recruitment_source
     WHERE heard_about_us IS NULL
       AND recruitment_source IS NOT NULL;

    -- Old CHECK (if v10 created one) guarded the self-report domain.
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_recruitment_source_check;

    -- Clear it: from here the column means something else entirely.
    UPDATE public.profiles SET recruitment_source = NULL;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN recruitment_source TEXT;
  END IF;
END
$mv$;

-- §5.4 — closed set. Anything else is 'organic'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_recruitment_source_campaign_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_recruitment_source_campaign_check
  CHECK (recruitment_source IS NULL
         OR recruitment_source IN ('isaan_2026', 'bkk_2026', 'organic'));

COMMENT ON COLUMN public.profiles.recruitment_source IS
  'PREREG §5.4. Derived from utm_campaign: isaan_2026 | bkk_2026 | organic. '
  'HOW the user was reached. Independent of region_group (WHO they are).';
COMMENT ON COLUMN public.profiles.heard_about_us IS
  'Self-reported referral (profile wizard). Formerly named recruitment_source. '
  'Not the pre-registered recruitment_source variable.';

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] cohort — pilot boundary (§5.7, §9.1)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cohort TEXT;

-- Every account that exists at migration time predates randomization.
UPDATE public.profiles SET cohort = 'pilot' WHERE cohort IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN cohort SET DEFAULT 'main';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cohort_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cohort_check
  CHECK (cohort IN ('pilot', 'main'));

COMMENT ON COLUMN public.profiles.cohort IS
  'PREREG §5.7. pilot = enrolled before randomization existed, excluded from '
  'primary analysis and never retroactively randomized. main = randomized.';

-- ═════════════════════════════════════════════════════════════════════════════
-- [C] Stratum variables (§5.1, §5.2, §5.3)
-- ═════════════════════════════════════════════════════════════════════════════

-- The 20 Isan provinces, identical to NORTHEAST_PROVINCES in
-- lib/matching/engine.ts. IMMUTABLE so a generated column can use it.
CREATE OR REPLACE FUNCTION public.tundee_region_group(p_province TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_province IS NULL THEN NULL
    WHEN p_province IN (
      'กาฬสินธุ์','ขอนแก่น','ชัยภูมิ','นครพนม','นครราชสีมา',
      'บึงกาฬ','บุรีรัมย์','มหาสารคาม','มุกดาหาร','ยโสธร',
      'ร้อยเอ็ด','เลย','ศรีสะเกษ','สกลนคร','สุรินทร์',
      'หนองคาย','หนองบัวลำภู','อำนาจเจริญ','อุดรธานี','อุบลราชธานี'
    ) THEN 'northeast'
    WHEN p_province IN (
      'กรุงเทพมหานคร','นนทบุรี','ปทุมธานี','สมุทรปราการ'
    ) THEN 'bangkok_metro'
    ELSE 'other'
  END
$fn$;

COMMENT ON FUNCTION public.tundee_region_group(TEXT) IS
  'PREREG §5.1. Mirrors NORTHEAST_PROVINCES in lib/matching/engine.ts. '
  'Derived from the declared province only — never from the ad campaign.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region_group TEXT
  GENERATED ALWAYS AS (public.tundee_region_group(province)) STORED;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_target_population BOOLEAN
  GENERATED ALWAYS AS (
    public.tundee_region_group(province) = 'northeast'
    AND income_bracket IS NOT NULL
    AND income_bracket <= 3
  ) STORED;

COMMENT ON COLUMN public.profiles.is_target_population IS
  'PREREG §5.3. northeast AND income_bracket <= 3 (declared monthly household '
  'income at or below THB 15,000). Defines the primary analysis stratum.';

-- ═════════════════════════════════════════════════════════════════════════════
-- [D] ranking_variant — the study assignment (§5.6)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ranking_variant             TEXT,
  ADD COLUMN IF NOT EXISTS ranking_assigned_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_algorithm_version TEXT,
  ADD COLUMN IF NOT EXISTS fairness_eligible           BOOLEAN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ranking_variant_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ranking_variant_check
  CHECK (ranking_variant IS NULL
         OR ranking_variant IN ('baseline', 'fairness_adjusted'));

-- An assignment without its timestamp and version is not auditable.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ranking_variant_complete_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ranking_variant_complete_check
  CHECK (ranking_variant IS NULL
         OR (ranking_assigned_at IS NOT NULL
             AND assignment_algorithm_version IS NOT NULL));

-- Pilot users are never randomized (§9.1).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pilot_never_randomized_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pilot_never_randomized_check
  CHECK (cohort <> 'pilot' OR ranking_variant IS NULL);

COMMENT ON COLUMN public.profiles.ranking_variant IS
  'PREREG §5.6. baseline | fairness_adjusted. Written once at profile '
  'completion, never updated. NOT the legacy ab_arm, which is pilot-era '
  'history and is excluded from analysis.';
COMMENT ON COLUMN public.profiles.fairness_eligible IS
  'PREREG §5.5. Recorded for users in BOTH arms. Eligibility is a property of '
  'the person; treatment is the assignment.';

-- ═════════════════════════════════════════════════════════════════════════════
-- [E] Immutability — enforced in the database, not the application (§4)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tundee_freeze_ranking_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fz$
BEGIN
  IF OLD.ranking_variant IS NOT NULL
     AND NEW.ranking_variant IS DISTINCT FROM OLD.ranking_variant THEN
    RAISE EXCEPTION
      'ranking_variant is immutable (PREREG §4): attempted % -> % for user %',
      OLD.ranking_variant, NEW.ranking_variant, OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- The audit trail is part of the assignment; freeze it too.
  IF OLD.ranking_variant IS NOT NULL THEN
    NEW.ranking_assigned_at          := OLD.ranking_assigned_at;
    NEW.assignment_algorithm_version := OLD.assignment_algorithm_version;
  END IF;

  RETURN NEW;
END
$fz$;

DROP TRIGGER IF EXISTS trg_freeze_ranking_variant ON public.profiles;
CREATE TRIGGER trg_freeze_ranking_variant
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tundee_freeze_ranking_variant();

-- ═════════════════════════════════════════════════════════════════════════════
-- [F] Indexes for the recruitment readout (§2C) — enrollment counts only
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_cohort_variant
  ON public.profiles (cohort, ranking_variant);

CREATE INDEX IF NOT EXISTS idx_profiles_stratum
  ON public.profiles (region_group, income_bracket);

CREATE INDEX IF NOT EXISTS idx_profiles_recruitment_source
  ON public.profiles (recruitment_source);

COMMIT;
