-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_profile_baselines.sql
-- Creates an IMMUTABLE snapshot table written once at profile completion.
-- Later profile edits must NOT touch this table.
--
-- This is the baseline used for PSM (Propensity Score Matching) — the
-- Chula advisor requires it to be written at T=0 and never changed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_baselines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Immutable snapshot of profile at completion time
  grade_level     TEXT,
  gpa             DECIMAL(3,2),
  province_id     TEXT,
  income_bracket  INTEGER CHECK (income_bracket BETWEEN 1 AND 7),
  fields_of_interest TEXT[],
  welfare_card    BOOLEAN,

  -- Research fields
  ab_arm          TEXT CHECK (ab_arm IN ('treatment', 'control')),
  research_opt_in BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamp of when profile setup was completed
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One baseline per user
  CONSTRAINT profile_baselines_user_unique UNIQUE (user_id)
);

-- Index for joining in analysis
CREATE INDEX IF NOT EXISTS idx_profile_baselines_user_id
  ON public.profile_baselines (user_id);

CREATE INDEX IF NOT EXISTS idx_profile_baselines_province
  ON public.profile_baselines (province_id);

CREATE INDEX IF NOT EXISTS idx_profile_baselines_income
  ON public.profile_baselines (income_bracket);

CREATE INDEX IF NOT EXISTS idx_profile_baselines_ab_arm
  ON public.profile_baselines (ab_arm);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.profile_baselines ENABLE ROW LEVEL SECURITY;

-- Users can read their own baseline (e.g. for transparency)
CREATE POLICY "baselines_select_own"
  ON public.profile_baselines FOR SELECT
  USING (auth.uid() = user_id);

-- NO update or delete policy — immutability enforced at DB level
-- Inserts are done server-side via service_role only (no insert policy needed
-- for anon/user role; the app uses service_role for this write)

-- Admin read
CREATE POLICY "baselines_admin_read"
  ON public.profile_baselines FOR SELECT
  USING ((auth.jwt() ->> 'email') = current_setting('app.admin_email', true));

-- ── Backfill existing completed profiles ──────────────────────────────────────
-- Insert a baseline for any profile that has grade_level set (= completed setup)
-- but no baseline yet. Uses their current profile data as T=0 approximation.
INSERT INTO public.profile_baselines
  (user_id, grade_level, gpa, province_id, income_bracket,
   fields_of_interest, welfare_card, ab_arm, research_opt_in, snapshotted_at)
SELECT
  p.id,
  p.grade_level,
  p.gpa,
  p.province_id,
  p.income_bracket,
  p.fields_of_interest,
  p.welfare_card,
  p.ab_arm,
  p.research_opt_in,
  COALESCE(p.updated_at, p.created_at)
FROM public.profiles p
WHERE p.grade_level IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
