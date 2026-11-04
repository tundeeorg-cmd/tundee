-- ═════════════════════════════════════════════════════════════════════════════
-- v35 — funnel events for the guidance on /scholarships
--
-- NOT RUN YET.
--
-- WHAT   Three new funnel_event_type values, written by the browser from /scholarships:
--          guide_dismissed           the student closed the "how this page works" guide
--          profile_nudge_clicked     tapped "complete my profile" (context.completeness 0–100,
--                                    context.missing = the matching fields still empty,
--                                    context.surface = 'matches' | 'no_profile')
--          guest_start_cta_clicked   a signed-out visitor tapped the /start quiz card
--        The existing 'search' event gains context.from_tab ('matches' | 'browse') and is now
--        written once per settled query (~600 ms) instead of on every keystroke.
--        No row carries an email, a name or a free-text answer other than the search query,
--        which 'search' already carried.
--
-- ORDER / DEPLOY
--   The page code can ship before or after this script. Before it is run the three new
--   inserts are refused by the enum and only console.warn'd by lib/research/funnel.ts;
--   nothing else is affected. Run it BEFORE the deploy to lose no events.
--   (An enum value added in a transaction cannot be used in that same transaction. Nothing
--   in this file uses the new values, so it is safe to run whole.)
--
-- NOT TOUCHED  any table, column, CHECK constraint, view or function; no research column.
-- NO ARM       nothing here reads ranking_variant or ab_arm.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'guide_dismissed';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'profile_nudge_clicked';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'guest_start_cta_clicked';


-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   SELECT unnest(enum_range(NULL::public.funnel_event_type))::text AS value ORDER BY 1;
--   -- the three names above should be listed.
--
-- ── What it was written to answer (read-only; counts only) ─────────────────────
--   -- Do students search from the matches tab, and what for?
--   SELECT context->>'from_tab' AS from_tab, count(*) AS searches, count(DISTINCT session_id) AS sessions
--   FROM public.funnel_events
--   WHERE event_type = 'search' AND occurred_at > now() - interval '14 days'
--   GROUP BY 1 ORDER BY 2 DESC;
--
--   -- Does the profile card get tapped, and at what completeness?
--   SELECT context->>'surface' AS surface, context->>'completeness' AS completeness, count(*) AS taps
--   FROM public.funnel_events
--   WHERE event_type::text = 'profile_nudge_clicked' AND occurred_at > now() - interval '14 days'
--   GROUP BY 1, 2 ORDER BY 3 DESC;
--
--   -- Guests on /scholarships who went to the quiz
--   SELECT count(DISTINCT session_id) FILTER (WHERE event_type::text = 'guest_start_cta_clicked') AS quiz_taps,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'view_list' AND user_id IS NULL)  AS guest_views
--   FROM public.funnel_events
--   WHERE occurred_at > now() - interval '14 days';

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  A Postgres enum value cannot be dropped, and an unused one is harmless.
--           Stopping the writes is a code change.
-- ═════════════════════════════════════════════════════════════════════════════
