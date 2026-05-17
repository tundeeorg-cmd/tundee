-- TunDee (ทุนดี) Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Table: scholarships
-- ─────────────────────────────────────────────
create table if not exists scholarships (
  id                   uuid primary key default gen_random_uuid(),
  name_th              text not null,
  name_en              text,
  funder_name_th       text,
  funder_name_en       text,
  funder_type          text check (funder_type in ('government','corporate','foundation','royal','university')),
  amount_thb           integer,
  amount_type          text check (amount_type in ('monthly','one-time','annual')),
  min_gpa              decimal(3,2),
  max_income_thb       integer,
  field_of_study       text[],
  province_restriction text[],
  welfare_card_priority boolean default false,
  deadline_date        date,
  application_url      text,
  documents_required   text[],
  description_th       text,
  description_en       text,
  is_active            boolean default true,
  created_at           timestamptz default now(),
  last_verified_at     timestamptz
);

-- Row-Level Security (allow public read for v1)
alter table scholarships enable row level security;

create policy "Public read scholarships"
  on scholarships for select
  using (is_active = true);

-- ─────────────────────────────────────────────
-- Table: scholarship_checklist_steps
-- ─────────────────────────────────────────────
create table if not exists scholarship_checklist_steps (
  id              integer primary key,
  step_number     integer not null,
  name_th         text not null,
  name_en         text not null,
  description_th  text,
  description_en  text
);

alter table scholarship_checklist_steps enable row level security;

create policy "Public read checklist steps"
  on scholarship_checklist_steps for select
  using (true);
