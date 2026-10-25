-- ═════════════════════════════════════════════════════════════════════════════
-- v30 — LOCK THE RESEARCH VIEWS: service role only        >>> RUN THIS FIRST <<<
--
-- NOT RUN. Small, reversible, and urgent.
--
-- WHAT WAS FOUND (26 Oct 2026, count-only requests with the public anon key; no row was
-- read). The views below were created without any GRANT/REVOKE, and on Supabase a view
-- in `public` is readable by `anon` and `authenticated` by default. A view runs with its
-- OWNER's rights, so row-level security on the tables underneath does not apply to it.
-- The anon key is public (it ships in every page), so anyone could read:
--
--   v_research_export          24,690 rows  pseudonymised events + each consented
--                                           student's region, income band, birth year, GPA
--   v_research_population          21 rows  RAW user_id + ranking_variant (the real arm)
--   research_user_outcomes         40 rows  RAW user_id + the (legacy) arm + GPA, province,
--                                           income, welfare card + whether they clicked through;
--                                           the view does not filter on consent at all
--   v_funnel_*, v_recruitment_progress      aggregates, some by arm
--
-- Consequences: (1) personal data of consenting students — and of students who never
-- consented — readable by the public; (2) the sha256 "pseudonym" in v_research_export is
-- reversible by anyone, because the raw user_ids sit in the other two views; (3) an
-- outcome-by-arm view is public, which the pre-registration forbids before the stopping
-- point (PREREG §8, §12.8). Whether anyone has read them is not known; the API has no
-- request log on this plan.
--
-- WHAT THIS DOES: revokes SELECT on each named view from PUBLIC, anon and authenticated
-- and grants it to service_role only. Nothing else is touched: no table, no data, no
-- constraint, no function. Every route in the app that reads these views uses the
-- service role (checked: recruitment, outcomes, export), so nothing breaks.
--
-- NOT DONE HERE: the admin_* views (admin_summary, admin_province_stats,
-- admin_top_scholarships, admin_daily_*) are read by /admin from the BROWSER with the
-- signed-in user's session, so revoking them would break that page. They are aggregates
-- (counts), a smaller exposure; the fix is to move /admin to a server route first.
--
-- ROLLBACK: GRANT SELECT ON public.<view> TO anon, authenticated;  (do not, unless the
-- data is meant to be public)
-- ═════════════════════════════════════════════════════════════════════════════

-- PART 1 — read-only: which views can the public read right now?
SELECT c.relname AS view_name,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_users_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('v', 'm')
ORDER BY (has_table_privilege('anon', c.oid, 'SELECT')) DESC, c.relname;

-- PART 2 — lock them. Views that do not exist yet are skipped, not an error.
DO $lock$
DECLARE
  v      TEXT;
  locked TEXT[] := '{}';
  absent TEXT[] := '{}';
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_research_export', 'v_event_research_export', 'v_research_population', 'v_recruitment_progress',
    'v_funnel_conversion', 'v_funnel_by_region', 'v_funnel_by_income', 'v_funnel_by_school_type',
    'v_event_conversion', 'v_event_by_arm',
    'research_ctr_by_arm', 'research_ctr_by_province_arm', 'research_ctr_by_income_arm',
    'research_user_outcomes', 'v_outcomes_research', 'v_admin_outcomes',
    'research_attrition', 'research_export'
  ] LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      absent := absent || v;
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
      locked := locked || v;
    END IF;
  END LOOP;
  RAISE NOTICE 'v30 locked: %', array_to_string(locked, ', ');
  RAISE NOTICE 'v30 not present (skipped): %', COALESCE(array_to_string(absent, ', '), '(none)');
END
$lock$;

-- PART 3 — verify (read-only). anon_can_read must be false for every row below.
SELECT c.relname AS view_name,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_users_can_read,
       has_table_privilege('service_role',  c.oid, 'SELECT') AS service_role_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('v', 'm')
  AND (c.relname LIKE 'research%' OR c.relname LIKE 'v\_%' ESCAPE '\')
ORDER BY c.relname;
