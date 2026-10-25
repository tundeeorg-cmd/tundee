-- ═════════════════════════════════════════════════════════════════════════════
-- v31 — research_export: the export view with the REAL arm
--
-- NOT RUN. Run v30 (lock) first, then PART 1 of v29 (it adds research_export_allowed),
-- then this.
--
-- WHY A NEW VIEW. v_research_export labels the arm `experiment_variant` from the legacy
-- experiment_assignment table: pilot-era, a different hash, agreeing with the real
-- assignment only at chance. A view cannot drop or rename a column with CREATE OR
-- REPLACE, so the old one cannot be corrected in place. This is the replacement, named
-- as PART 2 step 8 of the plan asked (`research_export`), readable by the service role
-- ONLY. It does exactly what GET /api/research/export does:
--
--   * a student is in it only with a record, a yes, a yes to the CURRENT wording, and for
--     a minor with a known birth year a guardian's yes (research_export_allowed, v29);
--   * the arm is profiles.ranking_variant AS OF THE EVENT: at or after ranking_assigned_at,
--     for a randomized main-cohort student, it is the arm; before that, never randomized,
--     or pilot, it is NULL and excluded_from_primary is TRUE. Nothing is dropped;
--   * the pseudonym is sha256(user_id), as before.
--
-- NO-PEEKING (PREREG §8, §12.8). It carries no rate and computes nothing, but it makes
-- arm-level analysis possible. It is locked to the service role so that doing so is a
-- decision, not something anyone can stumble into. Do not analyse outcomes by arm from
-- it before the registered stopping point.
--
-- v_research_export is NOT dropped (something may still read it). It is commented as
-- deprecated; v30 has already removed public access to it.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.research_export
WITH (security_invoker = true) AS
SELECT
  encode(sha256(fe.user_id::text::bytea), 'hex')      AS pseudo_user_id,
  fe.session_id,
  fe.scholarship_id,
  fe.event_type,
  fe.context,
  fe.occurred_at,
  -- Protected attributes — no PII
  sp.region,
  sp.area_type,
  sp.household_income_band,
  sp.welfare_card,
  sp.school_type,
  sp.first_generation,
  sp.birth_year,
  sp.gpa,
  sp.intended_level,
  sp.intended_field,
  -- The arm the student was in AT THE TIME OF THE EVENT
  CASE WHEN arm.counts THEN p.ranking_variant END     AS ranking_variant,
  p.ranking_assigned_at,
  NOT arm.counts                                      AS excluded_from_primary,
  p.cohort,
  p.assignment_algorithm_version,
  p.fairness_eligible,
  p.region_group,
  p.income_bracket
FROM public.funnel_events fe
JOIN public.student_profile sp
  ON sp.user_id = fe.user_id
 AND public.research_export_allowed(sp.consent_research, sp.consent_version, sp.guardian_consent, sp.birth_year::INTEGER)
LEFT JOIN public.profiles p
  ON p.id = fe.user_id
CROSS JOIN LATERAL (
  -- Mirrors bindOutcome() in lib/research/outcomeBinding.ts.
  SELECT (p.id IS NOT NULL
          AND p.cohort IS DISTINCT FROM 'pilot'
          AND p.ranking_variant IN ('baseline', 'fairness_adjusted')
          AND p.ranking_assigned_at IS NOT NULL
          AND fe.occurred_at >= p.ranking_assigned_at) AS counts
) arm
WHERE fe.user_id IS NOT NULL;

REVOKE ALL ON public.research_export FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.research_export TO service_role;

COMMENT ON VIEW public.research_export IS
  'Consent-gated, pseudonymised funnel events with the arm as of the event (profiles.ranking_variant; NULL before assignment, never randomized, or pilot). Service role only. No outcome analysis by arm before the registered stopping point (PREREG 8).';

-- The old one stays, marked, and locked by v30.
COMMENT ON VIEW public.v_research_export IS
  'DEPRECATED: labels the arm experiment_variant from the legacy experiment_assignment table, which is NOT the randomization, and gates consent_research alone. Use public.research_export.';

NOTIFY pgrst, 'reload schema';

-- ── Verify (read-only; counts only, never an outcome by arm) ─────────────────
--   select count(*) from public.research_export;
--   select count(*) filter (where excluded_from_primary) as excluded, count(*) as total from public.research_export;
--   -- With the ANON key this must be refused: GET /rest/v1/research_export?select=*&limit=0

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:  DROP VIEW IF EXISTS public.research_export;
-- ═════════════════════════════════════════════════════════════════════════════
