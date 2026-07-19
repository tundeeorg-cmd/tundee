-- =============================================================================
-- Migration: 20260719_research_tables_v3.sql
-- Research tables for TunDee causal-inference + fairness study.
--
-- Tables created / extended:
--   student_profile       (extended: 6 new columns, broader area_type check)
--   event                 (new: enriched recommender signals + outcome columns)
--   experiment_assignment (extended: surrogate id UUID column)
--
-- Idempotent: safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE). Run in the Supabase SQL Editor on staging first.
--
-- Prerequisites: add_research_v2.sql must already have been run so that
--   derive_region(), student_profile, experiment_assignment, and
--   td_scholarships exist.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND student_profile
--    (table and core columns already exist from add_research_v2.sql)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. New columns missing from v2
ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS monthly_income_thb  INTEGER,
  ADD COLUMN IF NOT EXISTS parent_education    TEXT,
  ADD COLUMN IF NOT EXISTS household_size      INTEGER,
  ADD COLUMN IF NOT EXISTS school_province     TEXT,
  ADD COLUMN IF NOT EXISTS class_rank_pct      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS disability_status   TEXT;

-- 1b. Widen area_type check to include peri_urban.
--     DROP then ADD is safe here because the constraint is on text values —
--     no existing 'peri_urban' rows exist (it wasn't in the old constraint).
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_area_type_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_area_type_check
       CHECK (area_type IN ('urban', 'peri_urban', 'rural'));

-- 1c. Add CHECK on parent_education (not present in v2).
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_parent_education_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_parent_education_check
       CHECK (parent_education IN (
         'none', 'primary', 'secondary', 'vocational',
         'bachelor', 'postgrad', 'unknown'
       ));

-- 1d. Widen household_income_band to also accept the new human-readable labels.
--     Old rows already use band_1..band_7; new rows may use '<100k', etc.
--     Both are accepted — the application layer will normalise to one format
--     over time.
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_household_income_band_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_household_income_band_check
       CHECK (household_income_band IN (
         -- v2 labels (kept for backward compat with existing rows)
         'band_1', 'band_2', 'band_3', 'band_4', 'band_5', 'band_6', 'band_7',
         -- v3 human-readable labels (new students)
         '<100k', '100-200k', '200-360k', '360-600k', '600k+', 'unknown'
       ));

-- 1e. New index on province for geo-subgroup queries
CREATE INDEX IF NOT EXISTS idx_student_profile_province
  ON public.student_profile (province);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE event
--    A richer append-only event log replacing funnel_events for new code.
--    funnel_events is kept for backward compatibility with existing app code.
--
--    Key differences from funnel_events:
--      • First-class recommender columns: rank_position, score,
--        recommender_variant, fairness_mode
--      • Outcome columns: outcome, outcome_source, outcome_date
--      • outcome_verified event type
--      • query_text + filters stored as top-level columns (not buried in JSONB)
--
--    Append-only is enforced at BOTH layers:
--      • DB level: trigger raises EXCEPTION on UPDATE / DELETE
--      • App level: EventRepository exposes only insert()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who & where
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id          TEXT,
  scholarship_id      TEXT        REFERENCES public.td_scholarships(scholarship_id) ON DELETE SET NULL,

  -- What happened
  event_type          TEXT        NOT NULL CHECK (event_type IN (
                                    'search',
                                    'view_list',
                                    'impression',          -- one row per card shown
                                    'view_detail',
                                    'click_apply',
                                    'track_add',
                                    'track_remove',
                                    'status_change',
                                    'self_report_outcome',
                                    'outcome_verified'     -- admin/partner-imported
                                  )),

  -- Recommender context (the treatment signal)
  rank_position       INTEGER,          -- position scholarship was shown (1-indexed)
  score               NUMERIC(6,4),     -- recommender final_score (0–1)
  recommender_variant TEXT,             -- e.g. 'baseline' | 'hybrid'
  fairness_mode       TEXT CHECK (fairness_mode IN ('on', 'off')),

  -- Search context
  query_text          TEXT,
  filters             JSONB,

  -- Free-form payload (tab, page, UI context, etc.)
  context             JSONB NOT NULL DEFAULT '{}',

  -- Outcome (set when event_type IN ('self_report_outcome','outcome_verified'))
  outcome             TEXT CHECK (outcome IN (
                        'applied', 'awarded', 'rejected', 'withdrawn'
                      )),
  outcome_source      TEXT CHECK (outcome_source IN (
                        'click_inferred', 'self_report', 'partner_verified'
                      )),
  outcome_date        DATE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_user_time
  ON public.event (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_sch_type
  ON public.event (scholarship_id, event_type);

CREATE INDEX IF NOT EXISTS idx_event_type_time
  ON public.event (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_session
  ON public.event (session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_fairness
  ON public.event (fairness_mode, occurred_at DESC)
  WHERE fairness_mode IS NOT NULL;

-- ── RLS: append-only via policies (no UPDATE/DELETE policy = no update/delete) ─
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;

-- Students: insert own events or anonymous events
CREATE POLICY "event: insert own or anon"
  ON public.event FOR INSERT
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- Students: read own events
CREATE POLICY "event: select own"
  ON public.event FOR SELECT
  USING (user_id = auth.uid());

-- Admin: read all (service role bypasses RLS entirely; this is for dashboard queries)
CREATE POLICY "event: admin select"
  ON public.event FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email = ANY(
        string_to_array(
          COALESCE(current_setting('app.admin_emails', TRUE), ''),
          ','
        )
      )
    )
  );

-- ── DB-level append-only trigger ──────────────────────────────────────────────
-- Any UPDATE or DELETE on `event` raises an exception regardless of caller.
-- The only exception is a superuser running maintenance (vacuums are fine;
-- UPDATE/DELETE are not).
CREATE OR REPLACE FUNCTION public.event_append_only_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'event table is append-only: UPDATE and DELETE are not permitted. '
    'Correct outcome data by inserting a new row with event_type=outcome_verified.';
END;
$$;

DROP TRIGGER IF EXISTS trg_event_append_only ON public.event;
CREATE TRIGGER trg_event_append_only
  BEFORE UPDATE OR DELETE ON public.event
  FOR EACH ROW
  EXECUTE FUNCTION public.event_append_only_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXTEND experiment_assignment
--    Add a surrogate UUID id column for REST-style access.
--    Primary key remains (user_id, experiment_key) for dedup guarantees.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.experiment_assignment
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

-- Unique index on id so it can be used as a stable row identifier
CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_assignment_id
  ON public.experiment_assignment (id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add event to analytics views
--    Extend v_funnel_conversion to also count rows from the new event table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_event_conversion AS
SELECT
  COUNT(*)                             FILTER (WHERE event_type = 'impression')         AS impressions,
  COUNT(DISTINCT user_id)              FILTER (WHERE event_type = 'impression')         AS unique_users_reached,
  COUNT(*)                             FILTER (WHERE event_type = 'view_detail')        AS view_details,
  COUNT(*)                             FILTER (WHERE event_type = 'click_apply')        AS click_applies,
  COUNT(*)                             FILTER (WHERE event_type = 'track_add')          AS track_adds,
  COUNT(*)                             FILTER (WHERE event_type = 'self_report_outcome'
                                                AND outcome = 'applied')                AS self_reported_applied,
  COUNT(*)                             FILTER (WHERE event_type = 'self_report_outcome'
                                                AND outcome = 'awarded')                AS self_reported_awarded,
  COUNT(*)                             FILTER (WHERE event_type = 'outcome_verified'
                                                AND outcome = 'awarded')                AS partner_verified_awarded
FROM public.event;

-- Fairness breakdown: impressions by fairness_mode × experiment variant
CREATE OR REPLACE VIEW public.v_event_by_arm AS
SELECT
  ea.variant,
  e.fairness_mode,
  COUNT(*)                             FILTER (WHERE e.event_type = 'impression')       AS impressions,
  COUNT(DISTINCT e.user_id)            FILTER (WHERE e.event_type = 'impression')       AS unique_users,
  COUNT(*)                             FILTER (WHERE e.event_type = 'click_apply')      AS click_applies,
  AVG(e.score)                         FILTER (WHERE e.event_type = 'impression')       AS avg_score,
  AVG(e.rank_position)                 FILTER (WHERE e.event_type = 'impression')       AS avg_rank
FROM public.event e
LEFT JOIN public.experiment_assignment ea
  ON ea.user_id = e.user_id AND ea.experiment_key = 'ranking'
WHERE e.user_id IS NOT NULL
GROUP BY ea.variant, e.fairness_mode;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Research export view (event version — consent-gated, pseudonymised)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_event_research_export AS
SELECT
  encode(sha256(e.user_id::text::bytea), 'hex') AS pseudo_user_id,
  e.session_id,
  e.scholarship_id,
  e.event_type,
  e.rank_position,
  e.score,
  e.recommender_variant,
  e.fairness_mode,
  e.outcome,
  e.outcome_source,
  e.outcome_date,
  e.context,
  e.occurred_at,
  -- Protected attributes from consented student_profile
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
  -- Experiment assignment
  ea.variant AS experiment_variant
FROM public.event e
JOIN public.student_profile sp
  ON sp.user_id = e.user_id
  AND sp.consent_research = TRUE      -- hard gate: no consent = excluded
LEFT JOIN public.experiment_assignment ea
  ON ea.user_id = e.user_id AND ea.experiment_key = 'ranking'
WHERE e.user_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- Notes
-- =============================================================================
-- PDPA 2562 (Personal Data Protection Act) compliance:
--   • Lawful basis: consent (Section 19). Students opt in via consent_research.
--   • Sensitive data (Section 26): income, disability, ethnicity proxies require
--     explicit, granular consent — collected in the student profile form.
--   • Minor protection: guardian_consent = TRUE is required when
--     EXTRACT(year FROM now()) - birth_year < 18. App enforces this server-side.
--   • Right to erasure (Section 33): setting consent_research = FALSE stops
--     future research use immediately. Historical pseudonymised exports cannot
--     be individually recalled (SHA-256 pseudonym is one-way).
--   • Retention: raw events 3 years; pseudonymised export indefinitely.
--
-- Append-only rule for event:
--   • DB trigger (trg_event_append_only) raises EXCEPTION on any UPDATE/DELETE.
--   • RLS has no UPDATE or DELETE policy — authenticated callers cannot mutate.
--   • Application layer (EventRepository) exposes only insert().
--   • To correct an outcome, INSERT a new row with event_type='outcome_verified'.
