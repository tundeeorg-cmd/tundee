-- ════════════════════════════════════════════════════════════════
-- TunDee — Tracker support (run in Supabase SQL Editor after deploy)
-- ════════════════════════════════════════════════════════════════

-- Unique constraint so upsert on (user_id, scholarship_id) works
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_scholarship
  ON public.applications(user_id, scholarship_id);

-- Checklist progress column
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS checklist_progress INTEGER[] DEFAULT '{}';

-- Indexes for fast tracker queries
CREATE INDEX IF NOT EXISTS idx_applications_user_status
  ON public.applications(user_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_user_id
  ON public.applications(user_id);

-- Verify counts
SELECT
  (SELECT COUNT(*) FROM public.scholarships)   AS scholarship_count,
  (SELECT COUNT(*) FROM public.profiles)       AS profile_count,
  (SELECT COUNT(*) FROM public.applications)   AS application_count;
