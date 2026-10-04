-- ═════════════════════════════════════════════════════════════════════════════
-- v22 — profiles.line_user_id / line_linked_at: server-only
--
-- WHY
-- ───
-- LINE sign-in (app/api/auth/line/callback) finds the account to sign someone
-- into by profiles.line_user_id. Until now any signed-in user could write that
-- column on their own row: the table grants UPDATE to `authenticated` and the
-- RLS policy only checks auth.uid() = id. Writing another student's LINE id
-- onto your own profile would send that student, on their next LINE sign-in,
-- into YOUR account. The column is UNIQUE, so it only works against someone
-- who has not linked yet — which is every new LINE signup.
--
-- Checked on production 2026-10-04: anon and authenticated both hold INSERT
-- and UPDATE on these columns, and no trigger guarded them.
--
-- WHY A TRIGGER, NOT A REVOKE
-- ───────────────────────────
-- A column-level REVOKE does nothing while the table-level UPDATE grant stands,
-- so the revoke would have to replace the table grant with an explicit list of
-- every other column — and silently freeze any column added later. The trigger
-- names only the two columns it protects.
--
-- WHO MAY STILL WRITE THEM
-- ────────────────────────
-- Any role other than anon/authenticated: service_role (every server route
-- that writes them — the sign-in callback, /api/line/callback, /api/line/unlink
-- and the webhook all use the service role as of this change) and postgres
-- (SQL editor). Deploy the code change BEFORE running this, or bot linking and
-- unlinking fail until it lands.
--
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_profile_line_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.line_user_id IS NOT NULL OR NEW.line_linked_at IS NOT NULL THEN
      RAISE EXCEPTION 'line_user_id and line_linked_at are set by the server only'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.line_user_id   IS DISTINCT FROM OLD.line_user_id
     OR NEW.line_linked_at IS DISTINCT FROM OLD.line_linked_at THEN
    RAISE EXCEPTION 'line_user_id and line_linked_at are set by the server only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_profile_line_columns() IS
  'Rejects writes to profiles.line_user_id/line_linked_at from anon/authenticated. '
  'LINE sign-in resolves accounts by line_user_id, so it must only be written server-side. See v22.';

DROP TRIGGER IF EXISTS trg_protect_profile_line_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_line_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_line_columns();

COMMIT;

-- ── Verify (read-only) ────────────────────────────────────────────────────────
-- Expect one row: trg_protect_profile_line_columns, enabled 'O'.
SELECT tgname, tgenabled
FROM   pg_trigger
WHERE  tgrelid = 'public.profiles'::regclass
  AND  tgname  = 'trg_protect_profile_line_columns';

-- Attack replay. Run this block on its own. Expect: ERROR 42501 "set by the
-- server only". It impersonates the owner of one unlinked profile — the claims
-- must carry a real uid, or RLS matches no row, the trigger never fires and the
-- UPDATE "succeeds" on zero rows, proving nothing. ROLLBACK means nothing is
-- written either way.
-- BEGIN;
--   SELECT set_config('request.jwt.claims', json_build_object(
--     'sub',  (SELECT id FROM public.profiles WHERE line_user_id IS NULL LIMIT 1),
--     'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   UPDATE public.profiles SET line_user_id = 'Uv22_check' WHERE id = auth.uid();
-- ROLLBACK;
