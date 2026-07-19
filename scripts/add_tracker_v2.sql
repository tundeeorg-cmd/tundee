-- Migration: per-user TD scholarship tracker + LINE reminder infrastructure
-- Run in Supabase SQL Editor after add_td_scholarships.sql

-- ── 1. tracked_scholarship ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracked_scholarship (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id  text        NOT NULL REFERENCES td_scholarships(scholarship_id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'interested'
                              CHECK (status IN ('interested','applying','applied','awarded','rejected')),
  notes           text,
  reminder_opt_in boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scholarship_id)
);

CREATE OR REPLACE FUNCTION update_tracked_scholarship_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tracked_scholarship_updated_at
  BEFORE UPDATE ON tracked_scholarship
  FOR EACH ROW EXECUTE PROCEDURE update_tracked_scholarship_updated_at();

ALTER TABLE tracked_scholarship ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tracked scholarships"
  ON tracked_scholarship FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tracked_scholarship_user_idx       ON tracked_scholarship(user_id);
CREATE INDEX IF NOT EXISTS tracked_scholarship_status_idx     ON tracked_scholarship(user_id, status);

-- ── 2. LINE fields on profiles ────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS line_user_id              text UNIQUE,
  ADD COLUMN IF NOT EXISTS line_linked_at            timestamptz,
  ADD COLUMN IF NOT EXISTS line_link_code            text,
  ADD COLUMN IF NOT EXISTS line_link_code_expires_at timestamptz;

-- ── 3. reminder_log (idempotency) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_log (
  id              bigserial   PRIMARY KEY,
  user_id         uuid        NOT NULL,
  scholarship_id  text        NOT NULL,
  offset_days     integer     NOT NULL,
  deadline_date   date        NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  channel         text        NOT NULL DEFAULT 'line',
  UNIQUE (user_id, scholarship_id, offset_days, deadline_date)
);

ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
-- service role bypasses RLS; no public access

CREATE INDEX IF NOT EXISTS reminder_log_lookup_idx
  ON reminder_log(user_id, scholarship_id, offset_days, deadline_date);

-- ── 4. apply_click (outcome analytics) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS apply_click (
  id              bigserial   PRIMARY KEY,
  user_id         uuid,
  scholarship_id  text        NOT NULL,
  clicked_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE apply_click ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log apply clicks"
  ON apply_click FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS apply_click_scholarship_idx ON apply_click(scholarship_id, clicked_at DESC);

-- ── 5. Let authenticated users read all td_scholarships (tracker shows hidden) ─
-- (RLS policies are OR-ed; anonymous users still only see is_displayed=true)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'td_scholarships'
      AND policyname = 'Authenticated users read all td_scholarships'
  ) THEN
    CREATE POLICY "Authenticated users read all td_scholarships"
      ON td_scholarships FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
