-- ═════════════════════════════════════════════════════════════════════════════
-- v17 — Counterfactual ranking store, outcome events, research consent
--
-- Second half of the infrastructure registered in research/PREREGISTRATION.md
-- (commit 4a3cc5b). Section references are to that document.
--
--   [0] funnel_event_type — new values. Enum changes are autocommitted BEFORE
--       the main transaction: PostgreSQL will not let a value added inside a
--       transaction be USED in that same transaction, and batching every enum
--       change here avoids a later migration existing only to add a label.
--
--       Also adds 'profile_updated', which lib/research/funnel.ts has been
--       emitting since v2 even though the enum never had it — every one of
--       those inserts has been failing.
--
--   [A] recommendation_request — the counterfactual. One append-only row per
--       recommendation request holding BOTH rankings, for users in both arms.
--
--       This replaces `recommendations`, which the data dictionary describes as
--       holding score_raw and score_fairness_adjusted but which no code has
--       ever written to. It was also UPSERTed per (user × scholarship), so even
--       when populated it would have overwritten the ranking history it exists
--       to preserve. Left in place, untouched; nothing reads it but an admin
--       count.
--
--   [B] funnel_events — typed research columns. served_rank is promoted out of
--       the context JSONB because position is a known confounder in ranking
--       experiments and you cannot control for what you did not record.
--
--   [C] Research consent — separate from terms of service, versioned, with the
--       capture method recorded (§12.4).
--
--   [D] Analysis views — consent-gated and pilot-excluded by default (§9).
--
-- Idempotent: safe to re-run.
-- RLS: enables it on the new table. Does not disable or weaken any policy.
-- Prerequisite: 20260828_v16_experiment_randomization.sql
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- [0] Enum values — OUTSIDE the transaction, deliberately (see header)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'profile_updated';

-- Pre-registered outcome chain (§6). impression / view_detail / click_apply
-- already exist and keep their names so no history is invalidated.
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'application_started';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'application_submitted';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'award_reported';

-- Anonymous acquisition funnel (Phase 2B priority 5). Added now because enum
-- changes cannot share a transaction with their first use.
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'landing_view';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'quiz_started';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'quiz_completed';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'results_viewed';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'signup_started';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'signup_completed';
ALTER TYPE funnel_event_type ADD VALUE IF NOT EXISTS 'signup_failed';

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'ranking_variant'
  ) THEN
    RAISE EXCEPTION
      'profiles.ranking_variant missing — run 20260828_v16_experiment_randomization.sql first';
  END IF;
END
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] recommendation_request — both rankings, every request, both arms
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recommendation_request (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Null for anonymous /start previews, which have no arm by design: assignment
  -- happens at profile completion, so showing an adjusted ranking to an
  -- unassigned visitor would contaminate the pre-treatment period.
  user_id                     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id                  TEXT        NOT NULL,
  requested_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ranking_variant             TEXT,
  fairness_eligible           BOOLEAN     NOT NULL,
  fairness_multiplier_applied NUMERIC(6,4),

  -- Ordered [{scholarship_id, rank, score}, ...]. baseline_ranking is stored
  -- for EVERY request including treatment (§4), so rank displacement and effect
  -- size are measurable without recomputation.
  baseline_ranking            JSONB       NOT NULL,
  served_ranking              JSONB       NOT NULL,

  algorithm_version           TEXT        NOT NULL,
  surface                     TEXT        NOT NULL DEFAULT 'matches',

  CONSTRAINT recommendation_request_variant_check
    CHECK (ranking_variant IS NULL
           OR ranking_variant IN ('baseline', 'fairness_adjusted')),

  -- A multiplier may only be recorded where treatment was actually delivered.
  CONSTRAINT recommendation_request_multiplier_check
    CHECK (fairness_multiplier_applied IS NULL
           OR (ranking_variant = 'fairness_adjusted' AND fairness_eligible)),

  CONSTRAINT recommendation_request_rankings_are_arrays
    CHECK (jsonb_typeof(baseline_ranking) = 'array'
           AND jsonb_typeof(served_ranking) = 'array'),

  -- Anonymous requests are pre-treatment and must never carry an arm.
  CONSTRAINT recommendation_request_anon_has_no_arm
    CHECK (user_id IS NOT NULL OR ranking_variant IS NULL)
);

COMMENT ON TABLE public.recommendation_request IS
  'PREREG §4. Append-only. One row per recommendation request, holding the '
  'baseline ranking (always) and the served ranking (as shown). Replaces the '
  'never-written public.recommendations.';

