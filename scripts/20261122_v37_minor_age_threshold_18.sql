-- ═════════════════════════════════════════════════════════════════════════════
-- v37 — the guardian-consent age is 18 in the database
--
-- Run it in the Supabase SQL editor when the matching code
-- (MINOR_AGE_THRESHOLD = 18 in lib/research/consentGate.ts) is deployed.
--
-- WHY
--   The project owner chose 18 on 2026-11-22 (research/AMENDMENT-2026-11-22-age-threshold-18.md).
--   v33 set research_minor_age_threshold() to 20.
--
-- WHAT  One CREATE OR REPLACE FUNCTION; nothing else.
--   research_export_allowed() from v33 is unchanged: a student is treated as an adult
--   only when (year - birth_year) EXCEEDS the threshold. With 18, a student born in
--   (year - 18) is still asked for a guardian, and one born in (year - 19) or earlier
--   is not.
--
-- EFFECT  Immediately, in every view that calls research_export_allowed(): consenting
--   students born in (year - 20) or (year - 19) with no guardian_consent are now
--   included. Nothing is deleted.
--
-- NOT TOUCHED  any table, data or view definition.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── Before (read-only): who would be added? ─────────────────────────────────
SELECT count(*) AS would_be_added
FROM public.student_profile sp
WHERE NOT public.research_export_allowed(sp.consent_research, sp.consent_version, sp.guardian_consent, sp.birth_year)
  AND COALESCE(sp.consent_research, FALSE)
  AND COALESCE(sp.consent_version = public.research_current_consent_version(), FALSE)
  AND sp.birth_year IS NOT NULL
  AND (EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Bangkok'))::INTEGER - sp.birth_year) > 18;


-- ── Apply ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.research_minor_age_threshold()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 18 $$;


-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select public.research_minor_age_threshold();                  -- 18

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (restores v33: threshold 20)
-- ═════════════════════════════════════════════════════════════════════════════
--   CREATE OR REPLACE FUNCTION public.research_minor_age_threshold()
--   RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 20 $$;
