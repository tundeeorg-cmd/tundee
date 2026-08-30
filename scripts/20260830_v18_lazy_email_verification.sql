-- TunDee v18 — lazy email verification
--
-- Email + password signup creates an active account with no email round trip,
-- so an address is unverified by default and nothing in the product cares.
-- The one thing that does care is deadline reminder mail: sending to addresses
-- nobody has proved they own is what wrecks a sending domain's reputation.
--
-- Two columns, both defaulting to the safe answer:
--   email_reminders_opt_in  FALSE — we do not mail people who did not ask
--   email_verified_at       NULL  — nobody is verified until they tap the link
--
-- Distinct from tracked_scholarship.reminder_opt_in, which is per-scholarship
-- and drives LINE. This one is per-account and drives email.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_reminders_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at      timestamptz;

COMMENT ON COLUMN public.profiles.email_reminders_opt_in IS
  'Student asked for deadline reminders by email. Set at /tracker. Independent of tracked_scholarship.reminder_opt_in, which drives LINE.';
COMMENT ON COLUMN public.profiles.email_verified_at IS
  'When the student confirmed their address by tapping the link sent on reminder opt-in. NULL means unverified, which blocks reminder mail and nothing else.';

-- The reminder cron filters on both columns on every run.
CREATE INDEX IF NOT EXISTS idx_profiles_email_reminders
  ON public.profiles (email_reminders_opt_in)
  WHERE email_reminders_opt_in = true;
