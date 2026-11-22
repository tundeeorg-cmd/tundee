-- ═════════════════════════════════════════════════════════════════════════════
-- v38_2 — anonymous impressions, and apply-clicks bound to anon_id
--
-- Run in the Supabase SQL editor AFTER 20261122_v38_1_anon_assignment_covariates.sql
-- and BEFORE deploying fix/start-research-data.
--
-- WHY
--   PREREG §6.1: the primary outcome is >= 1 apply_click within 14 days of
--   assignment. Since randomization moved to /start, most participants never sign
--   up, and their clicks were written with user_id NULL and nothing tying them to
--   anon_assignments: an arm with no outcome. Nor was what they were SHOWN recorded,
--   so §6.2 #4 (mean served rank of clicked scholarships) was unknowable.
--
-- WHAT
--   1. apply_click.anon_id  TEXT NULL (FK anon_assignments, ON DELETE SET NULL),
--      indexed. Written only by the server with the service role: a trigger refuses
--      any anon_id from the browser roles, which keep their existing INSERT policy
--      for anon_id-less rows (the signed-in path is unchanged).
--   2. anon_impressions  one row per card served to a randomized anonymous visitor:
--      (anon_id, scholarship_id, rank, fairness_mode, variant, broadened, surface,
--      served_at) + user_id, back-filled when the visitor signs in. Service role
--      only: RLS on, no policy, REVOKE ALL from anon and authenticated (v36 pattern).
--
-- WHY A NEW TABLE AND NOT anon_id ON funnel_events
--   funnel_events has an INSERT policy open to the anon key ("user_id IS NULL OR
--   user_id = auth.uid()"): anyone holding the public key can write rows with
--   user_id NULL. An anon_id column there could be filled by any browser with any
--   value, so an impression could be forged for someone else's assignment. A
--   service-role-only table cannot be, and it does not change who may write
--   funnel_events.
--
-- SAFE / IDEMPOTENT  IF NOT EXISTS everywhere; CREATE OR REPLACE for the function.
-- NOT TOUCHED  existing apply_click columns, constraints or policies; funnel_events.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. apply_click.anon_id ───────────────────────────────────────────────────
ALTER TABLE public.apply_click
  ADD COLUMN IF NOT EXISTS anon_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apply_click_anon_id_fkey') THEN
    ALTER TABLE public.apply_click
      ADD CONSTRAINT apply_click_anon_id_fkey FOREIGN KEY (anon_id)
      REFERENCES public.anon_assignments(anon_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apply_click_anon ON public.apply_click (anon_id, clicked_at)
  WHERE anon_id IS NOT NULL;

-- Only the server may say which anonymous participant clicked. The browser roles
-- keep their INSERT policy ("Anyone can log apply clicks") for rows without one.
CREATE OR REPLACE FUNCTION public.apply_click_anon_id_server_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.anon_id IS NOT NULL AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'apply_click.anon_id is written by the server only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_apply_click_anon_id_server_only ON public.apply_click;
CREATE TRIGGER trg_apply_click_anon_id_server_only
  BEFORE INSERT OR UPDATE OF anon_id ON public.apply_click
  FOR EACH ROW EXECUTE FUNCTION public.apply_click_anon_id_server_only();

COMMENT ON COLUMN public.apply_click.anon_id IS
  'v38: the anonymous participant (anon_assignments) who clicked, bound by /api/apply-click from the tundee_anon cookie. user_id is back-filled at sign-in.';

-- ── 2. anon_impressions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anon_impressions (
  id             BIGSERIAL   PRIMARY KEY,
  anon_id        TEXT        NOT NULL REFERENCES public.anon_assignments(anon_id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  scholarship_id TEXT        NOT NULL,
  rank           INTEGER     NOT NULL CHECK (rank >= 1),
  fairness_mode  TEXT        NOT NULL CHECK (fairness_mode IN ('on', 'off')),
  variant        TEXT        NOT NULL,
  broadened      BOOLEAN     NOT NULL DEFAULT FALSE,
  surface        TEXT        NOT NULL DEFAULT 'start_preview',
  served_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anon_impressions_lookup
  ON public.anon_impressions (anon_id, scholarship_id, served_at DESC);
CREATE INDEX IF NOT EXISTS idx_anon_impressions_user
  ON public.anon_impressions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anon_impressions_served
  ON public.anon_impressions (served_at);

ALTER TABLE public.anon_impressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anon_impressions FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.anon_impressions_id_seq FROM anon, authenticated;

COMMENT ON TABLE public.anon_impressions IS
  'v38: one row per scholarship card served to a randomized anonymous visitor on /start (rank is 1-indexed within the arm-ranked list). Service role only.';

NOTIFY pgrst, 'reload schema';

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select to_regclass('public.anon_impressions') is not null as anon_impressions,
--          exists(select 1 from information_schema.columns
--                  where table_name = 'apply_click' and column_name = 'anon_id') as apply_click_anon_id;
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'anon_impressions' and grantee in ('anon','authenticated');   -- no rows
--   -- With the ANON key these must be refused:
--   --   GET  /rest/v1/anon_impressions?select=*
--   --   POST /rest/v1/apply_click {"scholarship_id":"x","anon_id":"<any uuid>"}
--   -- After a walkthrough: one assignment, ten impressions, one click with anon_id:
--   --   select (select count(*) from anon_impressions where anon_id = '<id>') as impressions,
--   --          (select count(*) from apply_click where anon_id = '<id>') as clicks;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (drops only what this file added; deploy the previous app version first)
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP TABLE    IF EXISTS public.anon_impressions;
--   DROP TRIGGER  IF EXISTS trg_apply_click_anon_id_server_only ON public.apply_click;
--   DROP FUNCTION IF EXISTS public.apply_click_anon_id_server_only();
--   DROP INDEX    IF EXISTS public.idx_apply_click_anon;
--   ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_anon_id_fkey;
--   ALTER TABLE public.apply_click DROP COLUMN IF EXISTS anon_id;
