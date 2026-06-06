-- ════════════════════════════════════════════════════════════════════════════
-- TunDee — Fix: Unique constraint required for save/upsert
-- Run in Supabase SQL Editor if scholarships aren't saving correctly
-- ════════════════════════════════════════════════════════════════════════════

-- Ensure unique constraint exists so upsert on (user_id, scholarship_id) works.
-- Safe to run multiple times — IF NOT EXISTS prevents duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_scholarship
  ON public.applications(user_id, scholarship_id);

-- Also add the checklist_progress column if it's missing
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS checklist_progress INTEGER[] DEFAULT '{}';

-- Verify: list indexes on applications table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'applications'
ORDER BY indexname;
