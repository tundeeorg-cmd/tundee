-- ═════════════════════════════════════════════════════════════════════════════
-- v34 — funnel events for sign-in inside in-app browsers
--
-- NOT RUN YET.
--
-- WHAT   Six new funnel_event_type values, written by the browser from /start and /auth:
--          login_method_shown          which sign-in methods the visitor was shown
--          otp_sent                    the six-digit email code was requested and sent
--          otp_verified                the code was accepted
--          otp_failed                  the code request or the check failed (context.reason)
--          open_in_chrome_clicked      an Android in-app visitor tapped "open in Chrome for LINE"
--          line_login_clicked_in_app   any LINE tap made from inside an in-app browser
--        Every row's context carries: surface ('start'|'auth'), in_app, app, platform,
--        email_first. NEVER the email address, the code or any id of the person.
--
-- ORDER / DEPLOY
--   The page code can ship before or after this script. Before it is run the new inserts
--   are refused by the enum and only console.warn'd by lib/research/funnel.ts; nothing
--   else is affected. Run it BEFORE the deploy to lose no events.
--   (An enum value added in a transaction cannot be used in that same transaction. Nothing
--   in this file uses the new values, so it is safe to run whole.)
--
-- NOT TOUCHED  any table, column, CHECK constraint, view or function; no research column.
-- NO ARM       nothing here reads ranking_variant or ab_arm.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'login_method_shown';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'otp_sent';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'otp_verified';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'otp_failed';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'open_in_chrome_clicked';
ALTER TYPE public.funnel_event_type ADD VALUE IF NOT EXISTS 'line_login_clicked_in_app';


-- ── Verify (read-only) ───────────────────────────────────────────────────────
--   SELECT unnest(enum_range(NULL::public.funnel_event_type))::text AS value ORDER BY 1;
--   -- the six names above should be listed.
--
-- ── The split this was written for (read-only; counts only, run in the SQL editor) ──
--   SELECT context->>'surface' AS surface, context->>'in_app' AS in_app, context->>'app' AS app,
--          context->>'platform' AS platform,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'login_method_shown')        AS shown,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'otp_sent')                  AS code_sent,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'otp_verified')              AS code_ok,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'otp_failed')                AS code_failed,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'line_login_clicked_in_app') AS line_taps,
--          count(DISTINCT session_id) FILTER (WHERE event_type = 'open_in_chrome_clicked')    AS chrome_taps
--   FROM public.funnel_events
--   WHERE event_type::text IN ('login_method_shown','otp_sent','otp_verified','otp_failed',
--                              'line_login_clicked_in_app','open_in_chrome_clicked')
--     AND occurred_at > now() - interval '14 days'
--   GROUP BY 1, 2, 3, 4 ORDER BY shown DESC NULLS LAST;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  A Postgres enum value cannot be dropped, and an unused one is harmless.
--           Stopping the writes is a code change.
-- ═════════════════════════════════════════════════════════════════════════════
