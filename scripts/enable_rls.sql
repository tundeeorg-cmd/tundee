-- ════════════════════════════════════════════════════════════════
-- TunDee — Row Level Security (run once in Supabase SQL Editor)
-- ════════════════════════════════════════════════════════════════
-- WARNING: After running this, all frontend queries using the anon
-- key are automatically filtered. Service-role key bypasses RLS.
-- ════════════════════════════════════════════════════════════════

-- ── Profiles ────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop before recreating to avoid "already exists" errors
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Applications ─────────────────────────────────────────────────
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own applications"   ON public.applications;
DROP POLICY IF EXISTS "Users can insert own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can update own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can delete own applications" ON public.applications;

CREATE POLICY "Users can view own applications"
  ON public.applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON public.applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON public.applications FOR DELETE
  USING (auth.uid() = user_id);

-- ── Recommendations ──────────────────────────────────────────────
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recommendations"   ON public.recommendations;
DROP POLICY IF EXISTS "Users can insert own recommendations" ON public.recommendations;

CREATE POLICY "Users can view own recommendations"
  ON public.recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recommendations"
  ON public.recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Scholarships (public read, service-role write) ───────────────
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active scholarships" ON public.scholarships;
DROP POLICY IF EXISTS "Anyone can view active scholarships" ON public.scholarships;
DROP POLICY IF EXISTS "Public read scholarships" ON public.scholarships;

-- Use IS NOT FALSE so scholarships with is_active = NULL are also readable
CREATE POLICY "Public read active scholarships"
  ON public.scholarships FOR SELECT
  USING (is_active IS NOT FALSE);

-- ── Verify counts after enabling RLS ─────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.scholarships WHERE is_active = TRUE) AS active_scholarships,
  (SELECT COUNT(*) FROM public.profiles)                            AS profiles,
  (SELECT COUNT(*) FROM public.applications)                        AS applications;
