-- Migration: add td_scholarships table
-- Run in Supabase SQL Editor.
-- This is the canonical table for the TunDee admin master spreadsheet.
-- Primary key is the string scholarship_id (e.g. TD-0001), not a UUID.

create table if not exists td_scholarships (
  -- 20 columns from the admin spreadsheet
  scholarship_id        text primary key,
  scholarship_name      text not null,
  funder                text not null,
  funder_type           text check (funder_type in (
                          'Thai University',
                          'Thai Government / Royal',
                          'Corporate / Bank / Foundation',
                          'International (open to Thais)'
                        )),
  level                 text check (level in (
                          'High school', 'Undergraduate', 'Master''s', 'PhD', 'Multiple'
                        )),
  field_of_study        text,
  award_amount_thb      text,
  region_eligibility    text,
  targets_low_income    boolean not null default false,
  num_recipients        integer,
  min_gpa               decimal(4,2),
  income_cap_thb        integer,
  language              text,
  deadline_raw          text,
  status                text check (status in ('Open', 'Recheck', 'Closed')),
  application_link      text not null,
  source                text,
  verification_status   text,
  last_verified         date,
  notes                 text,

  -- Derived fields — set at ingest, recomputed nightly
  deadline_date         date,
  deadline_is_rolling   boolean not null default false,
  deadline_note         text,
  is_displayed          boolean not null default false,
  display_reason        text,
  stale                 boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Public can only read displayed rows (students never see hidden ones)
alter table td_scholarships enable row level security;

create policy "Public read td_scholarships"
  on td_scholarships for select
  using (is_displayed = true);

-- Service role key (used in admin API routes) bypasses RLS, so admins see all rows.
-- No additional admin policy needed — the service role always bypasses RLS.

-- Indexes
create index if not exists td_scholarships_displayed_idx
  on td_scholarships (is_displayed, status, deadline_date);

create index if not exists td_scholarships_status_idx
  on td_scholarships (status);

-- Auto-update updated_at trigger
create or replace function update_td_scholarships_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger td_scholarships_updated_at
  before update on td_scholarships
  for each row execute procedure update_td_scholarships_updated_at();
