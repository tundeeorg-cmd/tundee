-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_import_columns.sql
-- Adds dedupe_key (UNIQUE), verified_at, next_review_at to the scholarships table.
--
-- HOW TO RUN (staging first — never production until dry-run passes):
--   1. Open Supabase SQL Editor for your STAGING project.
--   2. Run the duplicate-check SELECT below first.
--   3. If it returns zero rows, paste and run the full script.
--   4. Repeat for production only after a clean dry-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Add columns ───────────────────────────────────────────────────────
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS dedupe_key      TEXT,
  ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_review_at  TIMESTAMPTZ;

-- ── Step 2: Backfill dedupe_key for all existing rows ────────────────────────
-- normalize(s) = lower(trim(collapse_internal_whitespace(s)))
UPDATE public.scholarships
SET dedupe_key = (
    lower(trim(regexp_replace(coalesce(funder_name_th, ''), '\s+', ' ', 'g')))
    || '||' ||
    lower(trim(regexp_replace(coalesce(name_th, ''),        '\s+', ' ', 'g')))
)
WHERE dedupe_key IS NULL;

-- ── Step 3: Check for conflicts BEFORE adding the UNIQUE constraint ───────────
-- Run this SELECT first. If it returns any rows, resolve the duplicates
-- (e.g. manually set is_active=false on the older duplicate) before continuing.
--
-- SELECT dedupe_key,
--        count(*)             AS occurrences,
--        array_agg(name_th)   AS names,
--        array_agg(id)        AS ids
-- FROM   public.scholarships
-- GROUP  BY dedupe_key
-- HAVING count(*) > 1;

-- ── Step 4: Add UNIQUE constraint ────────────────────────────────────────────
-- This will error if any duplicates still exist (Step 3 should be zero rows first).
ALTER TABLE public.scholarships
  ADD CONSTRAINT scholarships_dedupe_key_unique UNIQUE (dedupe_key);

-- ── (Optional) Step 5: Admin INSERT/UPDATE RLS policy ─────────────────────────
-- The existing schema has no INSERT/UPDATE policies. The import API route uses
-- the SUPABASE_SERVICE_ROLE_KEY (bypasses RLS entirely) so no policy change is
-- needed. If you ever want non-service-role admin writes, add a policy here.
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_policies
--     WHERE tablename = 'scholarships' AND policyname = 'Admin write scholarships'
--   ) THEN
--     CREATE POLICY "Admin write scholarships"
--       ON public.scholarships FOR ALL
--       USING      ((auth.jwt() ->> 'email') = current_setting('app.admin_email', true))
--       WITH CHECK ((auth.jwt() ->> 'email') = current_setting('app.admin_email', true));
--   END IF;
-- END $$;
