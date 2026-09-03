-- ═════════════════════════════════════════════════════════════════════════════
-- v21 — profiles.grade_year: which year, inside the range
--
-- WHY
-- ───
-- grade_level stores a range: 'M1-M3', 'M4-M6', 'vocational', 'uni',
-- 'graduate'. The matcher therefore cannot tell a ม.4 student from a ม.6 one,
-- and they are not the same applicant. Almost every Thai undergraduate
-- scholarship recruits from students finishing ม.6 — for them those are the
-- scholarships to lead with, and for a ม.4 student the same list is something
-- to prepare for two years from now.
--
-- Measured on the live catalogue, ม.1–3, ม.4–6 and ปวช./ปวส. currently return
-- an IDENTICAL 302 scholarships with an identical breakdown, because the
-- eligibility buckets treat all three the same and no year granularity exists.
-- This column is what makes a difference possible; the ordering that uses it
-- lives in lib/recommender/matchGroups.ts.
--
-- WHAT THIS DOES NOT TOUCH
-- ────────────────────────
-- profiles_grade_level_check and the grade_level column are left exactly as
-- they are. grade_level remains the value every other part of the app reads,
-- and grade_year is strictly additional. Nothing that works today can start
-- failing because of this migration.
--
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The column ───────────────────────────────────────────────────────────
-- Nullable, and it will stay null for most rows. 42 profiles exist today; 4
-- hold 'M4-M6', and none of them has been asked which year. NULL has to mean
-- "the whole range", not "broken", or this repeats the mistake that left 16
-- students matched against nothing.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS grade_year SMALLINT;

COMMENT ON COLUMN public.profiles.grade_year IS
  'Year within grade_level''s range: 1-3 for M1-M3, 4-6 for M4-M6. NULL means '
  'not asked or not applicable (uni / graduate / vocational), and must be '
  'treated as "anywhere in the range" — never as a failure.';

-- ── 2. Range only ───────────────────────────────────────────────────────────
-- Deliberately NOT a cross-column check against grade_level.
--
-- The stricter version is tempting and would read well:
--
--   CHECK (grade_level <> 'M4-M6' OR grade_year BETWEEN 4 AND 6)
--
-- It is rejected because of what this table has already cost. A student who
-- changes ม.6 → ม.2 sends grade_level='M1-M3' with a stale grade_year=6, and
-- that write fails. profiles_grade_level_check refused every school student for
-- weeks on exactly that shape of mistake — a constraint that was right about
-- the data and wrong about the application — and 16 rows still carry a NULL
-- grade_level because of it. student_profile_consent_auditable_check did the
-- same thing to research consent this morning.
--
-- Coherence between the two columns is enforced where a mismatch can be
-- corrected instead of rejected: lib/profile/setupAnswers.ts clears grade_year
-- whenever grade_level changes. A wrong pairing here is a display nuisance; a
-- refused write is a student losing their answers.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_grade_year_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_grade_year_check
  CHECK (grade_year IS NULL OR grade_year BETWEEN 1 AND 6);

-- ── 3. No backfill ──────────────────────────────────────────────────────────
-- A year cannot be inferred from a range: 'M4-M6' is ม.4, ม.5 or ม.6 with no
-- way to tell which, and guessing would put a year on a student's record that
-- they never gave. They are asked the next time they open the wizard; until
-- then NULL keeps them matched exactly as they are today.

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   SELECT column_name, data_type, is_nullable
--   FROM   information_schema.columns
--   WHERE  table_schema = 'public' AND table_name = 'profiles'
--     AND  column_name IN ('grade_level', 'grade_year');
--   -- expect two rows; grade_year smallint YES
--
--   SELECT pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conname = 'profiles_grade_year_check';
--   -- expect: CHECK (grade_year IS NULL OR (grade_year >= 1 AND grade_year <= 6))
--
--   SELECT pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conname = 'profiles_grade_level_check';
--   -- expect UNCHANGED: the five canonical values from v19
--
--   SELECT grade_level, grade_year, COUNT(*)
--   FROM   public.profiles GROUP BY 1, 2 ORDER BY 3 DESC;
--   -- expect every grade_year NULL — nothing is backfilled
