-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_acquisition_source.sql
-- Adds acquisition_source to profiles for channel attribution.
--
-- Values come from the ?src= query parameter on /students:
--   'school'  — printed handout / QR code given by teacher
--   'line'    — LINE message forward
--   'fb'      — Facebook post / ad
--   'tiktok'  — TikTok link
--   'direct'  — typed URL / no param (default)
--
-- Intentionally a free-text column (no ENUM) so new channels can be added
-- without schema changes. Values should be kept to the short slugs above.
-- No PII is stored here.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT DEFAULT 'direct';

-- Index for grouping signups and CTR analysis by channel
CREATE INDEX IF NOT EXISTS idx_profiles_acquisition_source
  ON public.profiles (acquisition_source);
