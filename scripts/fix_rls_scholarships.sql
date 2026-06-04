-- ════════════════════════════════════════════════════════════════
-- FIX: Scholarships showing 0 results on tundee.org
--
-- Root cause: RLS policy uses `is_active = true` but imported
-- scholarships have is_active = NULL, which fails the check.
--
-- Run this in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- Step 1: Mark all existing scholarships as active
UPDATE public.scholarships
SET is_active = TRUE
WHERE is_active IS NULL;

-- Step 2: Add is_active column if it doesn't exist yet
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Step 3: Replace the RLS policy so NULL rows pass through
DROP POLICY IF EXISTS "Public read scholarships" ON public.scholarships;

CREATE POLICY "Public read scholarships"
  ON public.scholarships
  FOR SELECT
  USING (is_active IS NOT FALSE);

-- Step 4: Verify — should return 34 (or however many you imported)
SELECT COUNT(*) AS visible_scholarships FROM public.scholarships WHERE is_active IS NOT FALSE;

-- Step 5: Also add profile columns if not yet done
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
