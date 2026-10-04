-- ═════════════════════════════════════════════════════════════════════════════
-- v23 — give existing LINE accounts their `custom:line` identity
--
-- WHY
-- ───
-- LINE sign-in is moving to Supabase's custom provider `custom:line`
-- (lib/line/authMode.ts). Supabase finds the account to sign someone into by
-- auth.identities (provider, provider_id). The accounts created by the old
-- bridge have no such row — only profiles.line_user_id — so without this, every
-- returning LINE student would get a second, empty account on their next
-- sign-in.
--
-- This adds one auth.identities row per profile that has a line_user_id:
-- provider 'custom:line', provider_id = the LINE user id. On their next LINE
-- sign-in Supabase finds that row and signs them into the account they already
-- have. Nothing is deleted or renamed; placeholder emails stay where they are.
--
-- Writing to auth.* is not an official API, but it is plain DML on the tables
-- GoTrue reads, and every row this adds is recorded in public.v23_line_identity_migration
-- so the ROLLBACK block below removes exactly those rows and nothing else.
--
-- HOW TO RUN (Supabase SQL editor)
-- ─────────────────────────────────
--   1. PREFLIGHT: select sections 0 and 1 only and "Run selected". Read-only.
--      Every row should be 'ready'. 'duplicate' means a custom:line account for
--      that LINE id already exists (a test sign-in, or someone who signed in
--      after the switch) — merge or delete that account first; this script
--      skips it.
--   2. TRIAL: set only_line_user_id in section 0 to ONE LINE id and run the
--      whole file, then sign in with that LINE account and confirm it lands in
--      the old account.
--   3. FULL RUN: set only_line_user_id back to NULL and run the whole file.
--   4. Only then set LINE_AUTH_MODE=supabase in Vercel.
--
-- Idempotent: re-running adds nothing that is already there.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── 0. Config ────────────────────────────────────────────────────────────────
-- NULL = every LINE account. A LINE id ('U…') = just that one (the trial).
DROP TABLE IF EXISTS pg_temp.v23_config;
CREATE TEMP TABLE v23_config AS SELECT NULL::text AS only_line_user_id;


-- ── 1. Preflight (read-only) ─────────────────────────────────────────────────
SELECT p.id                                   AS user_id,
       p.line_user_id,
       u.email,
       CASE
         WHEN i.user_id IS NULL      THEN 'ready'
         WHEN i.user_id = p.id       THEN 'already_done'
         ELSE                             'duplicate'
       END                                    AS status,
       i.user_id                              AS custom_line_account
FROM   public.profiles p
JOIN   auth.users u        ON u.id = p.id
LEFT   JOIN auth.identities i
       ON i.provider = 'custom:line' AND i.provider_id = p.line_user_id
WHERE  p.line_user_id IS NOT NULL
ORDER  BY status, u.created_at;


-- ── 2. Apply ─────────────────────────────────────────────────────────────────
BEGIN;

-- The record of what this script added, so the rollback is exact. Not readable
-- through the API: RLS on with no policies, and no grants to client roles.
CREATE TABLE IF NOT EXISTS public.v23_line_identity_migration (
  identity_id   uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL,
  line_user_id  text        NOT NULL,
  migrated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v23_line_identity_migration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v23_line_identity_migration FROM anon, authenticated;

WITH targets AS (
  SELECT p.id AS user_id, p.line_user_id, u.raw_user_meta_data AS meta
  FROM   public.profiles p
  JOIN   auth.users u ON u.id = p.id
  WHERE  p.line_user_id IS NOT NULL
    AND  ((SELECT only_line_user_id FROM v23_config) IS NULL
          OR p.line_user_id = (SELECT only_line_user_id FROM v23_config))
    AND  NOT EXISTS (SELECT 1 FROM auth.identities i
                     WHERE i.provider = 'custom:line' AND i.provider_id = p.line_user_id)
),
added AS (
  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(),
         t.line_user_id,
         t.user_id,
         -- What GoTrue's userinfo mapping would store. It is refreshed from
         -- LINE on the student's next sign-in either way.
         jsonb_strip_nulls(jsonb_build_object(
           'sub',     t.line_user_id,
           'name',    t.meta->>'full_name',
           'picture', t.meta->>'avatar_url'
         )),
         'custom:line',
         NULL, now(), now()
  FROM targets t
  RETURNING id, user_id, provider_id
)
INSERT INTO public.v23_line_identity_migration (identity_id, user_id, line_user_id)
SELECT id, user_id, provider_id FROM added;

-- Label the accounts: add custom:line to app_metadata.providers (the dashboard's
-- Providers column). app_metadata.provider is left as it is.
UPDATE auth.users u
SET    raw_app_meta_data = jsonb_set(
         COALESCE(u.raw_app_meta_data, '{}'::jsonb),
         '{providers}',
         COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb) || '["custom:line"]'::jsonb
       )
FROM   public.v23_line_identity_migration m
WHERE  m.user_id = u.id
  AND  NOT COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'custom:line';

COMMIT;


-- ── 3. Verify (read-only) ────────────────────────────────────────────────────
-- Expect: every profile with a line_user_id has exactly one custom:line
-- identity, on its own account. Any row here is a problem.
SELECT p.id, p.line_user_id, i.user_id AS identity_owner
FROM   public.profiles p
LEFT   JOIN auth.identities i
       ON i.provider = 'custom:line' AND i.provider_id = p.line_user_id
WHERE  p.line_user_id IS NOT NULL
  AND  ((SELECT only_line_user_id FROM v23_config) IS NULL
        OR p.line_user_id = (SELECT only_line_user_id FROM v23_config))
  AND  (i.user_id IS NULL OR i.user_id <> p.id);

SELECT count(*) AS identities_added_by_v23 FROM public.v23_line_identity_migration;


-- ── ROLLBACK (run on its own, only if needed) ────────────────────────────────
-- Removes exactly the identities this script added, and the label. Accounts
-- that have since signed in through custom:line will, on their next sign-in,
-- be treated as new LINE users again — so roll back BEFORE switching
-- LINE_AUTH_MODE back to bridge, not after weeks of use.
--
-- BEGIN;
--   UPDATE auth.users u
--   SET    raw_app_meta_data = jsonb_set(u.raw_app_meta_data, '{providers}',
--            (u.raw_app_meta_data->'providers') - 'custom:line')
--   FROM   public.v23_line_identity_migration m
--   WHERE  m.user_id = u.id;
--   DELETE FROM auth.identities i
--   USING  public.v23_line_identity_migration m
--   WHERE  i.id = m.identity_id;
--   DROP TABLE public.v23_line_identity_migration;
-- COMMIT;
