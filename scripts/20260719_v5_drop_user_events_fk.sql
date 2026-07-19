-- =============================================================================
-- Migration: 20260719_v5_drop_user_events_fk.sql
-- Drop the FK constraint on user_events.user_id.
--
-- Problem: user_events_user_id_fkey references auth.users(id). For some users
-- (stale JWT, profile created before auth row was committed, magic-link timing)
-- the insert violates the FK and returns 409/23503, polluting the network tab.
--
-- Fix: drop the FK. user_events is an append-only analytics log; referential
-- integrity on user_id is not required — the user_id value comes directly from
-- the verified JWT (supabase.auth.getUser) so it is always trustworthy.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS is a no-op if already dropped.
-- =============================================================================

ALTER TABLE public.user_events
  DROP CONSTRAINT IF EXISTS user_events_user_id_fkey;
