-- ═════════════════════════════════════════════════════════════════════════════
-- v10 — Add missing onboarding research columns to profiles
--
-- ROOT CAUSE
-- ──────────
-- app/profile/setup/page.tsx (the 8-step onboarding wizard) writes three
-- columns that no prior migration ever created:
--
--   prior_scholarship_knowledge  (step 1 — "how many scholarships did you
--                                  know about before TunDee?")
--   recruitment_source            (step 7 — "how did you hear about TunDee?")
--   signup_cohort                 (derived from province at save time)
--
-- app/admin/page.tsx also reads recruitment_source and
-- prior_scholarship_knowledge back out for the analytics dashboard, so this
-- isn't dead code on either side — the table definition is just missing.
-- PostgREST's schema cache correctly has no entry for them, hence PGRST204
-- ("Could not find the '<col>' column of 'profiles' in the schema cache")
-- on every onboarding save.
--
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- prior_scholarship_knowledge — numeric proxy from PRIOR_KNOWLEDGE_OPTIONS
-- (0, 2, 6, or 15; null = not answered). Nullable, no default.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prior_scholarship_knowledge SMALLINT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_prior_scholarship_knowledge_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_prior_scholarship_knowledge_check
       CHECK (prior_scholarship_knowledge IS NULL OR prior_scholarship_knowledge >= 0);

-- recruitment_source — from RECRUITMENT_SOURCE_OPTIONS; app defaults to
-- 'unknown' when the user skips the step, so 'unknown' must be a valid value.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recruitment_source TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_recruitment_source_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_recruitment_source_check
       CHECK (recruitment_source IS NULL OR recruitment_source IN (
         'school_teacher', 'friend_referral', 'google_search', 'social_media', 'unknown'
       ));

-- signup_cohort — derived by determineSignupCohort() from the student's
-- province at save time; used to analyse rollout waves by region.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_cohort TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_signup_cohort_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_signup_cohort_check
       CHECK (signup_cohort IS NULL OR signup_cohort IN (
         'wave_1_bangkok', 'wave_2_northeast', 'wave_2_north', 'wave_3_national'
       ));

-- Indexes for the admin analytics dashboard's group-by queries
CREATE INDEX IF NOT EXISTS idx_profiles_recruitment_source
  ON public.profiles (recruitment_source);
CREATE INDEX IF NOT EXISTS idx_profiles_signup_cohort
  ON public.profiles (signup_cohort);

COMMIT;

-- Force PostgREST to pick up the new columns immediately rather than waiting
-- for its next automatic schema-cache refresh.
NOTIFY pgrst, 'reload schema';

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY (run manually after applying)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('prior_scholarship_knowledge', 'recruitment_source', 'signup_cohort');
--   -- expect: 3 rows
--
-- Then retry the onboarding save in the browser — the PGRST204 banner should
-- be gone and the row should persist with these three fields populated.
