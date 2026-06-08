-- ============================================================
-- fix_applications_fk.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- PROBLEM:
--   applications.user_id has a foreign key pointing to
--   public.users(id) — but TunDee uses the profiles table,
--   not public.users. So no row exists in public.users and
--   every INSERT hits:
--     23503 insert or update on table "applications" violates
--     foreign key constraint "applications_user_id_fkey"
--
-- FIX:
--   Drop the broken FK and re-add it pointing to auth.users(id)
--   (the Supabase auth table that ALWAYS has a row for every
--   logged-in user). RLS enforces auth.uid() = user_id anyway
--   so the FK is only for referential integrity / cascades.
-- ============================================================


-- ── Drop the broken FK ───────────────────────────────────────

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_user_id_fkey;


-- ── Re-add pointing to auth.users (always populated) ────────

ALTER TABLE applications
  ADD CONSTRAINT applications_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;


-- ── Verify ───────────────────────────────────────────────────

SELECT
  conname        AS constraint_name,
  confrelid::regclass AS references_table
FROM   pg_constraint
WHERE  conrelid = 'applications'::regclass
  AND  contype  = 'f';

-- Expected output:
--   constraint_name               | references_table
--   applications_user_id_fkey     | auth.users         ← must be auth.users not public.users
--   applications_scholarship_id_fkey | scholarships   ← unchanged
