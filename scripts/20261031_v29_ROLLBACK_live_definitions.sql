-- ═════════════════════════════════════════════════════════════════════════════
-- v29 ROLLBACK — the live definitions of the six views PART 3 rewrites
--
-- NOT RUN. Run it ONLY to undo scripts/20261031_v29_research_views_consent_gate.sql
-- PART 3. Captured from `pg_get_viewdef` by PART 2 BLOCK A on 2026-10-26, before PART 3.
--
-- The views are re-created with CREATE OR REPLACE VIEW, so columns, owner, grants and
-- options (all six have reloptions = NULL) are unchanged — the same way PART 3 changed them.
--
-- NOT in this file, because PART 3 does not change them:
--   research_export          already gated (v31)
--   v_admin_outcomes         exempt in PART 3 (shows consent as a column; locked to service role)
--   v_outcomes_research      a different consent store (outcomes.consent_research)
--
-- Do NOT drop research_export_allowed() & co. — research_export (v31) calls them.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.v_event_research_export AS
 SELECT encode(sha256(e.user_id::text::bytea), 'hex'::text) AS pseudo_user_id,
    e.session_id,
    e.scholarship_id,
    e.event_type,
    e.rank_position,
    e.score,
    e.recommender_variant,
    e.fairness_mode,
    e.outcome,
    e.outcome_source,
    e.outcome_date,
    e.context,
    e.occurred_at,
    sp.region,
    sp.area_type,
    sp.household_income_band,
    sp.welfare_card,
    sp.school_type,
    sp.first_generation,
    sp.birth_year,
    sp.gpa,
    sp.intended_level,
    sp.intended_field,
    ea.variant AS experiment_variant
   FROM event e
     JOIN student_profile sp ON sp.user_id = e.user_id AND sp.consent_research = true
     LEFT JOIN experiment_assignment ea ON ea.user_id = e.user_id AND ea.experiment_key = 'ranking'::text
  WHERE e.user_id IS NOT NULL;

CREATE OR REPLACE VIEW public.v_funnel_by_income AS
 SELECT sp.household_income_band,
    count(*) FILTER (WHERE fe.event_type = 'impression'::funnel_event_type) AS impressions,
    count(*) FILTER (WHERE fe.event_type = 'view_detail'::funnel_event_type) AS view_details,
    count(*) FILTER (WHERE fe.event_type = 'click_apply'::funnel_event_type) AS click_applies,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND ((fe.context ->> 'outcome'::text) = ANY (ARRAY['applied'::text, 'awarded'::text]))) AS self_reported_applied,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND (fe.context ->> 'outcome'::text) = 'awarded'::text) AS self_reported_awarded,
    count(DISTINCT fe.user_id) AS unique_users
   FROM funnel_events fe
     JOIN student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = true
  GROUP BY sp.household_income_band;

CREATE OR REPLACE VIEW public.v_funnel_by_region AS
 SELECT sp.region,
    count(*) FILTER (WHERE fe.event_type = 'impression'::funnel_event_type) AS impressions,
    count(*) FILTER (WHERE fe.event_type = 'view_detail'::funnel_event_type) AS view_details,
    count(*) FILTER (WHERE fe.event_type = 'click_apply'::funnel_event_type) AS click_applies,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND ((fe.context ->> 'outcome'::text) = ANY (ARRAY['applied'::text, 'awarded'::text]))) AS self_reported_applied,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND (fe.context ->> 'outcome'::text) = 'awarded'::text) AS self_reported_awarded,
    count(DISTINCT fe.user_id) AS unique_users
   FROM funnel_events fe
     JOIN student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = true
  GROUP BY sp.region;

CREATE OR REPLACE VIEW public.v_funnel_by_school_type AS
 SELECT sp.school_type,
    count(*) FILTER (WHERE fe.event_type = 'impression'::funnel_event_type) AS impressions,
    count(*) FILTER (WHERE fe.event_type = 'view_detail'::funnel_event_type) AS view_details,
    count(*) FILTER (WHERE fe.event_type = 'click_apply'::funnel_event_type) AS click_applies,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND ((fe.context ->> 'outcome'::text) = ANY (ARRAY['applied'::text, 'awarded'::text]))) AS self_reported_applied,
    count(*) FILTER (WHERE fe.event_type = 'self_report_outcome'::funnel_event_type AND (fe.context ->> 'outcome'::text) = 'awarded'::text) AS self_reported_awarded,
    count(DISTINCT fe.user_id) AS unique_users
   FROM funnel_events fe
     JOIN student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = true
  GROUP BY sp.school_type;

CREATE OR REPLACE VIEW public.v_research_export AS
 SELECT encode(sha256(fe.user_id::text::bytea), 'hex'::text) AS pseudo_user_id,
    fe.session_id,
    fe.scholarship_id,
    fe.event_type,
    fe.context,
    fe.occurred_at,
    sp.region,
    sp.area_type,
    sp.household_income_band,
    sp.welfare_card,
    sp.school_type,
    sp.first_generation,
    sp.birth_year,
    sp.gpa,
    sp.intended_level,
    sp.intended_field,
    ea.variant AS experiment_variant
   FROM funnel_events fe
     JOIN student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = true
     LEFT JOIN experiment_assignment ea ON ea.user_id = fe.user_id AND ea.experiment_key = 'ranking'::text
  WHERE fe.user_id IS NOT NULL;

CREATE OR REPLACE VIEW public.v_research_population AS
 SELECT p.id AS user_id,
    p.cohort,
    p.ranking_variant,
    p.region_group,
    p.income_bracket,
    p.is_target_population,
    p.recruitment_source,
    p.fairness_eligible,
    p.ranking_assigned_at,
    p.assignment_algorithm_version,
    p.grade_level,
    p.created_at AS enrolled_at
   FROM profiles p
     JOIN student_profile sp ON sp.user_id = p.id
  WHERE p.cohort = 'main'::text AND p.ranking_variant IS NOT NULL AND sp.consent_research = true;

COMMIT;

-- Verify (read-only): these six should no longer mention research_export_allowed.
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
--   where c.relkind='v' and c.relname in ('v_event_research_export','v_funnel_by_income','v_funnel_by_region',
--     'v_funnel_by_school_type','v_research_export','v_research_population')
--     and pg_get_viewdef(c.oid,true) ilike '%research_export_allowed%';   -- expect no rows
