-- ═════════════════════════════════════════════════════════════════════════════
-- v14 — LINE outcome survey: outcomes + survey_log
--
-- Supports the LINE outcome-survey flow: after a tracked scholarship's result
-- window passes, we ask the student (via LINE quick-reply) what happened, then
-- follow up for the award amount and research consent.
--
--   [A] outcomes      — one durable row per (user, scholarship). UNIQUE on
--                       (user_id, scholarship_id) is the upsert conflict target,
--                       so a student re-tapping a quick reply never duplicates.
--   [B] survey_log    — what was asked, when, and where the conversation is.
--                       Drives the 30-day duplicate guard, the per-user rate
--                       limit, and the multi-turn amount/consent state machine.
--   [C] event.outcome — CHECK widened for 'not_applied' / 'unknown' so the
--                       existing audit trail can carry the new answers.
--   [D] backfill      — survey_log seeded from outcome_followup_log so nobody
--                       who was already asked gets re-asked on the first run.
--   [E] v_outcomes_research — consent-gated view for research export.
--
-- PDPA: outcomes stores ONLY status / amount / consent / note. No name, email,
-- phone or LINE id. Nothing leaves the system unless consent_research = TRUE.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT).
-- Optional dependencies (event, outcome_followup_log) are skipped with a NOTICE
-- if absent; only td_scholarships is a hard requirement (the FKs need it).
-- Prerequisites: scripts/20260719_full_research_migration.sql (event,
-- tracked_scholarship, td_scholarships) and scripts/20260720_v8_outcome_followup.sql
-- (outcome_followup_log) must already have been run.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- [0] Preconditions — fail early with an actionable message rather than later
--     with a cryptic "relation does not exist".
-- ═════════════════════════════════════════════════════════════════════════════

DO $pre$
BEGIN
  IF to_regclass('public.td_scholarships') IS NULL THEN
    RAISE EXCEPTION
      'public.td_scholarships does not exist. Run scripts/add_td_scholarships.sql first.';
  END IF;
END
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] outcomes — durable, upsertable outcome record
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.outcomes (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id   TEXT          NOT NULL REFERENCES public.td_scholarships(scholarship_id) ON DELETE CASCADE,
  scholarship_name TEXT,
  status           TEXT          NOT NULL DEFAULT 'unknown'
                                 CHECK (status IN ('awarded','waiting','not_applied','rejected','unknown')),
  amount_thb       NUMERIC(12,2) CHECK (amount_thb IS NULL OR amount_thb >= 0),
  consent_research BOOLEAN       NOT NULL DEFAULT FALSE,
  reported_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  source           TEXT          NOT NULL DEFAULT 'line'
                                 CHECK (source IN ('line','web','admin','partner')),
  note             TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scholarship_id)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_user
  ON public.outcomes (user_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_status_time
  ON public.outcomes (status, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_consented
  ON public.outcomes (reported_at DESC) WHERE consent_research;

ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;

-- Students may read their own outcome rows. Writes are service-role only
-- (LINE webhook / cron / admin) — deliberately no INSERT or UPDATE policy.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outcomes' AND policyname = 'outcomes: own read'
  ) THEN
    CREATE POLICY "outcomes: own read"
      ON public.outcomes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] survey_log — send ledger + conversation state machine
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.survey_log (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id TEXT        NOT NULL REFERENCES public.td_scholarships(scholarship_id) ON DELETE CASCADE,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,
  state          TEXT        NOT NULL DEFAULT 'sent'
                             CHECK (state IN ('sent','awaiting_amount','awaiting_consent',
                                              'awaiting_reminder_optin','awaiting_reask',
                                              'done','skipped')),
  reask_after    DATE,
  attempt_no     INTEGER     NOT NULL DEFAULT 1 CHECK (attempt_no BETWEEN 1 AND 6),
  trigger_source TEXT        NOT NULL DEFAULT 'cron'
                             CHECK (trigger_source IN ('cron','admin'))
);

-- 30-day duplicate guard reads this
CREATE INDEX IF NOT EXISTS idx_survey_log_user_sch_sent
  ON public.survey_log (user_id, scholarship_id, sent_at DESC);
