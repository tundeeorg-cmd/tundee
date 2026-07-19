-- =============================================================================
-- Migration: 20260719_v3_award_tier.sql
-- Adds award_value_tier column to td_scholarships (28-field canonical schema).
--
-- Pre-requisite: scripts/20260719_v2_canonical_finalize.sql
-- Safe to re-run: IF NOT EXISTS guard makes this idempotent.
-- =============================================================================

BEGIN;

-- award_value_tier: normalized code derived from "Award Value Tier" spreadsheet header.
-- Raw display strings (with ≥, en-dashes, parentheses) are normalized on import to:
--   full_ride   | full_tuition | large | medium | small | stipend_only | NULL
ALTER TABLE public.td_scholarships
  ADD COLUMN IF NOT EXISTS award_value_tier TEXT
    CHECK (award_value_tier IN (
      'full_ride', 'full_tuition', 'large', 'medium', 'small', 'stipend_only'
    ));

COMMIT;

-- =============================================================================
-- Summary:
--   Column added to public.td_scholarships:
--     award_value_tier  TEXT  CHECK (... 6 values)  DEFAULT NULL
-- =============================================================================
