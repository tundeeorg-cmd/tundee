-- Public scholarship counts, computed in SQL. Called by lib/scholarships/counts.ts.
--
-- Same rule as lib/scholarships/publicRule.ts (PUBLIC_STATUSES) and the display gate:
-- a scholarship is public iff status_effective is Opening Soon, Open or Closing Soon.
-- Verification status does not gate visibility.
--
-- SECURITY INVOKER (the default): anon reads through the existing
-- "Public read td_scholarships" policy (is_displayed = true), exactly the rows a
-- visitor can browse. Returns counts only. Table RLS is unchanged.
--
-- Funder key: Funder EN, falling back to Funder TH, then the legacy funder column;
-- trimmed and case-insensitive. Blank funders are not counted.
--
-- Idempotent. Apply in the Supabase SQL editor.

create or replace function public.get_public_scholarship_stats()
returns table (scholarships bigint, funders bigint)
language sql
stable
set search_path = public
as $$
  select
    count(*) as scholarships,
    count(distinct lower(coalesce(
      nullif(trim(funder_en), ''),
      nullif(trim(funder_th), ''),
      nullif(trim(funder), '')
    ))) as funders
  from td_scholarships
  where status_effective in ('Opening Soon', 'Open', 'Closing Soon');
$$;

revoke all on function public.get_public_scholarship_stats() from public;
grant execute on function public.get_public_scholarship_stats() to anon, authenticated;

-- Check: should equal the Admin "Displayed" card and the homepage.
-- select * from public.get_public_scholarship_stats();
