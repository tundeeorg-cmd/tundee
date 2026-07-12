-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_ab_arm.sql
-- Adds A/B arm assignment + denormalised research fields to profiles,
-- applications, and user_events.
--
-- Safe to run multiple times (all IF NOT EXISTS / DO NOTHING).
-- Run on STAGING first, verify, then production.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles: arm assignment ───────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ab_arm         TEXT
    CHECK (ab_arm IN ('treatment', 'control')),
  ADD COLUMN IF NOT EXISTS ab_assigned_at TIMESTAMPTZ;

-- Backfill existing users deterministically: odd MD5 nibble → treatment
-- (New users get assigned in code; this catches existing rows.)
UPDATE public.profiles
SET
  ab_arm         = CASE WHEN (get_byte(decode(md5(id::text), 'hex'), 0) % 2) = 0
                        THEN 'treatment' ELSE 'control' END,
  ab_assigned_at = NOW()
WHERE ab_arm IS NULL;

-- ── 2. applications: add arm + income_bracket for click-through analysis ──────
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS ab_arm         TEXT
    CHECK (ab_arm IN ('treatment', 'control')),
  ADD COLUMN IF NOT EXISTS income_bracket INTEGER
    CHECK (income_bracket BETWEEN 1 AND 7);

-- ── 3. recommendations: stamp arm so every ranked list is labelled ─────────────
ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS ab_arm TEXT
    CHECK (ab_arm IN ('treatment', 'control'));

-- ── 4. user_events: add arm + income_bracket for event-level analysis ─────────
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS ab_arm         TEXT
    CHECK (ab_arm IN ('treatment', 'control')),
  ADD COLUMN IF NOT EXISTS income_bracket INTEGER
    CHECK (income_bracket BETWEEN 1 AND 7);

-- ── 5. Indexes for analytical queries ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_ab_arm
  ON public.applications (ab_arm);

CREATE INDEX IF NOT EXISTS idx_applications_income
  ON public.applications (income_bracket);

CREATE INDEX IF NOT EXISTS idx_user_events_ab_arm
  ON public.user_events (ab_arm);

CREATE INDEX IF NOT EXISTS idx_recommendations_ab_arm
  ON public.recommendations (ab_arm);
