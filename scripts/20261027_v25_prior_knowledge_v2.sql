-- ═════════════════════════════════════════════════════════════════════════════
-- v25 — prior-knowledge question, version 2
--
-- PART 2 step 5 of TunDee_ClaudeCode_Prompts_Oct25.md. NOT RUN YET: read it, run
-- it in the Supabase SQL editor, and ONLY THEN merge the PR that reads and writes
-- these columns (the wizard and /api/profile/setup name them, so deploying the
-- code first makes every wizard save fail with 42703).
--
-- WHY
--   The wizard's prior-knowledge question is reworded, and answers to the old and
--   new wording must not be pooled (PART 2 step 3). It also gains an "unsure"
--   answer that is NOT a 0, and a record of whether the student had already seen
--   a ranked scholarship list when they answered (the /start results precede the
--   wizard for most students, which contaminates a measure of what they knew
--   "before TunDee").
--
-- WHAT (three new columns on public.profiles; idempotent)
--   prior_knowledge_unsure            TRUE = answered "ไม่แน่ใจ". prior_scholarship_knowledge
--                                     stays NULL in that case; 0 keeps meaning "knew none".
--   prior_knowledge_question_version  'v1' | 'v2'. NULL = never answered. Lives in
--                                     lib/research/questionVersions.ts.
--   asked_after_seeing_results        TRUE = had seen the /start results before answering;
--                                     FALSE = no such exposure observed (browsing the
--                                     public list is not observed); NULL = not answered
--                                     or answered under v1 (unknown).
--
-- NOT TOUCHED: prior_scholarship_knowledge and its CHECK (>= 0, nullable), and every
-- other research column and constraint (ab_arm, cohort, ranking_variant,
-- ranking_assigned_at, recruitment_source, signup_cohort, and the five CHECKs).
--
-- BACKFILL: every row that already has a numeric answer was given the v1 wording,
-- so it is stamped 'v1'. That is a statement of fact, not a guess. Rows with no
-- answer stay NULL. asked_after_seeing_results is left NULL for them: it was never
-- recorded and cannot be reconstructed.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prior_knowledge_unsure            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prior_knowledge_question_version  TEXT,
  ADD COLUMN IF NOT EXISTS asked_after_seeing_results        BOOLEAN;

-- New constraints on NEW columns only.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_prior_knowledge_version_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_prior_knowledge_version_check
       CHECK (prior_knowledge_question_version IS NULL
              OR prior_knowledge_question_version IN ('v1', 'v2'));

-- "Unsure" and a number are different answers; both at once is a contradiction.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_prior_knowledge_unsure_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_prior_knowledge_unsure_check
       CHECK (NOT prior_knowledge_unsure OR prior_scholarship_knowledge IS NULL);

-- Backfill (see above). Only rows not yet stamped.
UPDATE public.profiles
   SET prior_knowledge_question_version = 'v1'
 WHERE prior_scholarship_knowledge IS NOT NULL
   AND prior_knowledge_question_version IS NULL;

COMMENT ON COLUMN public.profiles.prior_knowledge_unsure IS
  'TRUE = answered "not sure". Distinct from prior_scholarship_knowledge = 0 ("knew none").';
COMMENT ON COLUMN public.profiles.prior_knowledge_question_version IS
  'Wording version of the prior-knowledge question the student answered (lib/research/questionVersions.ts). NULL = never answered.';
COMMENT ON COLUMN public.profiles.asked_after_seeing_results IS
  'TRUE = the student had seen the /start ranked results before answering. FALSE = no exposure observed. NULL = unanswered or v1 (unknown).';

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select prior_knowledge_question_version, prior_knowledge_unsure,
--          count(*) filter (where prior_scholarship_knowledge is null) as numeric_null,
--          count(*) as n
--   from public.profiles group by 1, 2 order by 1, 2;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only what this file added; drop the constraints first)
-- ═════════════════════════════════════════════════════════════════════════════
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_prior_knowledge_unsure_check;
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_prior_knowledge_version_check;
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS asked_after_seeing_results,
--     DROP COLUMN IF EXISTS prior_knowledge_question_version,
--     DROP COLUMN IF EXISTS prior_knowledge_unsure;
