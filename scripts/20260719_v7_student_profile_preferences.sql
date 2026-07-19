-- ═════════════════════════════════════════════════════════════════════════════
-- v7 — student_profile.preferred_scholarship_types + profile_updated event type
--
-- Additive only: nullable column with a value-set CHECK, and one new ENUM
-- label. Safe to run against a live database; nothing existing is altered.
--
-- Context: the /profile/student research+matching form (Step F "Preferences")
-- lets a student optionally flag which award-value tiers they'd prioritise
-- (mirrors td_scholarships.award_value_tier so the value set stays canonical
-- across the app). profile_updated lets the client log a lightweight funnel
-- event whenever the form is saved, for the study's audit trail.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. student_profile.preferred_scholarship_types ------------------------------
ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS preferred_scholarship_types TEXT[];

ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_preferred_scholarship_types_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_preferred_scholarship_types_check
       CHECK (
         preferred_scholarship_types IS NULL
         OR preferred_scholarship_types <@ ARRAY[
              'full_ride','full_tuition','large','medium','small','stipend_only'
            ]::TEXT[]
       );

-- 2. funnel_events: add 'profile_updated' -------------------------------------
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction block as a
-- statement that uses the new value, but as a standalone statement it's safe
-- to run against a live DB (PG 12+ supports IF NOT EXISTS here).
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'profile_updated';
