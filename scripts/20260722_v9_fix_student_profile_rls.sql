-- ═════════════════════════════════════════════════════════════════════════════
-- v9 — Fix "permission denied for table users" on student_profile
--
-- ROOT CAUSE
-- ──────────
-- scripts/add_research_v2.sql created a second, broader policy alongside the
-- correct "student_profile: own read/write" policy:
--
--   CREATE POLICY "student_profile: admin read"
--     ON public.student_profile FOR SELECT
--     USING (
--       EXISTS (
--         SELECT 1 FROM public.profiles p
--         WHERE p.id = auth.uid()
--         AND p.id IN (
--           SELECT id FROM auth.users          -- <-- direct auth.users read
--           WHERE email IN (SELECT unnest(string_to_array(
--             current_setting('app.admin_emails', TRUE), ',')))
--         )
--       )
--     );
--
-- `auth.users` is not exposed to the `authenticated` Postgres role (Supabase
-- only exposes it indirectly via the SECURITY DEFINER functions auth.uid()
-- and auth.jwt()). Postgres evaluates every applicable permissive policy for
-- a given command and OR's the results — it does not short-circuit once one
-- policy already grants access. So a normal user's own SELECT against
-- student_profile still had to evaluate the admin-read policy's subquery,
-- which throws "permission denied for table users" before the "own
-- read/write" policy's grant ever gets a chance to matter. That's why the
-- row owner's own GET failed with 403, and why the POST /api/profile/student
-- upsert failed with 500 — an upsert(...).select() performs an implicit
-- SELECT of the written row to return it, which hits the same broken policy.
--
-- The identical pattern also exists on public.event ("event: admin select",
-- added in 20260719_research_tables_v3.sql) — same bug, not yet triggered in
-- production because nothing currently reads `event` through the
-- authenticated/anon role, but it is a live landmine and is fixed here too.
--
-- Neither policy is actually needed: every current admin-facing read of
-- student_profile (app/api/research/export/route.ts) and event
-- (app/api/line/webhook/route.ts, service-side inserts) already goes through
-- the service-role key, which bypasses RLS entirely. So these policies have
-- no legitimate caller today — they only ever fired (and broke) on ordinary
-- user requests. Dropping them is a pure bug fix with no loss of admin
-- capability.
--
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove the broken auth.users-querying policies -----------------------------
DROP POLICY IF EXISTS "student_profile: admin read" ON public.student_profile;
DROP POLICY IF EXISTS "event: admin select"          ON public.event;

-- 2. Confirm student_profile.user_id can support upsert(onConflict: 'user_id') --
--    user_id is already the PRIMARY KEY (see add_research_v2.sql /
--    20260719_full_research_migration.sql), which implies a UNIQUE index, so
--    upsert-on-conflict already works correctly. No-op included only as a
--    guard in case a future schema change ever drops that constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.student_profile'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.student_profile'::regclass AND attname = 'user_id')
      ]
  ) THEN
    ALTER TABLE public.student_profile ADD CONSTRAINT student_profile_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3. Re-affirm the correct owner-scoped policy on student_profile ---------------
--    (idempotent — matches add_research_v2.sql / full_research_migration.sql;
--    recreated here defensively in case it was ever dropped without this
--    replacement landing). A single FOR ALL policy with both USING and WITH
--    CHECK covers SELECT (USING), INSERT (WITH CHECK), UPDATE (both), and
--    DELETE (USING) — equivalent to writing out three separate SELECT/
--    INSERT/UPDATE policies, with less policy sprawl to audit.
DROP POLICY IF EXISTS "student_profile: own read/write" ON public.student_profile;
CREATE POLICY "student_profile: own read/write"
  ON public.student_profile
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Re-affirm event's owner-scoped policies (unchanged, but confirmed here) ----
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event' AND policyname = 'event: insert own or anon'
  ) THEN
    CREATE POLICY "event: insert own or anon"
      ON public.event FOR INSERT
      WITH CHECK (user_id IS NULL OR user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event' AND policyname = 'event: select own'
  ) THEN
    CREATE POLICY "event: select own"
      ON public.event FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY (run manually in the Supabase SQL editor after applying)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. No policy anywhere references auth.users or public.users directly:
--
--   SELECT tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual::text ILIKE '%auth.users%' OR with_check::text ILIKE '%auth.users%'
--      OR qual::text ILIKE '%public.users%' OR with_check::text ILIKE '%public.users%');
--   -- expect: 0 rows
--
-- 2. student_profile has exactly one policy, and it's owner-scoped:
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'student_profile';
--   -- expect: one row, "student_profile: own read/write", cmd = 'ALL'
--
-- 3. Cross-user isolation (run as two different authenticated users, or via
--    `SET request.jwt.claims` in the SQL editor to simulate each uid):
--
--   -- as user A (owns row A):
--   SELECT * FROM public.student_profile WHERE user_id = '<user B uuid>';
--   -- expect: 0 rows (not a permission error — RLS silently filters, this is correct)
--
--   UPDATE public.student_profile SET gpa = 4.0 WHERE user_id = '<user B uuid>';
--   -- expect: 0 rows updated (WITH CHECK blocks it; no error, just no effect)
--
-- 4. A user CAN read/write their own row:
--
--   SELECT * FROM public.student_profile WHERE user_id = auth.uid();
--   -- expect: 1 row (or 0 if they've never saved yet — no permission error either way)
