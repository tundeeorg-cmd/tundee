-- ═════════════════════════════════════════════════════════════════════════════
-- v24 — per-answer questionnaire log, randomization conflicts, attrition view
--
-- PART 2 steps 2, 3 and 4 of TunDee_ClaudeCode_Prompts_Oct25.md. NOT RUN YET:
-- read it, then run in the Supabase SQL editor. Idempotent. Nothing here drops
-- or alters an existing table, column or CHECK constraint, and nothing writes to
-- profiles — the research columns (ab_arm, cohort, ranking_variant,
-- ranking_assigned_at, ...) and their constraints are untouched.
--
-- Nothing in the application writes to these tables yet. They exist so that the
-- code that does (the value-first /start flow, PART 3) has somewhere to write
-- from its first day, and so the shape can be reviewed before it is used.
--
-- WHAT
--   questionnaire_responses  one row per question DISPLAYED. answered_at is NULL
--                            until the student answers (a row that stays NULL is
--                            attrition). A changed answer is a NEW row, never an
--                            update. The one permitted UPDATE is filling in a
--                            row's answer the first time (answered_at NULL ->
--                            set); a trigger refuses every other change.
--   randomization_conflicts  written by the server when an anonymous visitor who
--                            was already randomized signs in to an account that
--                            was randomized differently. profile arm wins; this
--                            records that it happened. Service role only.
--   research_attrition       per arm x question: shown / answered / rate. A view
--                            for SQL, readable by the service role only.
--
-- ACCESS
--   A signed-in student may insert and read their OWN rows (subject_type 'user',
--   subject_id = their user id). Anonymous visitors cannot write directly: their
--   rows will be written by a server route with the service role, which also
--   keeps the anon id out of any client-writable path.
--   There is no DELETE policy and no delete trigger: erasure under PDPA s.33 is a
--   service-role DELETE by subject_id, and a trigger refusing it would block that.
-- ═════════════════════════════════════════════════════════════════════════════