CREATE INDEX IF NOT EXISTS idx_recreq_user_time
  ON public.recommendation_request (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_recreq_session
  ON public.recommendation_request (session_id);
CREATE INDEX IF NOT EXISTS idx_recreq_variant
  ON public.recommendation_request (ranking_variant);

-- ── Append-only, enforced by trigger as well as by policy ────────────────────
CREATE OR REPLACE FUNCTION public.tundee_recreq_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $ao$
BEGIN
  RAISE EXCEPTION
    'recommendation_request is append-only (PREREG §4): % attempted on row %',
    TG_OP, COALESCE(OLD.id::TEXT, '?')
    USING ERRCODE = 'integrity_constraint_violation';
END
$ao$;

DROP TRIGGER IF EXISTS trg_recreq_append_only ON public.recommendation_request;
CREATE TRIGGER trg_recreq_append_only
  BEFORE UPDATE OR DELETE ON public.recommendation_request
  FOR EACH ROW
  EXECUTE FUNCTION public.tundee_recreq_append_only();

ALTER TABLE public.recommendation_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recreq: insert own or anon" ON public.recommendation_request;
CREATE POLICY "recreq: insert own or anon"
  ON public.recommendation_request FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "recreq: read own" ON public.recommendation_request;
CREATE POLICY "recreq: read own"
  ON public.recommendation_request FOR SELECT
  USING (user_id = auth.uid());

-- No UPDATE or DELETE policy is defined, deliberately.

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] funnel_events — promote research fields out of the context JSONB
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.funnel_events
  ADD COLUMN IF NOT EXISTS served_rank               INTEGER,
  ADD COLUMN IF NOT EXISTS ranking_variant           TEXT,
  ADD COLUMN IF NOT EXISTS recommendation_request_id UUID
    REFERENCES public.recommendation_request(id) ON DELETE SET NULL;

ALTER TABLE public.funnel_events
  DROP CONSTRAINT IF EXISTS funnel_events_ranking_variant_check;
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_ranking_variant_check
  CHECK (ranking_variant IS NULL
         OR ranking_variant IN ('baseline', 'fairness_adjusted'));

COMMENT ON COLUMN public.funnel_events.served_rank IS
  'PREREG §6. 1-indexed position as actually shown. Promoted from context '
  'JSONB: position is a known confounder in ranking experiments.';
COMMENT ON COLUMN public.funnel_events.ranking_variant IS
  'PREREG §5.6. The arm that produced the ranking this event refers to. NOT '
  'the legacy ab_arm, which is uncorrelated with delivered treatment.';

CREATE INDEX IF NOT EXISTS idx_funnel_events_variant_type
  ON public.funnel_events (ranking_variant, event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_time
  ON public.funnel_events (user_id, occurred_at);

-- ═════════════════════════════════════════════════════════════════════════════
-- [C] Research consent — separate from terms of service (§12.4)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS consent_research    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_version     TEXT,
  ADD COLUMN IF NOT EXISTS consent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_method      TEXT,
  ADD COLUMN IF NOT EXISTS guardian_consent    BOOLEAN     NOT NULL DEFAULT FALSE;

ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_consent_method_check;
ALTER TABLE public.student_profile
  ADD CONSTRAINT student_profile_consent_method_check
  CHECK (consent_method IS NULL
         OR consent_method IN ('signup_inline', 'profile_settings', 'line_optin'));

-- Consent is only meaningful with the version and timestamp that produced it.
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_consent_auditable_check;
ALTER TABLE public.student_profile
  ADD CONSTRAINT student_profile_consent_auditable_check
  CHECK (consent_research = FALSE
         OR (consent_version IS NOT NULL AND consent_at IS NOT NULL));

COMMENT ON COLUMN public.student_profile.consent_research IS
  'PREREG §12.4. Research participation only — NOT terms of service. Declining '
  'costs the user nothing: the product behaves identically, they are excluded '
  'from research datasets.';

-- ═════════════════════════════════════════════════════════════════════════════
-- [D] Analysis views — consent-gated, pilot-excluded (§9)
-- ═════════════════════════════════════════════════════════════════════════════

-- The analysis population. Every downstream research view builds on this, so
-- the exclusions in §9 are applied in exactly one place.
CREATE OR REPLACE VIEW public.v_research_population AS
SELECT
  p.id                    AS user_id,
  p.cohort,
  p.ranking_variant,
  p.region_group,
  p.income_bracket,
  p.is_target_population,
  p.recruitment_source,
  p.fairness_eligible,
  p.ranking_assigned_at,
  p.assignment_algorithm_version,
  p.grade_level,
  p.created_at            AS enrolled_at
FROM public.profiles p
JOIN public.student_profile sp ON sp.user_id = p.id
WHERE p.cohort = 'main'                 -- §9.1 pilot excluded
  AND p.ranking_variant IS NOT NULL     -- randomized only
  AND sp.consent_research = TRUE;       -- §9.2 consent gate

COMMENT ON VIEW public.v_research_population IS
  'PREREG §9. The analysis population: main cohort, randomized, consented. '
  'Pilot users and non-consenters are excluded here so no downstream view has '
  'to remember to.';

-- Enrollment counts ONLY. Deliberately carries no outcome column: showing
-- outcomes by arm before the stopping point (§8) invites stopping early.
CREATE OR REPLACE VIEW public.v_recruitment_progress AS
SELECT
  region_group,
  income_bracket,
  ranking_variant,
  recruitment_source,
  is_target_population,
  COUNT(*) AS enrolled
FROM public.v_research_population
GROUP BY region_group, income_bracket, ranking_variant,
         recruitment_source, is_target_population;

COMMENT ON VIEW public.v_recruitment_progress IS
  'PREREG §2C/§8. Enrollment counts by stratum and arm. Contains NO outcome '
  'data by design — this is what the admin dashboard is allowed to show before '
  'the pre-registered stopping point.';

COMMIT;
