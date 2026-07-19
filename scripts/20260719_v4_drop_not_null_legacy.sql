-- =============================================================================
-- Migration: 20260719_v4_drop_not_null_legacy.sql
-- Drop NOT NULL from deprecated columns so the 28-field importer can upsert
-- rows without populating legacy single-language fields.
--
-- Pre-requisite: 20260719_v3_award_tier.sql
-- Safe to re-run: DROP NOT NULL on an already-nullable column is a no-op.
--
-- Root cause: the original add_td_scholarships.sql created:
--   scholarship_name  TEXT NOT NULL
--   funder            TEXT NOT NULL
--   application_link  TEXT NOT NULL
-- The new 28-column importer back-fills these from bilingual fields, but when
-- bilingual names are the only source and the route sets scholarship_name via
-- (effectiveNameEn ?? effectiveNameTh ?? null), a null could reach the DB if
-- something slips through. Dropping NOT NULL removes that fragility entirely.
-- =============================================================================

BEGIN;

-- scholarship_name is now derived from scholarship_name_en/th — no longer required.
ALTER TABLE public.td_scholarships
  ALTER COLUMN scholarship_name  DROP NOT NULL;

-- funder is now derived from funder_en/th — no longer required.
ALTER TABLE public.td_scholarships
  ALTER COLUMN funder            DROP NOT NULL;

-- application_link is now derived from application_url — no longer required.
ALTER TABLE public.td_scholarships
  ALTER COLUMN application_link  DROP NOT NULL;

COMMIT;

-- =============================================================================
-- Summary:
--   Columns made nullable in public.td_scholarships:
--     scholarship_name   TEXT (was NOT NULL)
--     funder             TEXT (was NOT NULL)
--     application_link   TEXT (was NOT NULL)
-- =============================================================================
