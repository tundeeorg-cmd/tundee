-- Safe column additions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.scholarships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.scholarships ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'TARGET';

-- Make sure all existing scholarships are marked active
UPDATE public.scholarships SET is_active = TRUE WHERE is_active IS NULL;

-- Verify
SELECT 'scholarships' as table_name, COUNT(*) as rows FROM public.scholarships
UNION ALL
SELECT 'profiles', COUNT(*) FROM public.profiles;
