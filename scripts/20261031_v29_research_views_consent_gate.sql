-- ═════════════════════════════════════════════════════════════════════════════
-- v29 — the SQL research views use the same consent test as the export route
--
-- NOT RUN. Read it, then run it in the Supabase SQL editor IN THE ORDER BELOW, and
-- send me the output of PART 2 BEFORE running PART 3.
--
-- WHY
--   The export route (/api/research/export, #62) now lets a student through only with
--   a record, a yes, a yes to the CURRENT wording, and — for a minor whose birth year
--   is known — a guardian's yes (exportExclusion() in lib/research/consentGate.ts).
--   The research views in the database still test `consent_research = TRUE` alone, so
--   anyone who analyses from them (v_research_population is "the analysis population"
--   every downstream view builds on) reads students whose consent has lapsed.
--
-- WHAT
--   PART 1  Two constants and one function, in the database. Adds objects only;
--           changes nothing that exists. Safe to run on its own.
--   PART 2  READ-ONLY. For every view in public that tests consent on student_profile:
--           its live definition and the definition this script would give it.
--   PART 3  Applies it, all-or-nothing. Every comparison `<student_profile alias>.
--           consent_research = true` becomes `(… = true AND research_export_allowed(…))`
--           and the view is re-created with CREATE OR REPLACE VIEW, so its columns,
--           owner, grants and options are unchanged. If ANY view that reads
--           student_profile cannot be rewritten, the whole thing aborts and nothing
--           is changed.
--
-- NOT TOUCHED  any table or data; any CHECK constraint; views that read a different
--           consent store (outcomes.consent_research, the LINE survey) — they are
--           listed and skipped; profiles.
--
-- ⚠ NOT TESTED against a database. The rewrite works on the text of the live
-- definitions; that is why PART 2 exists. Read its output before PART 3.
--
-- ⚠ What this does NOT fix: v_research_export (and any view built like it) still
-- labels the arm `experiment_variant` from the legacy experiment_assignment table,
-- which is not the randomization. A view cannot drop or rename a column with CREATE OR
-- REPLACE, so that needs a separate change. Do not use that column as the arm.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── PART 1 ───────────────────────────────────────────────────────────────────
-- The two values live in lib/research/consentGate.ts (CURRENT_CONSENT_VERSION,
-- MINOR_AGE_THRESHOLD). A test fails if these drift from them.

CREATE OR REPLACE FUNCTION public.research_current_consent_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-07-v1'::TEXT $$;

CREATE OR REPLACE FUNCTION public.research_minor_age_threshold()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 18 $$;

-- The same four-step test as exportExclusion(): a yes, to the current wording, and
-- a guardian's yes when the student is a minor. A NULL birth year cannot make anyone
-- a minor (as in TypeScript). The year is Bangkok's.
CREATE OR REPLACE FUNCTION public.research_export_allowed(
  p_consent     BOOLEAN,
  p_version     TEXT,
  p_guardian    BOOLEAN,
  p_birth_year  INTEGER
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_consent, FALSE)
     AND COALESCE(p_version = public.research_current_consent_version(), FALSE)
     AND (
           p_birth_year IS NULL
        OR (EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Bangkok'))::INTEGER - p_birth_year)
             >= public.research_minor_age_threshold()
        OR COALESCE(p_guardian, FALSE)
         )
$$;

COMMENT ON FUNCTION public.research_export_allowed(BOOLEAN, TEXT, BOOLEAN, INTEGER) IS
  'May this student''s data leave the system for research? Mirrors exportExclusion() in lib/research/consentGate.ts. Used by every research view.';


-- ── PART 2 — read-only preview ───────────────────────────────────────────────
-- Run this on its own and read it. `reads_student_profile = false` rows are other
-- consent stores and are skipped. `rewritten_ok = false` on a row that reads
-- student_profile means PART 3 will abort.

CREATE OR REPLACE FUNCTION pg_temp.research_alias_list(def TEXT) RETURNS TEXT[]
LANGUAGE plpgsql AS $f$
DECLARE
  m       TEXT[];
  aliases TEXT[] := ARRAY['student_profile'];
BEGIN
  FOR m IN SELECT regexp_matches(def, 'student_profile\s+(?:as\s+)?([a-z_][a-z0-9_]*)', 'gi') LOOP
    IF lower(m[1]) NOT IN ('on','where','join','left','right','inner','outer','full','cross',
                           'natural','using','group','order','limit','having','union','window')
       AND NOT (lower(m[1]) = ANY (aliases)) THEN
      aliases := aliases || lower(m[1]);
    END IF;
  END LOOP;
  RETURN aliases;
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.research_rewrite(def TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $f$
DECLARE
  a   TEXT;
  out TEXT := def;
BEGIN
  FOREACH a IN ARRAY pg_temp.research_alias_list(def) LOOP
    out := regexp_replace(
      out,
      '\y' || a || '\.consent_research\s*=\s*true\y',
      '(' || a || '.consent_research = true AND public.research_export_allowed('
          || a || '.consent_research, ' || a || '.consent_version, '
          || a || '.guardian_consent, ' || a || '.birth_year::integer))',
      'gi'
    );
  END LOOP;
  RETURN out;
END
$f$;

SELECT
  c.relname                                                        AS view_name,
  d.def ILIKE '%student_profile%'                                  AS reads_student_profile,
  pg_temp.research_rewrite(d.def) <> d.def                         AS would_change,
  pg_temp.research_rewrite(d.def) ILIKE '%research_export_allowed%' AS rewritten_ok,
  c.reloptions                                                     AS view_options,
  d.def                                                            AS live_definition,
  pg_temp.research_rewrite(d.def)                                  AS proposed_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
CROSS JOIN LATERAL (SELECT pg_get_viewdef(c.oid, true) AS def) d
WHERE c.relkind = 'v'
  AND d.def ILIKE '%consent_research%'
ORDER BY c.relname;

-- Materialized views are not rewritten by this script; list any so they are not forgotten.
SELECT c.relname AS materialized_view_to_review
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'm' AND pg_get_viewdef(c.oid, true) ILIKE '%consent_research%';


-- ── PART 3 — apply (only after PART 2 has been read) ─────────────────────────
-- One transaction: either every view that reads student_profile is rewritten, or
-- none is. (Run PART 2's two helper functions again in the same run — they are
-- session-local.)
--
-- DO $apply$
-- DECLARE
--   v        RECORD;
--   new_def  TEXT;
--   opts     TEXT;
--   changed  TEXT[] := '{}';
--   skipped  TEXT[] := '{}';
--   -- Views you have READ in PART 2 and decided need no gate — for example an admin-only
--   -- view that merely SHOWS consent_research as a column and exports nothing. Name them
--   -- here; leave empty if there are none. Anything not named here and not rewritten aborts.
--   exempt   TEXT[] := ARRAY[]::TEXT[];
-- BEGIN
--   FOR v IN
--     SELECT c.oid, c.relname, c.reloptions, pg_get_viewdef(c.oid, true) AS def
--     FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
--     WHERE c.relkind = 'v' AND pg_get_viewdef(c.oid, true) ILIKE '%consent_research%'
--   LOOP
--     IF v.def NOT ILIKE '%student_profile%' THEN
--       skipped := skipped || v.relname::TEXT;        -- a different consent store
--       CONTINUE;
--     END IF;
--
--     IF v.relname::TEXT = ANY (exempt) THEN
--       skipped := skipped || (v.relname::TEXT || ' (exempt)');
--       CONTINUE;
--     END IF;
--
--     new_def := pg_temp.research_rewrite(v.def);
--     IF new_def NOT ILIKE '%research_export_allowed%' THEN
--       RAISE EXCEPTION 'v29 aborted: % reads student_profile but its consent test was not recognised; nothing was changed', v.relname;
--     END IF;
--     IF new_def = v.def THEN CONTINUE; END IF;        -- already done (re-run)
--
--     opts := CASE WHEN v.reloptions IS NULL THEN ''
--                  ELSE ' WITH (' || array_to_string(v.reloptions, ', ') || ')' END;
--     EXECUTE format('CREATE OR REPLACE VIEW public.%I%s AS %s',
--                    v.relname, opts, regexp_replace(new_def, ';\s*$', ''));
--     changed := changed || v.relname::TEXT;
--   END LOOP;
--
--   RAISE NOTICE 'v29 rewrote: %', COALESCE(array_to_string(changed, ', '), '(none)');
--   RAISE NOTICE 'v29 skipped (different consent store): %', COALESCE(array_to_string(skipped, ', '), '(none)');
-- END
-- $apply$;
--
-- (Uncomment PART 3 to run it. It is commented out on purpose so that running this
-- file top to bottom can never apply it by accident.)

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
--   where c.relkind='v' and pg_get_viewdef(c.oid,true) ilike '%student_profile%'
--     and pg_get_viewdef(c.oid,true) ilike '%consent_research%'
--     and pg_get_viewdef(c.oid,true) not ilike '%research_export_allowed%';
--   -- expect no rows. Then compare:
--   select count(*) from public.v_research_population;   -- should not have grown

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   Views: re-run the CREATE OR REPLACE VIEW statements for the affected views from
--   scripts/add_research_v2.sql, scripts/20260719_research_tables_v3.sql and
--   scripts/20260828_v17_counterfactual_and_consent.sql (or from PART 2's
--   live_definition column, which you should save before PART 3).
--   Functions: DROP FUNCTION IF EXISTS public.research_export_allowed(BOOLEAN, TEXT, BOOLEAN, INTEGER);
--              DROP FUNCTION IF EXISTS public.research_minor_age_threshold();
--              DROP FUNCTION IF EXISTS public.research_current_consent_version();
--   (drop the functions only after restoring the views that call them)
