-- ═════════════════════════════════════════════════════════════════════════════
-- Verification for v16 + v17 — the Phase 2A checklist, as runnable SQL.
--
-- FOR THE SUPABASE SQL EDITOR. No psql meta-commands (\echo and friends are a
-- psql client feature; the editor sends raw SQL to the server, which rejects
-- them with "syntax error at or near \").
--
-- Run PART A first — it is one statement and returns every read-only check as
-- a labelled PASS/FAIL row. Then run parts B and C separately: each proves a
-- trigger by attempting an illegal write inside a transaction it rolls back.
-- ═════════════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════════════════
-- PART A — read-only checks. Select all of this and run it as one statement.
-- ═════════════════════════════════════════════════════════════════════════════

WITH
-- [1] Pilot cohort: nobody who predates randomization may carry an arm.
pilot AS (
  SELECT
    1 AS seq,
    '1. Pilot cohort not randomized' AS check_name,
    coalesce(string_agg(
      cohort || '=' || n::text || ' (randomized ' || r::text || ')', ', ' ORDER BY cohort
    ), 'no profiles') AS detail,
    CASE WHEN coalesce(sum(r) FILTER (WHERE cohort = 'pilot'), 0) = 0
         THEN 'PASS' ELSE 'FAIL — PREREG 9.1 violated' END AS verdict
  FROM (
    SELECT cohort,
           count(*) AS n,
           count(*) FILTER (WHERE ranking_variant IS NOT NULL) AS r
    FROM public.profiles GROUP BY cohort
  ) t
),

-- [2] Every assignment carries its full audit trail.
audit AS (
  SELECT
    2, '2. Assignments are auditable',
    'assigned=' || count(*) FILTER (WHERE ranking_variant IS NOT NULL)::text ||
    ', missing_timestamp=' || count(*) FILTER (WHERE ranking_variant IS NOT NULL AND ranking_assigned_at IS NULL)::text ||
    ', missing_version='   || count(*) FILTER (WHERE ranking_variant IS NOT NULL AND assignment_algorithm_version IS NULL)::text ||
    ', missing_eligible='  || count(*) FILTER (WHERE ranking_variant IS NOT NULL AND fairness_eligible IS NULL)::text,
    CASE WHEN count(*) FILTER (
           WHERE ranking_variant IS NOT NULL
             AND (ranking_assigned_at IS NULL
                  OR assignment_algorithm_version IS NULL
                  OR fairness_eligible IS NULL)) = 0
         THEN 'PASS' ELSE 'FAIL — assignment missing audit trail' END
  FROM public.profiles
),

-- [3] Arm balance inside the primary stratum.
balance AS (
  SELECT
    3, '3. Arm balance (target population)',
    'baseline=' || count(*) FILTER (WHERE ranking_variant = 'baseline')::text ||
    ', fairness_adjusted=' || count(*) FILTER (WHERE ranking_variant = 'fairness_adjusted')::text,
    CASE
      WHEN count(*) = 0 THEN 'INFO — nobody randomized yet'
      WHEN abs(count(*) FILTER (WHERE ranking_variant = 'baseline')
             - count(*) FILTER (WHERE ranking_variant = 'fairness_adjusted'))
           <= greatest(10, count(*) / 10)
        THEN 'PASS — within expected imbalance'
      ELSE 'REVIEW — larger split than chance would usually give'
    END
  FROM public.profiles
  WHERE cohort = 'main' AND ranking_variant IS NOT NULL AND is_target_population
),

-- [4] Eligibility recorded for users in BOTH arms.
elig AS (
  SELECT
    4, '4. fairness_eligible recorded in both arms',
    coalesce(string_agg(ranking_variant || ': eligible=' || e::text || '/' || n::text,
                        ', ' ORDER BY ranking_variant), 'none randomized'),
    CASE WHEN count(*) = 0 THEN 'INFO — nobody randomized yet'
         WHEN count(*) = 2 THEN 'PASS — both arms present'
         ELSE 'REVIEW — only one arm has users' END
  FROM (
    SELECT ranking_variant,
           count(*) AS n,
           count(*) FILTER (WHERE fairness_eligible) AS e
    FROM public.profiles
    WHERE cohort = 'main' AND ranking_variant IS NOT NULL
    GROUP BY ranking_variant
  ) t
),

-- [5] recruitment_source is a closed set AND independent of region_group.
--     A northeast student under bkk_2026 is CORRECT (PREREG 5.4): campaign is
--     how they were reached, region_group is who they are.
recruit AS (
  SELECT
    5, '5. recruitment_source valid + independent of region',
    coalesce(string_agg(recruitment_source || '/' || coalesce(region_group,'?') || '=' || n::text,
                        ', ' ORDER BY recruitment_source), 'none set'),
    CASE
      WHEN count(*) = 0 THEN 'INFO — no recruitment_source recorded yet'
      WHEN bool_and(recruitment_source IN ('isaan_2026','bkk_2026','organic'))
        THEN 'PASS — closed set respected'
      ELSE 'FAIL — value outside the pre-registered set' END
  FROM (
    SELECT recruitment_source, region_group, count(*) AS n
    FROM public.profiles
    WHERE recruitment_source IS NOT NULL
    GROUP BY recruitment_source, region_group
  ) t
),

-- [6] Research consent is versioned and timestamped.
consent AS (
  SELECT
    6, '6. Research consent auditable',
    'consented=' || count(*) FILTER (WHERE consent_research)::text ||
    ', declined='  || count(*) FILTER (WHERE NOT consent_research)::text,
    CASE WHEN bool_and(NOT consent_research
                       OR (consent_version IS NOT NULL AND consent_at IS NOT NULL))
         THEN 'PASS' ELSE 'FAIL — consent without version/timestamp' END
  FROM public.student_profile
),

-- [7] RLS still enabled on every table that had it.
rls AS (
  SELECT
    7, '7. RLS still enabled',
    string_agg(relname || '=' || CASE WHEN relrowsecurity THEN 'on' ELSE 'OFF' END,
               ', ' ORDER BY relname),
    CASE WHEN bool_and(relrowsecurity) THEN 'PASS' ELSE 'FAIL — RLS is OFF somewhere' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('profiles','student_profile','funnel_events',
                      'recommendation_request','user_events')
),

-- [8] The immutability trigger and append-only trigger actually exist.
triggers AS (
  SELECT
    8, '8. Triggers installed',
    coalesce(string_agg(tgname, ', ' ORDER BY tgname), 'NONE FOUND'),
    CASE WHEN count(*) FILTER (WHERE tgname = 'trg_freeze_ranking_variant') = 1
          AND count(*) FILTER (WHERE tgname = 'trg_recreq_append_only')     = 1
         THEN 'PASS — both present (parts B and C prove they fire)'
         ELSE 'FAIL — a trigger is missing' END
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('trg_freeze_ranking_variant','trg_recreq_append_only')
),

-- [9] Probe rows left behind by earlier verification.
probes AS (
  SELECT
    9, '9. Probe rows to clean up',
    count(*)::text || ' rows',
    CASE WHEN count(*) = 0 THEN 'PASS — none' ELSE 'ACTION — run PART D' END
  FROM public.funnel_events
  WHERE context->>'probe' = 'true'
     OR session_id LIKE 'verify-p5-%'
     OR session_id = 'verify-enum-probe'
)

SELECT check_name, detail, verdict FROM (
  SELECT * FROM pilot
  UNION ALL SELECT * FROM audit
  UNION ALL SELECT * FROM balance
  UNION ALL SELECT * FROM elig
  UNION ALL SELECT * FROM recruit
  UNION ALL SELECT * FROM consent
  UNION ALL SELECT * FROM rls
  UNION ALL SELECT * FROM triggers
  UNION ALL SELECT * FROM probes
) all_checks
ORDER BY seq;


-- ═════════════════════════════════════════════════════════════════════════════
-- PART B — PROOF that ranking_variant is immutable (PREREG 4).
--
-- Run these three lines together. An ERROR mentioning "ranking_variant is
-- immutable" is the PASS: the trigger refused the change. If it reports
-- success instead, the trigger is not working — the ROLLBACK still undoes it.
--
-- Skip if PART A row 1 shows nobody randomized yet; there is nothing to freeze.
-- ═════════════════════════════════════════════════════════════════════════════

-- BEGIN;
-- UPDATE public.profiles
--    SET ranking_variant = CASE WHEN ranking_variant = 'baseline'
--                               THEN 'fairness_adjusted' ELSE 'baseline' END
--  WHERE id = (SELECT id FROM public.profiles WHERE ranking_variant IS NOT NULL LIMIT 1);
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════════
-- PART C — PROOF that recommendation_request is append-only.
-- Same idea: an ERROR is the PASS. Skip if the table is still empty.
-- ═════════════════════════════════════════════════════════════════════════════

-- BEGIN;
-- UPDATE public.recommendation_request
--    SET algorithm_version = 'tampered'
--  WHERE id = (SELECT id FROM public.recommendation_request LIMIT 1);
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════════
-- PART D — remove the probe rows left by earlier verification.
-- Every one carries context->>'probe' = 'true'; no real event matches.
-- ═════════════════════════════════════════════════════════════════════════════

-- DELETE FROM public.funnel_events
-- WHERE context->>'probe' = 'true'
--    OR session_id LIKE 'verify-p5-%'
--    OR session_id = 'verify-enum-probe';
