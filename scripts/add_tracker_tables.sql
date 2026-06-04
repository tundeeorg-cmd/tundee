-- ════════════════════════════════════════════════════════════════
-- TunDee — Applications / Tracker tables
-- Run this in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- Step 1: Create applications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.applications (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scholarship_id      UUID REFERENCES public.scholarships(id) ON DELETE CASCADE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'viewing'
                        CHECK (status IN ('viewing','started','in_progress','submitted','won','lost','no_reply')),
  checklist_progress  INTEGER[] NOT NULL DEFAULT '{}',
  clicked_through_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Add missing columns if table already existed
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS checklist_progress INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clicked_through_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Step 3: Unique constraint so upsert works on (user_id, scholarship_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique
  ON public.applications(user_id, scholarship_id);

-- Step 4: Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_applications_user
  ON public.applications(user_id);

CREATE INDEX IF NOT EXISTS idx_applications_scholarship
  ON public.applications(scholarship_id);

-- Step 5: Row Level Security
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own applications only
DROP POLICY IF EXISTS "Users manage own applications" ON public.applications;
CREATE POLICY "Users manage own applications"
  ON public.applications
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 6: updated_at auto-trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_updated_at ON public.applications;
CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Step 7: Recommendations table (used by matching engine logging)
CREATE TABLE IF NOT EXISTS public.recommendations (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scholarship_id          UUID REFERENCES public.scholarships(id) ON DELETE CASCADE NOT NULL,
  score_raw               NUMERIC(5,4),
  score_fairness_adjusted NUMERIC(5,4),
  rank                    INTEGER,
  reasons_json            JSONB,
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendations_unique
  ON public.recommendations(user_id, scholarship_id);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own recommendations" ON public.recommendations;
CREATE POLICY "Users read own recommendations"
  ON public.recommendations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 8: Verify
SELECT
  (SELECT COUNT(*) FROM public.applications)     AS total_applications,
  (SELECT COUNT(*) FROM public.recommendations)  AS total_recommendations;
