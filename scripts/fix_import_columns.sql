-- Run this in Supabase SQL Editor before testing import.
-- All ADD COLUMN statements are safe to re-run (IF NOT EXISTS).

ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS is_loan               BOOLEAN  DEFAULT FALSE;
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS funder_name_en        TEXT;
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS amount_type           TEXT     DEFAULT 'annual';
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS grade_levels          TEXT[]   DEFAULT '{}';
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS enrolled_university_required TEXT;
ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS description_en        TEXT;

-- Verify all columns are present
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'scholarships'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'scholarships';