-- ── 1. questionnaire_responses ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questionnaire_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       TEXT        NOT NULL,                 -- anon_id, or auth user id as text
  subject_type     TEXT        NOT NULL
                               CHECK (subject_type IN ('anon', 'user')),
  question_key     TEXT        NOT NULL,
  question_version TEXT        NOT NULL,                 -- bump when the WORDING changes
  answer_value     TEXT,                                 -- 'unsure' is its own value, not 0
  answer_numeric   NUMERIC,
  displayed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at      TIMESTAMPTZ,                          -- NULL = shown, never answered
  sequence_index   INTEGER     NOT NULL CHECK (sequence_index >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- An answer needs a time, and a time needs an answer.
  CONSTRAINT questionnaire_responses_answered_check
    CHECK ((answered_at IS NULL AND answer_value IS NULL AND answer_numeric IS NULL)
        OR (answered_at IS NOT NULL AND answer_value IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_qr_subject
  ON public.questionnaire_responses (subject_type, subject_id, question_key, created_at);
CREATE INDEX IF NOT EXISTS idx_qr_question
  ON public.questionnaire_responses (question_key, question_version);

-- Append-only, with one exception: filling in an unanswered row.
CREATE OR REPLACE FUNCTION public.qr_enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.answered_at IS NULL
     AND NEW.answered_at IS NOT NULL
     AND NEW.id               = OLD.id
     AND NEW.subject_id       = OLD.subject_id
     AND NEW.subject_type     = OLD.subject_type
     AND NEW.question_key     = OLD.question_key
     AND NEW.question_version = OLD.question_version
     AND NEW.displayed_at     = OLD.displayed_at
     AND NEW.sequence_index   = OLD.sequence_index
     AND NEW.created_at       = OLD.created_at
  THEN
    RETURN NEW;   -- first answer to a displayed question
  END IF;
  RAISE EXCEPTION
    'questionnaire_responses is append-only: a changed answer is a new row (id %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END
$fn$;

DROP TRIGGER IF EXISTS trg_qr_append_only ON public.questionnaire_responses;
CREATE TRIGGER trg_qr_append_only
  BEFORE UPDATE ON public.questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION public.qr_enforce_append_only();

ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_insert_own ON public.questionnaire_responses;
CREATE POLICY qr_insert_own ON public.questionnaire_responses
  FOR INSERT TO authenticated
  WITH CHECK (subject_type = 'user' AND subject_id = auth.uid()::text);

DROP POLICY IF EXISTS qr_select_own ON public.questionnaire_responses;
CREATE POLICY qr_select_own ON public.questionnaire_responses
  FOR SELECT TO authenticated
  USING (subject_type = 'user' AND subject_id = auth.uid()::text);

DROP POLICY IF EXISTS qr_update_own ON public.questionnaire_responses;
CREATE POLICY qr_update_own ON public.questionnaire_responses
  FOR UPDATE TO authenticated
  USING (subject_type = 'user' AND subject_id = auth.uid()::text)
  WITH CHECK (subject_type = 'user' AND subject_id = auth.uid()::text);

COMMENT ON TABLE public.questionnaire_responses IS
  'PART 2 step 3-4. One row per question displayed; answered_at NULL = never answered. '
  'A changed answer is a new row. question_version must change whenever the wording does.';


-- ── 2. randomization_conflicts (service role only) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.randomization_conflicts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id      TEXT        NOT NULL,
  user_id      UUID        NOT NULL,
  anon_arm     TEXT        NOT NULL CHECK (anon_arm    IN ('baseline', 'fairness_adjusted')),
  profile_arm  TEXT        NOT NULL CHECK (profile_arm IN ('baseline', 'fairness_adjusted')),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A conflict means the two disagree; if they agree there is nothing to record.
  CONSTRAINT randomization_conflicts_differ_check CHECK (anon_arm <> profile_arm)
);

CREATE INDEX IF NOT EXISTS idx_rc_user ON public.randomization_conflicts (user_id);

-- RLS on with no policies: only the service role (which bypasses RLS) can touch it.
ALTER TABLE public.randomization_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.randomization_conflicts FROM anon, authenticated;

COMMENT ON TABLE public.randomization_conflicts IS
  'PART 2 step 2. Written when an already-randomized anonymous visitor signs in to an '
  'account randomized differently. The profile arm always wins. Should stay near zero; '
  'a rising count is a bug signal (see /api/health/research).';


-- ── 3. research_attrition (service role only) ────────────────────────────────
-- Per arm x question: how many were shown it, how many answered. ranking_variant
-- NULL is its own row: students who were never randomized. security_invoker so
-- the view cannot be used to read around the RLS above.
CREATE OR REPLACE VIEW public.research_attrition
WITH (security_invoker = true) AS
SELECT
  p.ranking_variant,
  q.question_key,
  q.question_version,
  COUNT(*)                                             AS shown,
  COUNT(q.answered_at)                                 AS answered,
  ROUND(COUNT(q.answered_at)::numeric / NULLIF(COUNT(*), 0), 4) AS answer_rate
FROM public.questionnaire_responses q
LEFT JOIN public.profiles p
       ON q.subject_type = 'user' AND p.id::text = q.subject_id
GROUP BY p.ranking_variant, q.question_key, q.question_version;

REVOKE ALL ON public.research_attrition FROM anon, authenticated;
GRANT SELECT ON public.research_attrition TO service_role;

COMMENT ON VIEW public.research_attrition IS
  'PART 2 step 4. Shown / answered / rate per arm per question. For direct SQL by the '
  'research team only; no page or endpoint may expose it (step 8, no-peeking).';


-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (removes only what this file created; no other table is involved)
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP VIEW     IF EXISTS public.research_attrition;
--   DROP TABLE    IF EXISTS public.randomization_conflicts;
--   DROP TRIGGER  IF EXISTS trg_qr_append_only ON public.questionnaire_responses;
--   DROP FUNCTION IF EXISTS public.qr_enforce_append_only();
--   DROP TABLE    IF EXISTS public.questionnaire_responses;
