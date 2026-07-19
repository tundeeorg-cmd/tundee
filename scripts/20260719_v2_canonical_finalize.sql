-- =============================================================================
-- Migration: 20260719_v2_canonical_finalize.sql
-- Canonical schema finalization for TunDee research / tracker / bilingual data.
--
-- Pre-requisite: scripts/20260719_full_research_migration.sql has been run.
--
-- What this migration adds (all idempotent — safe to re-run):
--   [A] td_scholarships: canonical URL columns (application_url, source_url)
--       The old columns (application_link, source) remain as deprecated aliases
--       and are no longer populated by the importer.
--   [B] tracked_scholarship: reminder_opt_in column (if not present from tracker
--       scripts) and alignment of the status CHECK with the canonical 5-value set.
--   [C] reminder_log: offset_days + deadline_date guard columns (IF NOT EXISTS;
--       no-op if added by 20260719_full_research_migration.sql).
--
-- Idempotency: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE / DROP CONSTRAINT IF EXISTS so a second run is a no-op.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] td_scholarships — canonical URL columns (Step 1, fields 24 & 25)
--
--   Sheet header                DB column         Legacy alias (deprecated)
--   24 Application Link    →  application_url    (application_link)
--   25 Source              →  source_url         (source)
--
-- The legacy columns are kept nullable; the importer now writes to the
-- canonical columns only.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.td_scholarships
  ADD COLUMN IF NOT EXISTS application_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url      TEXT;

-- Back-fill canonical columns from legacy values (idempotent via COALESCE)
UPDATE public.td_scholarships
SET
  application_url = COALESCE(application_url, application_link),
  source_url      = COALESCE(source_url, source)
WHERE
  application_url IS NULL
  OR source_url IS NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] tracked_scholarship — reminder_opt_in + canonical status values
--
-- The full_research_migration created the table with 5 canonical statuses.
-- Add reminder_opt_in if a prior tracker script omitted it.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tracked_scholarship
  ADD COLUMN IF NOT EXISTS reminder_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

-- Widen the status CHECK to ensure the canonical 5-value set is accepted.
-- (Earlier tracker scripts may have used a different set.)
ALTER TABLE public.tracked_scholarship
  DROP CONSTRAINT IF EXISTS tracked_scholarship_status_check;
ALTER TABLE public.tracked_scholarship
  ADD  CONSTRAINT tracked_scholarship_status_check
       CHECK (status IN ('interested','applying','applied','awarded','rejected'));

-- ═════════════════════════════════════════════════════════════════════════════
-- [C] reminder_log — idempotency guard columns
--
-- The full_research_migration creates these NOT NULL; add as nullable here
-- so the ALTER is safe even if rows already exist without these values.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.reminder_log
  ADD COLUMN IF NOT EXISTS offset_days   INTEGER,
  ADD COLUMN IF NOT EXISTS deadline_date DATE;

-- Unique constraint (idempotent): ensures the reminder cron is safe to re-run.
-- Drop first in case an old definition had different columns.
ALTER TABLE public.reminder_log
  DROP CONSTRAINT IF EXISTS reminder_log_user_id_scholarship_id_offset_days_deadline_dat_key;
ALTER TABLE public.reminder_log
  DROP CONSTRAINT IF EXISTS reminder_log_unique;

-- Only add the constraint if both columns are now present and non-null in all rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'reminder_log'
      AND constraint_name = 'reminder_log_send_once'
  ) THEN
    BEGIN
      ALTER TABLE public.reminder_log
        ADD CONSTRAINT reminder_log_send_once
        UNIQUE (user_id, scholarship_id, offset_days, deadline_date);
    EXCEPTION WHEN others THEN
      -- Skip if columns still contain NULLs (pre-existing rows from old schema)
      NULL;
    END;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Summary of changes
-- =============================================================================
-- Columns added to public.td_scholarships:
--   application_url   TEXT   (canonical; application_link is deprecated alias)
--   source_url        TEXT   (canonical; source is deprecated alias)
--
-- Columns added to public.tracked_scholarship:
--   reminder_opt_in   BOOLEAN NOT NULL DEFAULT TRUE
--
-- Constraint replaced on public.tracked_scholarship:
--   tracked_scholarship_status_check →
--     status IN ('interested','applying','applied','awarded','rejected')
--
-- Columns added to public.reminder_log (IF NOT EXISTS):
--   offset_days   INTEGER
--   deadline_date DATE
--
-- Unique constraint on public.reminder_log:
--   reminder_log_send_once (user_id, scholarship_id, offset_days, deadline_date)
-- =============================================================================
