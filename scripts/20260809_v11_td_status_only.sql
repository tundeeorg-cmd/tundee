-- Migration: switch td_scholarships display gate to Status-only
-- Run in Supabase SQL Editor after add_td_scholarships.sql / add_td_verification.sql.
--
-- What changed:
--   * New columns: open_date, date_confidence, status_effective.
--   * `status` is repurposed from the old 3-state admin workflow value
--     (Open / Recheck / Closed) to the spreadsheet's computed 4-state value
--     (Opening Soon / Open / Closing Soon / Closed / blank).
--   * Visibility (`is_displayed`) is now driven ONLY by `status_effective`.
--     `verification_status` no longer gates visibility — it stays as an
--     admin-only field (see lib/tdScholarships/displayGate.ts).

-- 1. New columns ---------------------------------------------------------
alter table td_scholarships
  add column if not exists open_date        date,
  add column if not exists date_confidence  text,
  add column if not exists status_effective text;

-- 2. Normalize existing status values BEFORE adding the new constraint ----
-- Old 3-state admin values (e.g. 'Recheck') aren't in the new 4-state enum
-- and would violate the check constraint below. Clear anything that doesn't
-- already match the new enum — it'll be hidden (blank) until the next import
-- or admin edit sets a real status.
update td_scholarships
  set status = null
  where status is not null
    and status not in ('Opening Soon', 'Open', 'Closing Soon', 'Closed', '');

-- 3. Replace the old 3-state status constraint with the new 4-state one --
alter table td_scholarships drop constraint if exists td_scholarships_status_check;
alter table td_scholarships add constraint td_scholarships_status_check
  check (status is null or status in ('Opening Soon', 'Open', 'Closing Soon', 'Closed', ''));

alter table td_scholarships drop constraint if exists td_scholarships_date_confidence_check;
alter table td_scholarships add constraint td_scholarships_date_confidence_check
  check (date_confidence is null or date_confidence in ('Confirmed', 'Estimated'));

alter table td_scholarships drop constraint if exists td_scholarships_status_effective_check;
alter table td_scholarships add constraint td_scholarships_status_effective_check
  check (status_effective is null or status_effective in ('Opening Soon', 'Open', 'Closing Soon', 'Closed', ''));

-- 4. Backfill status_effective + is_displayed for existing rows ----------
-- Mirrors lib/tdScholarships/displayGate.ts: statusFromDates() when both
-- open_date and deadline_date are real dates, else the normalized status
-- (already cleared of any non-enum legacy values in step 2 above).
update td_scholarships set status_effective = (
  case
    when open_date is not null and deadline_date is not null then
      case
        when deadline_date < ((now() at time zone 'Asia/Bangkok')::date) then 'Closed'
        when ((now() at time zone 'Asia/Bangkok')::date) < open_date then 'Opening Soon'
        when deadline_date <= ((now() at time zone 'Asia/Bangkok')::date) + 14 then 'Closing Soon'
        else 'Open'
      end
    when status in ('Opening Soon', 'Open', 'Closing Soon', 'Closed') then status
    else null
  end
);

update td_scholarships set
  is_displayed   = coalesce(status_effective, '') in ('Opening Soon', 'Open', 'Closing Soon'),
  display_reason = case
    when coalesce(status_effective, '') in ('Opening Soon', 'Open', 'Closing Soon')
      then 'Displayed (status=' || status_effective || ')'
    else 'Hidden (status=' || coalesce(nullif(status_effective, ''), 'blank — no usable dates or sheet status') || ')'
  end;

-- 5. Index for the new gate ------------------------------------------------
create index if not exists td_scholarships_status_effective_idx
  on td_scholarships (is_displayed, status_effective, deadline_date);

comment on column td_scholarships.status is
  'Raw 4-state status from the spreadsheet''s computed status column: Opening Soon | Open | Closing Soon | Closed | blank.';
comment on column td_scholarships.status_effective is
  'Status the site actually uses — derived from open_date/deadline_date when both are real dates, else falls back to status. Drives is_displayed. See lib/tdScholarships/displayGate.ts.';
comment on column td_scholarships.verification_status is
  'Admin-only — no longer affects visibility. Kept for admin workflow/audit.';
