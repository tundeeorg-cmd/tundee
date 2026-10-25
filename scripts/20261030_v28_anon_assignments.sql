-- ═════════════════════════════════════════════════════════════════════════════
-- v28 — randomization before sign-in: anon_assignments, randomization_conflicts
--
-- PART 2 step 2 / PART 3 step 2 of TunDee_ClaudeCode_Prompts_Oct25.md.
-- NOT RUN. The code that uses these tables is inert unless ANON_RANDOMIZATION=on in
-- the environment, so this migration and the switch are independent — but the switch
-- must not be turned on until this has been run AND the study team has approved the
-- consent wording on /start, the handling of under-18 participants, and the
-- amendment that moves the randomization point (see lib/research/anonAssignment.ts).
--
-- WHAT
--   anon_assignments         one row per anonymous visitor who consented and answered:
--                            their arm, when, which algorithm, which stratum, and the
--                            consent version they saw. Service role only. The
--                            assignment columns are immutable (trigger), as they are on
--                            profiles. claimed_* record the account it was merged into,
--                            once.
--   randomization_conflicts  written when an anonymous arm meets an account that was
--                            randomized differently; the account's arm wins. Same
--                            definition as scripts/20261026_v24 (idempotent), so
--                            running either first is fine.
--
-- NOT TOUCHED  profiles, student_profile, any CHECK constraint, any research column.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.anon_assignments (
  anon_id                      TEXT        PRIMARY KEY
                               CHECK (anon_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  ranking_variant              TEXT        NOT NULL
                               CHECK (ranking_variant IN ('baseline', 'fairness_adjusted')),
  ranking_assigned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assignment_algorithm_version TEXT        NOT NULL,
  stratum                      TEXT        NOT NULL,
  fairness_eligible            BOOLEAN     NOT NULL,
  research_consent_version     TEXT        NOT NULL,
  research_consented_at        TIMESTAMPTZ NOT NULL,
  claimed_by                   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at                   TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anon_assignments_claimed ON public.anon_assignments (claimed_by);

-- Immutable once written, like profiles.ranking_variant. Only the claim may be set,
-- and only once.
CREATE OR REPLACE FUNCTION public.anon_assignments_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.anon_id                      IS DISTINCT FROM OLD.anon_id
  OR NEW.ranking_variant              IS DISTINCT FROM OLD.ranking_variant
  OR NEW.ranking_assigned_at          IS DISTINCT FROM OLD.ranking_assigned_at
  OR NEW.assignment_algorithm_version IS DISTINCT FROM OLD.assignment_algorithm_version
  OR NEW.stratum                      IS DISTINCT FROM OLD.stratum
  OR NEW.fairness_eligible            IS DISTINCT FROM OLD.fairness_eligible
  OR NEW.research_consent_version     IS DISTINCT FROM OLD.research_consent_version
  OR NEW.research_consented_at        IS DISTINCT FROM OLD.research_consented_at THEN
    RAISE EXCEPTION 'anon_assignments: the assignment is immutable (anon %)', OLD.anon_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- A claim may be set once; the account may later be deleted (ON DELETE SET NULL).
  IF OLD.claimed_by IS NOT NULL AND NEW.claimed_by IS NOT NULL AND NEW.claimed_by <> OLD.claimed_by THEN
    RAISE EXCEPTION 'anon_assignments: already claimed (anon %)', OLD.anon_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_anon_assignments_freeze ON public.anon_assignments;
CREATE TRIGGER trg_anon_assignments_freeze
  BEFORE UPDATE ON public.anon_assignments
  FOR EACH ROW EXECUTE FUNCTION public.anon_assignments_freeze();

-- RLS on with no policy: the service role (which bypasses RLS) is the only way in.
ALTER TABLE public.anon_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anon_assignments FROM anon, authenticated;

COMMENT ON TABLE public.anon_assignments IS
  'Arm of an anonymous visitor who consented on /start and answered the matcher. Service role only. Merged into profiles at sign-in (profile arm wins). Never exposed to the browser.';


CREATE TABLE IF NOT EXISTS public.randomization_conflicts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id      TEXT        NOT NULL,
  user_id      UUID        NOT NULL,
  anon_arm     TEXT        NOT NULL CHECK (anon_arm    IN ('baseline', 'fairness_adjusted')),
  profile_arm  TEXT        NOT NULL CHECK (profile_arm IN ('baseline', 'fairness_adjusted')),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT randomization_conflicts_differ_check CHECK (anon_arm <> profile_arm)
);
CREATE INDEX IF NOT EXISTS idx_rc_user ON public.randomization_conflicts (user_id);
ALTER TABLE public.randomization_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.randomization_conflicts FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select to_regclass('public.anon_assignments') is not null as anon_assignments,
--          to_regclass('public.randomization_conflicts') is not null as conflicts;
--   -- With the ANON key, this must be refused:  GET /rest/v1/anon_assignments?select=*

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only what this file created)
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP TRIGGER  IF EXISTS trg_anon_assignments_freeze ON public.anon_assignments;
--   DROP FUNCTION IF EXISTS public.anon_assignments_freeze();
--   DROP TABLE    IF EXISTS public.anon_assignments;
--   -- randomization_conflicts is shared with v24: drop it only if v24 was never run.
