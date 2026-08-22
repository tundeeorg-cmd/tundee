-- ═════════════════════════════════════════════════════════════════════════════
-- PREFLIGHT — what does this database already have?
--
-- Read-only. Changes nothing. Paste into the Supabase SQL Editor and run.
-- Tells you exactly which migrations still need running before
-- 20260822_v14_line_outcome_survey.sql and 20260823_v15_admin_awards.sql.
--
-- Read the "action" column top to bottom: run each missing REQUIRED script in
-- the order listed. OPTIONAL rows only reduce functionality if absent.
-- ═════════════════════════════════════════════════════════════════════════════

WITH checks(step, object, kind, need, creator) AS (VALUES
  (1, 'public.td_scholarships',       'table', 'REQUIRED', 'scripts/add_td_scholarships.sql'),
  (2, 'public.profiles',              'table', 'REQUIRED', 'scripts/20260719_full_research_migration.sql'),
  (3, 'public.event',                 'table', 'OPTIONAL', 'scripts/20260719_full_research_migration.sql'),
  (4, 'public.student_profile',       'table', 'OPTIONAL', 'scripts/20260719_full_research_migration.sql'),
  (5, 'public.apply_click',           'table', 'OPTIONAL', 'scripts/add_tracker_v2.sql'),
  (6, 'public.outcome_followup_log',  'table', 'OPTIONAL', 'scripts/20260720_v8_outcome_followup.sql'),
  (7, 'public.outcomes',              'table', 'REQUIRED', 'scripts/20260822_v14_line_outcome_survey.sql'),
  (8, 'public.survey_log',            'table', 'REQUIRED', 'scripts/20260822_v14_line_outcome_survey.sql'),
  (9, 'public.v_admin_outcomes',      'view',  'REQUIRED', 'scripts/20260823_v15_admin_awards.sql')
)
SELECT
  c.step,
  c.object,
  c.need,
  CASE WHEN to_regclass(c.object) IS NOT NULL THEN '✅ present' ELSE '❌ MISSING' END AS status,
  CASE
    WHEN to_regclass(c.object) IS NOT NULL THEN '—'
    ELSE 'run ' || c.creator
  END AS action
FROM checks c

UNION ALL

-- derive_region() is a function, not a relation, so it needs its own check.
SELECT
  10,
  'public.derive_region()',
  'REQUIRED',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'derive_region'
  ) THEN '✅ present' ELSE '❌ MISSING' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'derive_region'
  ) THEN '—' ELSE 'run scripts/20260719_full_research_migration.sql' END

UNION ALL

-- Which side of the profiles province expand/contract rename are we on?
SELECT
  11,
  'profiles province column',
  'INFO',
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='province')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='province_id')
      THEN 'mid-rename (both)'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='province')
      THEN '✅ province (post-v12)'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='province_id')
      THEN 'province_id (pre-v12)'
    ELSE '❌ neither'
  END,
  'v15 adapts automatically — no action needed'

ORDER BY 1;
