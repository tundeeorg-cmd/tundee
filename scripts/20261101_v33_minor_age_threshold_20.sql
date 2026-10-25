-- ═════════════════════════════════════════════════════════════════════════════
-- v33 — the guardian-consent age is 20, not 18, in the database
--
-- NOT RUN. Run it in the Supabase SQL editor when the matching code
-- (MINOR_AGE_THRESHOLD = 20 in lib/research/consentGate.ts) is deployed.
--
-- WHY
--   The project owner chose 20 on 2026-10-26 (the Civil and Commercial Code's age of
--   majority; PDPA §20). v29 PART 1 created research_minor_age_threshold() returning
--   18 and research_export_allowed(), which every research view calls.
--
-- WHAT  Two CREATE OR REPLACE FUNCTION statements; nothing else.
--   1. research_minor_age_threshold() returns 20.
--   2. research_export_allowed() treats a student as an adult only when the YEAR
--      difference EXCEEDS the threshold, as requiresGuardianConsent() now does. Only
--      the birth year is stored, so (year - birth_year) can overstate the age by one;
--      with 20, a student born in (year - 20) is still asked for a guardian, and one
--      born in (year - 21) or earlier is not. Without this, some 19-year-olds would
--      pass as adults.
--
-- EFFECT  Immediately, in every view that calls research_export_allowed():
--   research_export, v_research_export, v_event_research_export,
--   v_research_population, v_funnel_by_income / _region / _school_type.
--   A consenting student whose birth year is (year - 20) or later, and who has no
--   guardian_consent, drops out of them. Nothing is deleted. Read the counts first.
--
-- NOT TOUCHED  any table, data or view definition.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── Before (read-only): who would drop out? ──────────────────────────────────
-- Students whose consent passes TODAY and would not after this script:
SELECT
  count(*) AS would_drop_out
FROM public.student_profile sp
WHERE public.research_export_allowed(sp.consent_research, sp.consent_version, sp.guardian_consent, sp.birth_year)
  AND NOT (
        COALESCE(sp.consent_research, FALSE)
    AND COALESCE(sp.consent_version = public.research_current_consent_version(), FALSE)
    AND (
          sp.birth_year IS NULL
       OR (EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Bangkok'))::INTEGER - sp.birth_year) >= 21
       OR COALESCE(sp.guardian_consent, FALSE)
        )
  );


-- ── Apply ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.research_minor_age_threshold()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 20 $$;

-- Same four-step test as exportExclusion() in lib/research/consentGate.ts. A NULL birth
-- year cannot make anyone a minor. The year is Bangkok's.
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
             > public.research_minor_age_threshold()
        OR COALESCE(p_guardian, FALSE)
         )
$$;


-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select public.research_minor_age_threshold();                  -- 20
--   select count(*) from public.v_research_population;            -- was 21; should not have grown
--   select count(*) from public.research_export;                  -- service role only

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (restores the v29 PART 1 behaviour: threshold 18, ">=")
-- ═════════════════════════════════════════════════════════════════════════════
--   CREATE OR REPLACE FUNCTION public.research_minor_age_threshold()
--   RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 18 $$;
--   CREATE OR REPLACE FUNCTION public.research_export_allowed(
--     p_consent BOOLEAN, p_version TEXT, p_guardian BOOLEAN, p_birth_year INTEGER
--   ) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
--     SELECT COALESCE(p_consent, FALSE)
--        AND COALESCE(p_version = public.research_current_consent_version(), FALSE)
--        AND ( p_birth_year IS NULL
--           OR (EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Bangkok'))::INTEGER - p_birth_year)
--                >= public.research_minor_age_threshold()
--           OR COALESCE(p_guardian, FALSE) )
--   $$;
