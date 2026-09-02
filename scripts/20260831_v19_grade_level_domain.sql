-- ═════════════════════════════════════════════════════════════════════════════
-- v19 — profiles.grade_level: one canonical domain
--
-- THE OUTAGE
-- ──────────
-- Every student in secondary school or vocational college who completed the
-- nine-step onboarding wizard lost all nine steps at 100%:
--
--   [23514] new row for relation "profiles" violates check constraint
--   "profiles_grade_level_check"
--
-- profiles_grade_level_check was written in add_bias_score_column.sql when the
-- table was created, admitting ('M4','M5','M6','uni','graduate'). The wizard
-- (app/profile/setup) and the /start preview have since offered five DIFFERENT
-- values: 'M1-M3', 'M4-M6', 'vocational', 'uni', 'graduate'. Only 'uni' and
-- 'graduate' were legal in both — and only those two ever reached the table.
--
-- Production before this migration, all 40 rows:
--     uni 16 · graduate 5 · M6 1 · NULL 18
--     M1-M3 / M4-M6 / vocational: ZERO
-- Not one high-school or vocational student, on a product for Thai high-school
-- students. The constraint was working perfectly. It was rejecting the users.
--
-- WHICH SIDE WINS, AND WHY
-- ────────────────────────
-- The application's vocabulary. lib/recommender/gradeLevel.ts already normalizes
-- 'M1-M3', 'M4-M6' and 'vocational' into its buckets and has since it was
-- written, so widening the domain does NOT produce profiles that save but never
-- match — verified by __tests__/profileSetup.e2e.test.ts, which runs the real
-- recommender over every one of the five values. Narrowing the app to the old
-- three would instead have meant deleting the ม.1–3 and ปวช./ปวส. options.
--
-- The domain below is generated from GRADE_LEVELS in lib/profile/gradeLevels.ts.
-- That test asserts this file and that file hold the same five values, so the
-- database and the wizard cannot drift apart again.
--
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Drop the old constraint FIRST ────────────────────────────────────────
-- Order is load-bearing, and getting it wrong is why this migration failed
-- every time it was run:
--
--   ERROR: 23514: new row for relation "profiles" violates check constraint
--          "profiles_grade_level_check"
--   DETAIL: Failing row contains (..., M4-M6, ...)
--
-- The rewrite below writes 'M4-M6', and the OLD constraint — which admits only
-- ('M4','M5','M6','uni','graduate') — rejects exactly that value. CHECK
-- constraints are evaluated on UPDATE, not just INSERT, so step 2 aborted the
-- whole transaction before ever reaching the DROP that would have permitted it.
-- The migration was unrunnable as written and left no trace but a failed query.
--
-- Dropping first is safe because every statement here is inside one
-- transaction: there is no instant at which another session can observe the
-- table unconstrained, and a failure anywhere rolls back to the old constraint.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_grade_level_check;

-- ── 2. Retire the single-year secondary values ──────────────────────────────
-- 'M4'/'M5'/'M6' are vocabulary A. One production row holds 'M6', written by
-- the /profile edit page. The recommender buckets 'M6' and 'M4-M6' identically
-- (high_school), so this changes nobody's matches — it collapses two spellings
-- of one answer into the one the wizard now stores.
UPDATE public.profiles
   SET grade_level = 'M4-M6'
 WHERE grade_level IN ('M4', 'M5', 'M6');

-- ── 3. Normalise blanks to NULL ─────────────────────────────────────────────
-- '' is not an answer; it is the absence of one, and the new constraint rejects
-- it explicitly so it can never masquerade as a stored grade.
UPDATE public.profiles
   SET grade_level = NULL
 WHERE grade_level = '';

-- ── 4. The canonical domain ─────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_grade_level_check
  CHECK (grade_level IS NULL OR grade_level IN (
    'M1-M3',
    'M4-M6',
    'vocational',
    'uni',
    'graduate'
  ));

COMMENT ON COLUMN public.profiles.grade_level IS
  'Canonical set: M1-M3 | M4-M6 | vocational | uni | graduate. '
  'Generated from GRADE_LEVELS in lib/profile/gradeLevels.ts — change both, '
  'or __tests__/profileSetup.e2e.test.ts fails. NULL = not yet answered.';

-- ── 5. profile_baselines carries the same vocabulary ────────────────────────
-- It is an immutable research snapshot with no CHECK, so nothing was rejected
-- there. Its values still have to be readable alongside the profiles they
-- mirror, so the same collapse is applied. Row count is small and this is the
-- only rewrite this table will receive.
DO $baseline$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profile_baselines'
      AND column_name = 'grade_level'
  ) THEN
    UPDATE public.profile_baselines
       SET grade_level = 'M4-M6'
     WHERE grade_level IN ('M4', 'M5', 'M6');
  END IF;
END
$baseline$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY (run manually after applying)
-- ═════════════════════════════════════════════════════════════════════════════
--
--   SELECT pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conname = 'profiles_grade_level_check';
--   -- expect the five canonical values, and no 'M4'/'M5'/'M6'
--
--   SELECT grade_level, COUNT(*) FROM public.profiles GROUP BY 1 ORDER BY 2 DESC;
--   -- expect no 'M4'/'M5'/'M6' and no ''
--
-- Then walk the wizard choosing ม.4–6 and confirm it saves.
