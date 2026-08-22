-- ═════════════════════════════════════════════════════════════════════════════
-- v15 — Admin "Awards / ผลการได้ทุน" section
--
--   [A] outcomes.status — widened to the UNION of both specs. 'applied' and
--       'not_applied' are different research facts and both are kept:
--         applied      = did apply, result not in yet
--         not_applied  = never applied  (the LINE survey's 4th quick reply)
--   [B] outcomes.source — 'self' (student reported in the web app) added
--       alongside v14's 'web'; both retained so no existing row is invalidated.
--   [C] apply_click indexes — total apply-clicks and the date-range filter.
--   [D] v_admin_outcomes — outcomes ↔ profiles ↔ student_profile. Needed
--       because outcomes and profiles both FK to auth.users rather than to each
--       other, so PostgREST cannot embed them.
--
-- SCHEMA DETECTION. profiles is mid expand/contract rename (v12 adds .province,
-- v13 drops .province_id), so this migration works out which column is actually
-- present rather than assuming. It is correct on a pre-v12, mid-v12 and post-v13
-- database alike. Optional profiles columns (grade_level, display_name) are
-- probed the same way, and the CHECK constraints are located by the column they
-- guard rather than by an assumed auto-generated name.
--
-- Preconditions are checked up front and raise a message naming the migration
-- to run, instead of failing later with a cryptic "column does not exist".
--
-- NOT created: a new `applications` table. apply_click(id, user_id,
-- scholarship_id, clicked_at) from scripts/add_tracker_v2.sql already is that
-- table and is already populated by /api/apply-click. The legacy
-- public.applications is a different thing (UUID FK to the old scholarships
-- table, holds checklist state) and is live in SaveButton / InteractiveChecklist
-- / ApplicationChecklist — left untouched.
--
-- Idempotent: safe to re-run.
-- Hard prerequisite: 20260822_v14_line_outcome_survey.sql (creates outcomes).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $mig$
DECLARE
  province_expr TEXT;
  grade_expr    TEXT;
  name_expr     TEXT;
  sp_join       TEXT;
  sp_province   TEXT;
  sp_region     TEXT;
  sp_level      TEXT;
  sp_consent    TEXT;
  cname         TEXT;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- Preconditions — fail early with an actionable message
  -- ═══════════════════════════════════════════════════════════════════════

  IF to_regclass('public.outcomes') IS NULL THEN
    RAISE EXCEPTION
      'public.outcomes does not exist. Run scripts/20260822_v14_line_outcome_survey.sql first.';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'public.profiles does not exist. Run scripts/20260719_full_research_migration.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc pr
    JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'derive_region'
  ) THEN
    RAISE EXCEPTION
      'public.derive_region() is missing. Run scripts/20260719_full_research_migration.sql first.';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- [A] outcomes.status — locate the CHECK by the column it guards, not by an
  --     assumed name (mirrors the approach in v8 for event.outcome).
  -- ═══════════════════════════════════════════════════════════════════════

  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'public.outcomes'::regclass
    AND con.contype = 'c' AND att.attname = 'status';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.outcomes DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_status_check
    CHECK (status IN ('applied','awarded','waiting','not_applied','rejected','unknown'));

  -- ═══════════════════════════════════════════════════════════════════════
  -- [B] outcomes.source
  -- ═══════════════════════════════════════════════════════════════════════

  cname := NULL;
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'public.outcomes'::regclass
    AND con.contype = 'c' AND att.attname = 'source';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.outcomes DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_source_check
    CHECK (source IN ('self','line','admin','web','partner'));

  -- ═══════════════════════════════════════════════════════════════════════
  -- [C] apply_click indexes — skipped (with a notice) if the table is absent,
  --     so a database that never ran add_tracker_v2.sql still gets the view.
  --     The apply-click tile simply reads 0 until that migration is applied.
  -- ═══════════════════════════════════════════════════════════════════════

  IF to_regclass('public.apply_click') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_apply_click_user    ON public.apply_click (user_id);
    CREATE INDEX IF NOT EXISTS idx_apply_click_clicked ON public.apply_click (clicked_at DESC);
  ELSE
    RAISE NOTICE
      'public.apply_click not found — skipping its indexes. The apply-clicks tile will read 0 until scripts/add_tracker_v2.sql is run.';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- [D] Work out which optional columns actually exist
  -- ═══════════════════════════════════════════════════════════════════════

  -- profiles province: post-v12 name, pre-v12 name, or neither
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles'
                   AND column_name='province')    THEN 'p.province'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles'
                   AND column_name='province_id') THEN 'p.province_id'
    ELSE 'NULL::TEXT'
  END INTO province_expr;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles'
                   AND column_name='grade_level') THEN 'p.grade_level'
    ELSE 'NULL::TEXT'
  END INTO grade_expr;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles'
                   AND column_name='display_name') THEN 'p.display_name'
    ELSE 'NULL::TEXT'
  END INTO name_expr;

  -- student_profile is the research record and wins over the onboarding value.
  -- If the table is absent entirely, fall back to profiles alone.
  IF to_regclass('public.student_profile') IS NOT NULL THEN
    sp_join     := 'LEFT JOIN public.student_profile sp ON sp.user_id = o.user_id';
    sp_province := 'sp.province';
    sp_region   := 'sp.region';
    sp_level    := 'sp.intended_level';
    sp_consent  := 'sp.consent_research';
  ELSE
    sp_join     := '';
    sp_province := 'NULL::TEXT';
    sp_region   := 'NULL::TEXT';
    sp_level    := 'NULL::TEXT';
    sp_consent  := 'NULL::BOOLEAN';
    RAISE NOTICE
      'public.student_profile not found — province/level fall back to profiles only.';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- [D] Build the view against whatever schema is actually there
  -- ═══════════════════════════════════════════════════════════════════════

  EXECUTE format($v$
    CREATE OR REPLACE VIEW public.v_admin_outcomes AS
    SELECT
      o.id,
      o.user_id,
      o.scholarship_id,
      o.scholarship_name,
      o.status,
      o.amount_thb,
      o.consent_research,
      o.reported_at,
      o.source,
      o.note,
      %s                                              AS display_name,
      COALESCE(%s, %s)                                AS province,
      COALESCE(%s, public.derive_region(COALESCE(%s, %s))) AS region,
      COALESCE(%s, %s)                                AS education_level,
      %s                                              AS profile_consent_research
    FROM public.outcomes o
    LEFT JOIN public.profiles p ON p.id = o.user_id
    %s
  $v$,
    name_expr,
    sp_province, province_expr,
    sp_region, sp_province, province_expr,
    sp_level, grade_expr,
    sp_consent,
    sp_join
  );

  RAISE NOTICE 'v_admin_outcomes created (province source: %)', province_expr;

END
$mig$;

COMMENT ON COLUMN public.outcomes.status IS
  'applied = applied, result pending; not_applied = never applied; waiting = applied and explicitly still waiting; awarded / rejected = result known.';

COMMENT ON VIEW public.v_admin_outcomes IS
  'Admin-only join for /admin -> Awards. Contains display_name and province: read with the service role behind the admin gate, never exposed to students. Research exports must filter consent_research = TRUE and pseudonymise user_id.';

COMMIT;

-- =============================================================================
-- Summary of changes
-- =============================================================================
-- outcomes.status CHECK → + 'applied'
-- outcomes.source CHECK → + 'self'
-- New indexes: idx_apply_click_user, idx_apply_click_clicked  (if apply_click exists)
-- New view:    public.v_admin_outcomes
-- No table created or dropped.
--
-- Verify:
--   SELECT * FROM public.v_admin_outcomes LIMIT 5;
-- =============================================================================
