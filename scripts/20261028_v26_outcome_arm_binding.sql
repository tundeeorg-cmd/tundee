-- ═════════════════════════════════════════════════════════════════════════════
-- v26 — bind apply_click (the primary outcome) to the arm at the time of the click
--
-- PART 2 step 7 of TunDee_ClaudeCode_Prompts_Oct25.md. NOT RUN YET: run it in the
-- Supabase SQL editor, and only THEN merge the PR whose /api/apply-click writes
-- these columns (deployed first, every apply-click insert would fail and the
-- primary outcome would stop being recorded).
--
-- WHY   apply_click had (user_id, scholarship_id, clicked_at) and nothing else, so
--       a click could not be told apart from a pre-randomization click, a click by
--       someone never randomized, or a click from a personalized vs a browsed list.
--       PREREG §6.1 / §9: only post-assignment clicks by randomized students count.
--
-- WHAT  Seven new nullable columns (idempotent) and a backfill of the arm columns.
--         ranking_variant        arm at the time; NULL = not in the trial at that moment
--         ranking_assigned_at    when that student was assigned (NULL if never)
--         rank_position          1-indexed position in the list clicked from, if known
--         was_personalized       TRUE = clicked from the personalized matches list,
--                                FALSE = from browse, NULL = unknown
--         served_fairness_mode   'on' | 'off' | NULL: what that list was served with
--         excluded_from_primary  TRUE = kept as behaviour, never counted in the primary
--         binding_source         'server' (bound at click) | 'server_unbound' (the
--                                lookup failed; excluded, re-bindable) | 'backfill'
--
-- NOT TOUCHED  Existing columns, ab_arm, cohort, ranking_variant on profiles, or any
--       existing CHECK constraint. New CHECKs are on NEW columns only.
--
-- BACKFILL  Legacy rows get arm + excluded_from_primary derived from profiles, which
--       is exact: assignment is immutable and ranking_assigned_at is recorded. Their
--       rank_position, was_personalized and served_fairness_mode stay NULL — that was
--       never recorded and is not reconstructed. binding_source = 'backfill'.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.apply_click
  ADD COLUMN IF NOT EXISTS ranking_variant       TEXT,
  ADD COLUMN IF NOT EXISTS ranking_assigned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rank_position         INTEGER,
  ADD COLUMN IF NOT EXISTS was_personalized      BOOLEAN,
  ADD COLUMN IF NOT EXISTS served_fairness_mode  TEXT,
  ADD COLUMN IF NOT EXISTS excluded_from_primary BOOLEAN,
  ADD COLUMN IF NOT EXISTS binding_source        TEXT;

ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_ranking_variant_check;
ALTER TABLE public.apply_click ADD CONSTRAINT apply_click_ranking_variant_check
  CHECK (ranking_variant IS NULL OR ranking_variant IN ('baseline', 'fairness_adjusted'));

ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_rank_position_check;
ALTER TABLE public.apply_click ADD CONSTRAINT apply_click_rank_position_check
  CHECK (rank_position IS NULL OR rank_position >= 1);

ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_served_mode_check;
ALTER TABLE public.apply_click ADD CONSTRAINT apply_click_served_mode_check
  CHECK (served_fairness_mode IS NULL OR served_fairness_mode IN ('on', 'off'));

ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_binding_source_check;
ALTER TABLE public.apply_click ADD CONSTRAINT apply_click_binding_source_check
  CHECK (binding_source IS NULL OR binding_source IN ('server', 'server_unbound', 'backfill'));

-- A click counted in the primary result must carry an arm and an assignment time.
ALTER TABLE public.apply_click DROP CONSTRAINT IF EXISTS apply_click_primary_has_arm_check;
ALTER TABLE public.apply_click ADD CONSTRAINT apply_click_primary_has_arm_check
  CHECK (excluded_from_primary IS DISTINCT FROM FALSE
         OR (ranking_variant IS NOT NULL AND ranking_assigned_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_apply_click_primary
  ON public.apply_click (ranking_variant, excluded_from_primary);

-- ── Backfill: only rows not yet bound ────────────────────────────────────────
-- Never randomized, anonymous, or pilot: no arm, excluded.
UPDATE public.apply_click ac
   SET ranking_variant = NULL, excluded_from_primary = TRUE, binding_source = 'backfill',
       ranking_assigned_at = p.ranking_assigned_at
  FROM public.profiles p
 WHERE ac.binding_source IS NULL
   AND p.id = ac.user_id
   AND (p.cohort = 'pilot' OR p.ranking_variant IS NULL OR p.ranking_assigned_at IS NULL OR ac.clicked_at < p.ranking_assigned_at);

-- Randomized, and the click came after the assignment: carries the arm.
UPDATE public.apply_click ac
   SET ranking_variant = p.ranking_variant, ranking_assigned_at = p.ranking_assigned_at,
       excluded_from_primary = FALSE, binding_source = 'backfill'
  FROM public.profiles p
 WHERE ac.binding_source IS NULL
   AND p.id = ac.user_id
   AND p.cohort <> 'pilot'
   AND p.ranking_variant IS NOT NULL
   AND p.ranking_assigned_at IS NOT NULL
   AND ac.clicked_at >= p.ranking_assigned_at;

-- Anonymous clicks and clicks whose user no longer exists.
UPDATE public.apply_click
   SET excluded_from_primary = TRUE, binding_source = 'backfill'
 WHERE binding_source IS NULL;

COMMENT ON COLUMN public.apply_click.excluded_from_primary IS
  'TRUE = kept as behaviour but not counted in the primary outcome (PREREG §6.1, §9). NULL = not yet bound; treat as excluded and re-run the backfill.';
COMMENT ON COLUMN public.apply_click.binding_source IS
  'server = bound by /api/apply-click at click time; server_unbound = lookup failed, excluded; backfill = derived from profiles after the fact (rank/personalization unknown).';

-- ── Verify (read-only; counts by arm are assignment facts, not an outcome rate) ──
--   select binding_source, excluded_from_primary, ranking_variant is not null as has_arm, count(*)
--   from public.apply_click group by 1, 2, 3 order by 1, 2, 3;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP INDEX IF EXISTS public.idx_apply_click_primary;
--   ALTER TABLE public.apply_click
--     DROP CONSTRAINT IF EXISTS apply_click_primary_has_arm_check,
--     DROP CONSTRAINT IF EXISTS apply_click_binding_source_check,
--     DROP CONSTRAINT IF EXISTS apply_click_served_mode_check,
--     DROP CONSTRAINT IF EXISTS apply_click_rank_position_check,
--     DROP CONSTRAINT IF EXISTS apply_click_ranking_variant_check;
--   ALTER TABLE public.apply_click
--     DROP COLUMN IF EXISTS binding_source, DROP COLUMN IF EXISTS excluded_from_primary,
--     DROP COLUMN IF EXISTS served_fairness_mode, DROP COLUMN IF EXISTS was_personalized,
--     DROP COLUMN IF EXISTS rank_position, DROP COLUMN IF EXISTS ranking_assigned_at,
--     DROP COLUMN IF EXISTS ranking_variant;
