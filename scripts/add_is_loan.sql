-- Safe migration: add is_loan column to scholarships table
-- This script is idempotent — safe to re-run

ALTER TABLE scholarships
  ADD COLUMN IF NOT EXISTS is_loan BOOLEAN NOT NULL DEFAULT FALSE;

-- Verify the column exists
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'scholarships' AND column_name = 'is_loan';
