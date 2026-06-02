-- TunDee: Add display_name and avatar_url to profiles table
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

COMMENT ON COLUMN public.profiles.display_name IS 'User-chosen display name shown in nav and profile page';
COMMENT ON COLUMN public.profiles.avatar_url   IS 'Public URL to avatar image in Supabase Storage avatars bucket';
