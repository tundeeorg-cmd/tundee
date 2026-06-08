-- ============================================================
-- fix_profiles_rls.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- Fixes:
--   1. Adds any missing columns the profile setup wizard writes
--   2. Drops and recreates RLS policies to allow INSERT + UPDATE
--      so the upsert in /profile/setup works correctly
-- ============================================================


-- ── STEP 1: Add missing columns ──────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grade_level         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gpa                 DECIMAL(3,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS province_id         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_bracket      INTEGER  DEFAULT 4;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welfare_card        BOOLEAN  DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fields_of_interest  TEXT[]   DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();


-- ── STEP 2: Enable RLS (idempotent) ─────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ── STEP 3: Drop old policies (so we can recreate cleanly) ───

DROP POLICY IF EXISTS "profiles_select_own"     ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"     ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"     ON profiles;
DROP POLICY IF EXISTS "Users can view own profile"   ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can upsert own profile" ON profiles;


-- ── STEP 4: Recreate policies ────────────────────────────────

-- SELECT: users can read their own row
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- INSERT: users can create their own row (needed for first-time setup)
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- UPDATE: users can update their own row
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ── STEP 5: Grant table permissions ─────────────────────────

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;


-- ── STEP 6: Verify ───────────────────────────────────────────

SELECT 'columns:' AS check_type,
       column_name,
       data_type,
       is_nullable,
       column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'profiles'
ORDER  BY ordinal_position;

SELECT 'rls_policies:' AS check_type,
       policyname,
       cmd
FROM   pg_policies
WHERE  tablename = 'profiles';

SELECT 'row_count:' AS check_type,
       COUNT(*)::TEXT AS value
FROM   profiles;
