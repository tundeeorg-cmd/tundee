-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_research_views.sql
-- Analysis views for the paper's core measurements.
-- All views join via profile_baselines (immutable T=0 data) so that
-- province / income_bracket reflect the student's state at signup,
-- not their current (potentially edited) profile.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: click-throughs with baseline demographics ─────────────────────────
-- Base CTE used by all three analysis views.
-- A "click-through" = applications row with clicked_through_at IS NOT NULL.
-- Research dataset = research_opt_in = TRUE on the baseline.

-- ── 1. CTR by ab_arm ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.research_ctr_by_arm AS
WITH exposed AS (
  -- Users who were shown at least one recommendation, by arm
  SELECT
    r.user_id,
    r.ab_arm,
    COUNT(DISTINCT r.scholarship_id) AS scholarships_shown
  FROM public.recommendations r
  JOIN public.profile_baselines pb ON pb.user_id = r.user_id
  WHERE pb.research_opt_in = TRUE
    AND r.ab_arm IS NOT NULL
  GROUP BY r.user_id, r.ab_arm
),
clicked AS (
  -- Users who clicked through at least once
  SELECT DISTINCT
    a.user_id,
    a.ab_arm
  FROM public.applications a
  JOIN public.profile_baselines pb ON pb.user_id = a.user_id
  WHERE a.clicked_through_at IS NOT NULL
    AND pb.research_opt_in = TRUE
    AND a.ab_arm IS NOT NULL
)
SELECT
  e.ab_arm,
  COUNT(DISTINCT e.user_id)                                      AS users_exposed,
  COUNT(DISTINCT c.user_id)                                      AS users_clicked,
  ROUND(
    COUNT(DISTINCT c.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT e.user_id), 0),
    4
  )                                                              AS click_through_rate,
  SUM(e.scholarships_shown)                                      AS total_impressions
FROM exposed e
LEFT JOIN clicked c ON c.user_id = e.user_id AND c.ab_arm = e.ab_arm
GROUP BY e.ab_arm
ORDER BY e.ab_arm;


-- ── 2. CTR by province × ab_arm ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.research_ctr_by_province_arm AS
WITH exposed AS (
  SELECT
    r.user_id,
    r.ab_arm,
    pb.province_id,
    COUNT(DISTINCT r.scholarship_id) AS scholarships_shown
  FROM public.recommendations r
  JOIN public.profile_baselines pb ON pb.user_id = r.user_id
  WHERE pb.research_opt_in = TRUE
    AND r.ab_arm IS NOT NULL
    AND pb.province_id IS NOT NULL
  GROUP BY r.user_id, r.ab_arm, pb.province_id
),
clicked AS (
  SELECT DISTINCT
    a.user_id,
    a.ab_arm,
    pb.province_id
  FROM public.applications a
  JOIN public.profile_baselines pb ON pb.user_id = a.user_id
  WHERE a.clicked_through_at IS NOT NULL
    AND pb.research_opt_in = TRUE
    AND a.ab_arm IS NOT NULL
)
SELECT
  e.province_id,
  e.ab_arm,
  COUNT(DISTINCT e.user_id)                                      AS users_exposed,
  COUNT(DISTINCT c.user_id)                                      AS users_clicked,
  ROUND(
    COUNT(DISTINCT c.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT e.user_id), 0),
    4
  )                                                              AS click_through_rate,
  SUM(e.scholarships_shown)                                      AS total_impressions
FROM exposed e
LEFT JOIN clicked c
  ON c.user_id = e.user_id
 AND c.ab_arm  = e.ab_arm
 AND c.province_id = e.province_id
GROUP BY e.province_id, e.ab_arm
ORDER BY e.province_id, e.ab_arm;


-- ── 3. CTR by income_bracket × ab_arm ────────────────────────────────────────
CREATE OR REPLACE VIEW public.research_ctr_by_income_arm AS
WITH exposed AS (
  SELECT
    r.user_id,
    r.ab_arm,
    pb.income_bracket,
    COUNT(DISTINCT r.scholarship_id) AS scholarships_shown
  FROM public.recommendations r
  JOIN public.profile_baselines pb ON pb.user_id = r.user_id
  WHERE pb.research_opt_in = TRUE
    AND r.ab_arm IS NOT NULL
    AND pb.income_bracket IS NOT NULL
  GROUP BY r.user_id, r.ab_arm, pb.income_bracket
),
clicked AS (
  SELECT DISTINCT
    a.user_id,
    a.ab_arm,
    pb.income_bracket
  FROM public.applications a
  JOIN public.profile_baselines pb ON pb.user_id = a.user_id
  WHERE a.clicked_through_at IS NOT NULL
    AND pb.research_opt_in = TRUE
    AND a.ab_arm IS NOT NULL
)
SELECT
  e.income_bracket,
  CASE e.income_bracket
    WHEN 1 THEN '< ฿5k/mo'
    WHEN 2 THEN '฿5k–10k/mo'
    WHEN 3 THEN '฿10k–15k/mo'
    WHEN 4 THEN '฿15k–20k/mo'
    WHEN 5 THEN '฿20k–30k/mo'
    WHEN 6 THEN '฿30k–50k/mo'
    WHEN 7 THEN '> ฿50k/mo'
  END                                                            AS income_label,
  e.ab_arm,
  COUNT(DISTINCT e.user_id)                                      AS users_exposed,
  COUNT(DISTINCT c.user_id)                                      AS users_clicked,
  ROUND(
    COUNT(DISTINCT c.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT e.user_id), 0),
    4
  )                                                              AS click_through_rate,
  SUM(e.scholarships_shown)                                      AS total_impressions
FROM exposed e
LEFT JOIN clicked c
  ON c.user_id = e.user_id
 AND c.ab_arm  = e.ab_arm
 AND c.income_bracket = e.income_bracket
GROUP BY e.income_bracket, e.ab_arm
ORDER BY e.income_bracket, e.ab_arm;


-- ── 4. Per-user research export (for PSM / DiD datasets) ─────────────────────
-- One row per user. Joins baseline (T=0) with outcome (ever clicked through).
-- Filter on research_opt_in = TRUE before exporting for the paper.
CREATE OR REPLACE VIEW public.research_user_outcomes AS
SELECT
  pb.user_id,
  pb.ab_arm,
  pb.grade_level,
  pb.gpa,
  pb.province_id,
  pb.income_bracket,
  pb.welfare_card,
  pb.research_opt_in,
  pb.snapshotted_at                                              AS baseline_at,

  -- Outcome: ever clicked through
  MAX(CASE WHEN a.clicked_through_at IS NOT NULL THEN 1 ELSE 0 END)
                                                                 AS ever_clicked,
  COUNT(DISTINCT CASE WHEN a.clicked_through_at IS NOT NULL
                      THEN a.scholarship_id END)                 AS n_click_throughs,

  -- Matching algorithm context
  MAX(r.score_fairness_adjusted)                                 AS best_fairness_score,
  MIN(r.rank)                                                    AS best_rank_shown,
  COUNT(DISTINCT r.scholarship_id)                               AS n_shown

FROM public.profile_baselines pb
LEFT JOIN public.applications a
  ON a.user_id = pb.user_id
LEFT JOIN public.recommendations r
  ON r.user_id = pb.user_id
GROUP BY
  pb.user_id, pb.ab_arm, pb.grade_level, pb.gpa, pb.province_id,
  pb.income_bracket, pb.welfare_card, pb.research_opt_in, pb.snapshotted_at;
