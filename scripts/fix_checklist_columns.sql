-- ============================================================
-- fix_checklist_columns.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- REQUIRED before the checklist will save.
-- The unique index on (user_id, scholarship_id) is what
-- makes upsert with onConflict work. Without it every
-- .upsert({ onConflict: 'user_id,scholarship_id' }) fails
-- silently and nothing gets saved.
-- ============================================================


-- ── STEP 1: Add missing columns ──────────────────────────────

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS checklist_progress  INTEGER[]   DEFAULT '{}';

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS checklist_dates     JSONB       DEFAULT '{}';

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS clicked_through_at  TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS outcome_at          TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS outcome_source      TEXT;


-- ── STEP 2: Unique index (CRITICAL for upsert onConflict) ────

CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_user_scholarship
  ON applications(user_id, scholarship_id);


-- ── STEP 3: Enable RLS ───────────────────────────────────────

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;


-- ── STEP 4: Drop old policies ────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own applications" ON applications;
DROP POLICY IF EXISTS "Users can update own applications" ON applications;
DROP POLICY IF EXISTS "Users can view own applications"  ON applications;
DROP POLICY IF EXISTS "Users can delete own applications" ON applications;
DROP POLICY IF EXISTS "apps_select" ON applications;
DROP POLICY IF EXISTS "apps_insert" ON applications;
DROP POLICY IF EXISTS "apps_update" ON applications;
DROP POLICY IF EXISTS "apps_delete" ON applications;


-- ── STEP 5: Recreate policies ────────────────────────────────

CREATE POLICY "apps_select"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "apps_insert"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "apps_update"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "apps_delete"
  ON applications FOR DELETE
  USING (auth.uid() = user_id);


-- ── STEP 6: Grant permissions ────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON applications TO authenticated;


-- ── STEP 7: Verify ───────────────────────────────────────────

SELECT 'columns' AS check_type,
       column_name,
       data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'applications'
ORDER  BY ordinal_position;

SELECT 'rls_policies' AS check_type,
       policyname,
       cmd
FROM   pg_policies
WHERE  tablename = 'applications';

SELECT 'unique_indexes' AS check_type,
       indexname
FROM   pg_indexes
WHERE  tablename = 'applications'
  AND  indexname LIKE '%user_scholarship%';
