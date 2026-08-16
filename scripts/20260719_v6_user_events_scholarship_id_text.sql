-- =============================================================================
-- Migration: 20260719_v6_user_events_scholarship_id_text.sql
-- Change user_events.scholarship_id from UUID to TEXT.
--
-- Problem: td_scholarships uses TEXT PKs ("TD-0001" style), but user_events
-- declared scholarship_id as UUID, causing 400/22P02 on every event insert
-- that includes a scholarship_id.
--
-- Safe to re-run: ALTER COLUMN TYPE to the same type is a no-op in Postgres.
-- Existing NULL values are unaffected; no data loss.
-- =============================================================================

ALTER TABLE public.user_events
  ALTER COLUMN scholarship_id TYPE TEXT USING scholarship_id::TEXT;
