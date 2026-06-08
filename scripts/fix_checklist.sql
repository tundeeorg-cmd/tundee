-- ══════════════════════════════════════════════════════════════════════════
-- TunDee — checklist schema migration
-- Run this in Supabase SQL Editor before deploying the new checklist code.
-- All statements are idempotent (IF NOT EXISTS / DO NOTHING).
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Checklist progress array (already exists on most installs)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS checklist_progress INTEGER[] DEFAULT '{}';

-- 2. Per-step completion timestamps
--    Format: {"1": "2026-06-08T22:00:00Z", "3": "2026-06-09T10:00:00Z"}
--    Key = step number (string), Value = ISO-8601 timestamp
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS checklist_dates JSONB DEFAULT '{}';

-- 3. Click-through timestamp (when user hit the Apply button)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS clicked_through_at TIMESTAMPTZ;

-- 4. Submission timestamp (when step 6 is marked done)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- 5. Outcome tracking
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS outcome_source TEXT; -- 'self_report' | 'auto'

-- 6. Unique index required for upsert ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_user_scholarship
  ON applications(user_id, scholarship_id);

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'applications'
ORDER BY ordinal_position;
