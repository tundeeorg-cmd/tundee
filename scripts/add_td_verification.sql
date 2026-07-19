-- Migration: add in-app verification workflow support
-- Run in Supabase SQL Editor after add_td_scholarships.sql

-- 1. Track who verified each row
ALTER TABLE td_scholarships
  ADD COLUMN IF NOT EXISTS verified_by text;

-- 2. Audit log: who changed what, when
CREATE TABLE IF NOT EXISTS td_audit_log (
  id             bigserial    PRIMARY KEY,
  scholarship_id text         NOT NULL REFERENCES td_scholarships(scholarship_id) ON DELETE CASCADE,
  changed_by     text         NOT NULL,
  changed_at     timestamptz  NOT NULL DEFAULT now(),
  action         text         NOT NULL,  -- 'verify' | 'unverify' | 'set_status' | 'inline_edit'
  changes        jsonb        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS td_audit_log_scholarship_idx ON td_audit_log(scholarship_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS td_audit_log_changed_at_idx  ON td_audit_log(changed_at DESC);

-- Service role bypasses RLS; public never reads audit log.
ALTER TABLE td_audit_log ENABLE ROW LEVEL SECURITY;
