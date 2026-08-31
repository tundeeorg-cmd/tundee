-- ═════════════════════════════════════════════════════════════════════════════
-- v20 — pending_intake: the /start answers, parked server-side
--
-- THE PROBLEM
-- ───────────
-- A visitor answers three questions on /start, and those answers live in a
-- cookie (tundee_preview) plus a `?p=` query param. Both are tied to ONE
-- browser. Nearly all our traffic is inside the Facebook in-app browser, and
-- the moment a student opens the sign-in link from their email, the operating
-- system hands it to Chrome or Safari — a different browser, a different cookie
-- jar, and no `?p=` unless it happened to be threaded through every hop.
--
-- They arrive signed in and blank, and /profile/setup asks them their grade,
-- GPA and province all over again. That is the drop-off the /start preview
-- exists to remove.
--
-- THE FIX
-- ───────
-- Park the answers on the server the moment they are given, and carry only an
-- id. An id is short enough to thread through an email redirect and a LINE
-- state parameter without any of the fragility of a base64 payload in a URL.
--
-- SECURITY SHAPE
-- ──────────────
-- Anonymous INSERT is required: the whole point is that this happens before the
-- visitor has an account. Nothing else is granted to anon — no SELECT, no
-- UPDATE, no DELETE — so a row can be written but never read back or enumerated
-- by anyone but the service role. The id is a random uuid, so guessing one is
-- not a practical attack, and the contents are not sensitive on their own
-- (education level, province, income band, optional GPA — no name, no email, no
-- contact of any kind).
--
-- Rows are claimed once and expire after 7 days.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_intake (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answers    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.pending_intake IS
  'Answers given on /start before the visitor had an account. Claimed once at '
  '/auth/callback and merged into profiles. Anonymous INSERT only; readable by '
  'the service role alone. Deleted after 7 days if never claimed.';

COMMENT ON COLUMN public.pending_intake.answers IS
  'The PreviewInput shape: { level, province, income, gpa }. No PII.';

-- An answers blob must be an object, not a bare array or scalar — a malformed
-- body should fail at the boundary, not when something tries to read it back.
ALTER TABLE public.pending_intake
  DROP CONSTRAINT IF EXISTS pending_intake_answers_object_check;
ALTER TABLE public.pending_intake
  ADD CONSTRAINT pending_intake_answers_object_check
  CHECK (jsonb_typeof(answers) = 'object');

-- claimed_by and claimed_at travel together or not at all.
ALTER TABLE public.pending_intake
  DROP CONSTRAINT IF EXISTS pending_intake_claim_complete_check;
ALTER TABLE public.pending_intake
  ADD CONSTRAINT pending_intake_claim_complete_check
  CHECK ((claimed_by IS NULL) = (claimed_at IS NULL));

-- Supports the 7-day cleanup sweep.
CREATE INDEX IF NOT EXISTS idx_pending_intake_unclaimed
  ON public.pending_intake (created_at)
  WHERE claimed_by IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.pending_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can park intake"       ON public.pending_intake;
DROP POLICY IF EXISTS "nobody reads intake"        ON public.pending_intake;

-- INSERT only, for anon and authenticated alike. WITH CHECK (true) is the whole
-- grant: there is no USING clause, so this policy cannot be used to read.
CREATE POLICY "anon can park intake"
  ON public.pending_intake FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policy is created on purpose. With RLS enabled and no
-- policy, those are denied for every role except the service role, which
-- bypasses RLS entirely. /auth/callback claims rows with the service role.
GRANT INSERT ON public.pending_intake TO anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.pending_intake FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═════════════════════════════════════════════════════════════════════════════
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pending_intake';
--   -- expect exactly one row: INSERT
--
--   -- With the ANON key, this must fail:
--   --   GET /rest/v1/pending_intake?select=*
--   -- and this must succeed:
--   --   POST /rest/v1/pending_intake  {"answers":{"level":"M4-M6"}}
