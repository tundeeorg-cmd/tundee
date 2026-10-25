-- ═════════════════════════════════════════════════════════════════════════════
-- v27 — funnel steps for /admin/funnel
--
-- PART 3 step 4 of TunDee_ClaudeCode_Prompts_Oct25.md. NOT RUN YET.
--
-- WHAT
--   [A] Two new funnel_event_type values: 'browsed' and 'personalize_shown'. The
--       other steps reuse event types that already exist (landing_view, view_detail,
--       quiz_completed, signup_completed, track_add, click_apply).
--   [B] public.funnel_step_counts(p_since): per step, the number of distinct browser
--       sessions with that event since p_since, plus 'returned' — accounts with
--       activity on a later day than their first-ever activity. Callable by the
--       service role only.
--
-- ORDER / DEPLOY
--   The page code can ship first or second:
--     • before [A] is run, the client's 'browsed' / 'personalize_shown' inserts are
--       refused by the enum and are only console.warn'd by lib/research/funnel.ts;
--       nothing else is affected and the two rows of the funnel read 0;
--     • before [B] is run, /api/admin/funnel answers 503 'migration_missing' with
--       this file's name.
--   Run [A] first, as its own run (an enum value added in a transaction cannot be
--   used in that same transaction), then [B].
--
-- NOT TOUCHED  any CHECK constraint, any research column, funnel_events itself.
-- NO ARM       nothing here reads ranking_variant or ab_arm. A funnel split by arm is
--              an outcome-by-arm view and is forbidden before the stopping point.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── [A] run this block on its own ────────────────────────────────────────────
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'browsed';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'personalize_shown';


-- ── [B] then this block ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.funnel_step_counts(p_since TIMESTAMPTZ)
RETURNS TABLE (step TEXT, n BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  WITH steps(step, event_type, ord) AS (
    VALUES
      ('landed',            'landing_view',      1),
      ('browsed',           'browsed',           2),
      ('engaged',           'view_detail',       3),
      ('personalize_shown', 'personalize_shown', 4),
      ('personalized',      'quiz_completed',    5),
      ('signed_up',         'signup_completed',  6),
      ('tracked',           'track_add',         7),
      ('applied_clicked',   'click_apply',       8)
  ),
  counted AS (
    -- Compared as text, so this works before 'browsed' / 'personalize_shown' exist.
    SELECT s.step, s.ord, COUNT(DISTINCT fe.session_id)::BIGINT AS n
    FROM steps s
    LEFT JOIN public.funnel_events fe
           ON fe.event_type::TEXT = s.event_type
          AND fe.occurred_at >= p_since
    GROUP BY s.step, s.ord
  ),
  returned AS (
    SELECT 'returned'::TEXT AS step, 9 AS ord, COUNT(*)::BIGINT AS n
    FROM (
      SELECT user_id
      FROM public.funnel_events
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      HAVING MAX(occurred_at) >= p_since
         AND MAX((occurred_at AT TIME ZONE 'Asia/Bangkok')::DATE)
           > MIN((occurred_at AT TIME ZONE 'Asia/Bangkok')::DATE)
    ) r
  )
  SELECT step, n FROM (SELECT * FROM counted UNION ALL SELECT * FROM returned) all_steps ORDER BY ord;
$fn$;

REVOKE ALL ON FUNCTION public.funnel_step_counts(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funnel_step_counts(TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.funnel_step_counts(TIMESTAMPTZ) IS
  'Distinct browser sessions per acquisition-funnel step since p_since, plus returning accounts. Totals only: no arm.';

NOTIFY pgrst, 'reload schema';

-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   select * from public.funnel_step_counts(now() - interval '7 days');

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK ([B] only; a Postgres enum value cannot be dropped, and an unused one is harmless)
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS public.funnel_step_counts(TIMESTAMPTZ);
