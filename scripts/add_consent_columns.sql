-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_consent_columns.sql
-- Adds PDPA consent fields to the profiles table.
--
-- All columns are nullable / have defaults → fully non-destructive.
-- Existing users will have NULL consent_at (they signed up before consent
-- was collected); this is expected and should be noted in your privacy policy.
--
-- Run on STAGING first, verify, then run on production.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  -- Version string of the Privacy Policy the user agreed to (e.g. "1.0")
  ADD COLUMN IF NOT EXISTS consent_version       TEXT,

  -- Timestamp of when the user checked "I agree"
  ADD COLUMN IF NOT EXISTS consent_at            TIMESTAMPTZ,

  -- TRUE = user opted in to anonymised research use (optional, separate checkbox)
  ADD COLUMN IF NOT EXISTS research_opt_in       BOOLEAN NOT NULL DEFAULT FALSE,

  -- TRUE = user acknowledged the under-18 guardian notice
  ADD COLUMN IF NOT EXISTS guardian_acknowledged BOOLEAN NOT NULL DEFAULT FALSE;

-- (Optional) Index for querying research-opted-in users
CREATE INDEX IF NOT EXISTS idx_profiles_research_opt_in
  ON public.profiles (research_opt_in)
  WHERE research_opt_in = TRUE;
