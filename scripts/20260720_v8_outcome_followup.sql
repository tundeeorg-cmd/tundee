-- ═════════════════════════════════════════════════════════════════════════════
-- v8 — outcome_followup_log + event.outcome 'waiting' state
--
-- Supports the LINE outcome self-report flow: after a tracked scholarship's
-- deadline passes, we ask the student (via LINE quick-reply) whether they
-- were awarded, rejected, or are still waiting. This migration:
--
--   [A] outcome_followup_log — idempotency ledger for the follow-up cron,
--       mirrors reminder_log's shape (UNIQUE guards against duplicate sends).
--   [B] event.outcome CHECK — widened to accept 'waiting' (the student
--       answered but the result isn't in yet; event_type stays
--       'self_report_outcome', outcome_source 'self_report').
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- Prerequisite: scripts/20260719_full_research_migration.sql (creates
-- reminder_log, event, tracked_scholarship, td_scholarships) must already
-- have been run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] outcome_followup_log — idempotent LINE outcome-followup ledger
--     UNIQUE on (user_id, scholarship_id, attempt_no) so the cron is safe to
--     re-run without re-sending the same attempt (attempt_no = 1/2/3, one per
--     OUTCOME_OFFSETS entry).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.outcome_followup_log (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id TEXT        NOT NULL REFERENCES public.td_scholarships(scholarship_id) ON DELETE CASCADE,
  attempt_no     INTEGER     NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  deadline_date  DATE        NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scholarship_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_outcome_followup_user
  ON public.outcome_followup_log (user_id, deadline_date DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] event.outcome — widen CHECK to add 'waiting'
--     The original constraint (from 20260719_full_research_migration.sql) has
--     no explicit name, so Postgres auto-named it; find it dynamically rather
--     than assuming 'event_outcome_check'.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'public.event'::regclass
    AND con.contype = 'c'
    AND att.attname = 'outcome';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.event DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE public.event
    ADD CONSTRAINT event_outcome_check
    CHECK (outcome IN ('applied','awarded','rejected','withdrawn','waiting'));
END $$;

COMMIT;

-- =============================================================================
-- Summary of changes
-- =============================================================================
-- New table: public.outcome_followup_log
--   (id, user_id, scholarship_id, attempt_no, deadline_date, sent_at)
--   UNIQUE (user_id, scholarship_id, attempt_no)
--
-- Constraint replaced on public.event:
--   outcome CHECK → outcome IN ('applied','awarded','rejected','withdrawn','waiting')
-- =============================================================================