-- per-user rate limit reads this
CREATE INDEX IF NOT EXISTS idx_survey_log_user_sent
  ON public.survey_log (user_id, sent_at DESC);
-- due re-asks read this
CREATE INDEX IF NOT EXISTS idx_survey_log_reask
  ON public.survey_log (reask_after) WHERE state = 'awaiting_reask';

-- At most ONE open conversation per (user, scholarship), so the webhook's
-- "which survey is this reply for?" lookup is always deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_survey_log_open
  ON public.survey_log (user_id, scholarship_id)
  WHERE state IN ('sent','awaiting_amount','awaiting_consent',
                  'awaiting_reminder_optin','awaiting_reask');

ALTER TABLE public.survey_log ENABLE ROW LEVEL SECURITY;
-- No policies: service-role access only. survey_log is operational metadata,
-- not student-facing data.

-- ═════════════════════════════════════════════════════════════════════════════
-- [C] event.outcome — widen CHECK for the two new answers
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cname TEXT;
BEGIN
  IF to_regclass('public.event') IS NULL THEN
    RAISE NOTICE
      'public.event not found — skipping the outcome CHECK widening. The survey still works; only the audit-trail insert in the webhook is a no-op until scripts/20260719_full_research_migration.sql is run.';
    RETURN;
  END IF;

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
    CHECK (outcome IN ('applied','awarded','rejected','withdrawn','waiting','not_applied','unknown'));
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [D] Backfill survey_log from the existing send ledger
--     Every already-sent follow-up lands as state='done' so the 30-day guard
--     sees it and nobody gets re-asked on the first run of the new cron.
--     outcome_followup_log stays in place, read-only, as history.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n INTEGER;
BEGIN
  IF to_regclass('public.outcome_followup_log') IS NULL THEN
    RAISE NOTICE
      'public.outcome_followup_log not found — nothing to backfill. This is expected on a database that never ran scripts/20260720_v8_outcome_followup.sql; no student has been surveyed yet, so there is nobody to avoid re-asking.';
    RETURN;
  END IF;

  INSERT INTO public.survey_log (user_id, scholarship_id, sent_at, state, attempt_no, trigger_source)
  SELECT l.user_id, l.scholarship_id, l.sent_at, 'done', LEAST(l.attempt_no, 6), 'cron'
  FROM public.outcome_followup_log l
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'survey_log backfilled from outcome_followup_log: % row(s).', n;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [E] v_outcomes_research — consent is a hard gate
--     Mirrors the pattern in add_research_v2.sql: user_id never leaves the
--     database, only a stable SHA-256 pseudonym.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_outcomes_research AS
SELECT
  encode(digest(o.user_id::text, 'sha256'), 'hex') AS pseudo_user_id,
  o.scholarship_id,
  o.scholarship_name,
  o.status,
  o.amount_thb,
  o.reported_at,
  o.source
FROM public.outcomes o
WHERE o.consent_research = TRUE;   -- hard gate: no consent = never exported

COMMIT;

-- =============================================================================
-- Summary of changes
-- =============================================================================
-- New table: public.outcomes
--   (id, user_id, scholarship_id, scholarship_name, status, amount_thb,
--    consent_research, reported_at, source, note, created_at, updated_at)
--   UNIQUE (user_id, scholarship_id)   ← upsert conflict target
--   RLS: own SELECT only; all writes via service role
--
-- New table: public.survey_log
--   (id, user_id, scholarship_id, sent_at, responded_at, state, reask_after,
--    attempt_no, trigger_source)
--   state: sent | awaiting_amount | awaiting_consent | awaiting_reminder_optin
--        | awaiting_reask | done | skipped
--   Partial UNIQUE (user_id, scholarship_id) WHERE state is open
--   RLS: enabled, no policies (service role only)
--
-- Constraint replaced on public.event:
--   outcome CHECK → + 'not_applied', 'unknown'
--
-- New view: public.v_outcomes_research  (consent_research = TRUE only)
--
-- Backfilled: survey_log ← outcome_followup_log (state 'done')
-- =============================================================================
