-- ═════════════════════════════════════════════════════════════════════════════
-- v32 — lock the admin_* views to the service role
--
-- NOT RUN. Run it AFTER the code that reads them from the server is deployed
-- (/api/admin/analytics; the /admin Analytics tab calls it instead of reading the views
-- from the browser). Run before that deploy and the Analytics tab shows zeros and an
-- error until the deploy lands; nothing else breaks.
--
-- WHY. v30 locked the research views but left these five: /admin read them from the
-- browser with the signed-in user's session, so locking them would have broken the page.
-- Until now they were readable by any visitor holding the public anon key (counts only —
-- totals, new users per day, top scholarships, users per province — but not meant to be
-- public).
--
-- WHAT. Revokes SELECT from PUBLIC, anon and authenticated, grants it to service_role.
-- Privileges only; no table, data, constraint or function is touched. Views that do not
-- exist are skipped.
--
-- ROLLBACK: GRANT SELECT ON public.<view> TO anon, authenticated;
-- ═════════════════════════════════════════════════════════════════════════════

-- PART 1 — read-only: who can read them now?
SELECT c.relname AS view_name,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_users_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('v', 'm') AND c.relname LIKE 'admin\_%' ESCAPE '\'
ORDER BY c.relname;

-- PART 2 — lock them
DO $lock$
DECLARE
  v      TEXT;
  locked TEXT[] := '{}';
  absent TEXT[] := '{}';
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'admin_summary', 'admin_daily_signups', 'admin_daily_active',
    'admin_top_scholarships', 'admin_province_stats'
  ] LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      absent := absent || v;
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
      locked := locked || v;
    END IF;
  END LOOP;
  RAISE NOTICE 'v32 locked: %', array_to_string(locked, ', ');
  RAISE NOTICE 'v32 not present (skipped): %', COALESCE(array_to_string(absent, ', '), '(none)');
END
$lock$;

-- PART 3 — verify (read-only): anon_can_read must be false on every row.
SELECT c.relname AS view_name,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_users_can_read,
       has_table_privilege('service_role',  c.oid, 'SELECT') AS service_role_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('v', 'm') AND c.relname LIKE 'admin\_%' ESCAPE '\'
ORDER BY c.relname;

-- ── Separate, read-only, NOT changed here: platform_rollouts ──────────────────
-- A table, not a view. 5 rows are readable with the public anon key, through a row-level
-- security policy. It is created by no script in this repository and nothing in the app
-- reads it. Look before deciding: what is in it, and which policy lets the public read it?
--   select * from public.platform_rollouts;
--   select policyname, roles, cmd, qual from pg_policies where tablename = 'platform_rollouts';
