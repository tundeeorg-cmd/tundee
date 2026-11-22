-- v36 — lock down views that Supabase flags as UNRESTRICTED
--
-- WHY
-- These ten views run with their owner's rights (no security_invoker), so row
-- level security on the tables underneath does not apply to them. Any holder of
-- the public anon key (it ships in the browser bundle as NEXT_PUBLIC_…ANON_KEY)
-- could select from them through the REST API, including admin_recent_users
-- and the research panels. Participants include minors (PREREG §12.5).
--
-- SAFE TO RUN
-- No code under app/, components/ or lib/ reads any of these views. The service
-- role and the SQL editor keep full access; only the anon and authenticated
-- API roles lose it. Same pattern as v23, v24 and v28.
--
-- CHECK AFTERWARDS
-- Table Editor should no longer show UNRESTRICTED on these views, and
--   SELECT grantee, table_name FROM information_schema.role_table_grants
--   WHERE table_name IN (…the ten views…) AND grantee IN ('anon','authenticated');
-- should return no rows.

REVOKE ALL ON
  public.admin_daily_activity,
  public.admin_field_stats,
  public.admin_income_stats,
  public.admin_monthly_summary,
  public.admin_recent_users,
  public.admin_weekly_summary,
  public.research_did_panel,
  public.research_iv_instrument,
  public.research_psm_users,
  public.research_rd_gpa_cutoffs
FROM anon, authenticated;
