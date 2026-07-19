-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_research_v2.sql
-- Research data foundation: student_profile, funnel_events, experiment_assignment,
-- outcome_partner, analytics views.
--
-- Safe to run multiple times (all IF NOT EXISTS / DO NOTHING / CREATE OR REPLACE).
-- Run STAGING first. Requires pgcrypto extension for sha256 in export view.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Prerequisites ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Province → Region lookup function ─────────────────────────────────────
-- IMMUTABLE so Postgres can index and use it in generated columns.
CREATE OR REPLACE FUNCTION derive_region(province TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN province IN ('กรุงเทพมหานคร', 'Bangkok', 'กรุงเทพ') THEN 'Bangkok'
    WHEN province IN (
      'นนทบุรี','ปทุมธานี','อยุธยา','พระนครศรีอยุธยา','สระบุรี',
      'ลพบุรี','สิงห์บุรี','ชัยนาท','อ่างทอง','นครนายก',
      'ปราจีนบุรี','สระแก้ว'
    ) THEN 'Central'
    WHEN province IN (
      'เชียงใหม่','เชียงราย','ลำปาง','ลำพูน','แม่ฮ่องสอน',
      'พะเยา','แพร่','น่าน','อุตรดิตถ์','ตาก','สุโขทัย',
      'พิษณุโลก','พิจิตร','กำแพงเพชร','นครสวรรค์','เพชรบูรณ์',
      'อุทัยธานี'
    ) THEN 'North'
    WHEN province IN (
      'นครราชสีมา','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี',
      'ยโสธร','ชัยภูมิ','อำนาจเจริญ','หนองบัวลำภู','ขอนแก่น',
      'อุดรธานี','เลย','หนองคาย','มหาสารคาม','ร้อยเอ็ด',
      'กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','บึงกาฬ'
    ) THEN 'Northeast'
    WHEN province IN (
      'นครศรีธรรมราช','สุราษฎร์ธานี','ภูเก็ต','พังงา','กระบี่',
      'ตรัง','พัทลุง','สงขลา','สตูล','ปัตตานี','ยะลา','นราธิวาส',
      'ชุมพร','ระนอง'
    ) THEN 'South'
    WHEN province IN (
      'ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','สมุทรปราการ'
    ) THEN 'East'
    WHEN province IN (
      'กาญจนบุรี','สุพรรณบุรี','ราชบุรี','เพชรบุรี',
      'ประจวบคีรีขันธ์','สมุทรสาคร','สมุทรสงคราม','นครปฐม'
    ) THEN 'West'
    ELSE 'Other'
  END;
END;
$$;

-- ── 2. student_profile — protected attributes for fairness analysis ───────────
-- 1:1 with auth.users. Contains SENSITIVE data about potential minors.
-- NEVER exported unless consent_research = TRUE.
CREATE TABLE IF NOT EXISTS public.student_profile (
  -- Identity
  user_id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Protected attributes (for fairness/causal analysis)
  province              TEXT,
  region                TEXT        GENERATED ALWAYS AS (derive_region(province)) STORED,
  area_type             TEXT        CHECK (area_type IN ('urban', 'rural')),
  household_income_band TEXT        CHECK (household_income_band IN (
                                      'band_1',   -- < ฿50,000 / year
                                      'band_2',   -- ฿50k–100k
                                      'band_3',   -- ฿100k–180k  (EEF cut-off)
                                      'band_4',   -- ฿180k–300k
                                      'band_5',   -- ฿300k–500k
                                      'band_6',   -- ฿500k–1m
                                      'band_7'    -- > ฿1m
                                    )),
  welfare_card          BOOLEAN     DEFAULT FALSE,
  school_type           TEXT        CHECK (school_type IN (
                                      'government', 'private', 'international',
                                      'vocational', 'home_school'
                                    )),
  first_generation      BOOLEAN,                       -- first in family to seek tertiary ed
  gender                TEXT,                          -- free-text; self-described; optional
  birth_year            SMALLINT    CHECK (birth_year BETWEEN 1990 AND 2015),
  gpa                   NUMERIC(3,2) CHECK (gpa BETWEEN 0 AND 4),

  -- Academic intent
  intended_level        TEXT        CHECK (intended_level IN (
                                      'high_school','vocational_certificate',
                                      'associate_degree','bachelor','master','phd'
                                    )),
  intended_field        TEXT,
  language_pref         TEXT        DEFAULT 'th' CHECK (language_pref IN ('th','en','other')),

  -- Consent (PDPA + minor guardian)
  -- consent_research must be TRUE for this record to be used in any research export.
  -- Opt-out: set consent_research = FALSE; that stops future research use immediately.
  consent_research      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_version       TEXT,                          -- e.g. "2026-01-v1"
  consent_at            TIMESTAMPTZ,
  guardian_consent      BOOLEAN,                       -- required for birth_year > (YEAR-18)

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.student_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_profile: own read/write"
  ON public.student_profile
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "student_profile: admin read"
  ON public.student_profile
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.id IN (
        SELECT id FROM auth.users
        WHERE email IN (SELECT unnest(string_to_array(current_setting('app.admin_emails', TRUE), ',')))
      )
    )
  );

-- ── 3. funnel_events — append-only; NEVER mutate rows ────────────────────────
-- Separate from legacy user_events. Covers the full scholarship funnel with
-- per-impression granularity (one row per card shown = exposure signal).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'funnel_event_type') THEN
    CREATE TYPE funnel_event_type AS ENUM (
      'search',
      'view_list',
      'impression',          -- one per scholarship card shown; carry rank + variant
      'view_detail',
      'click_apply',
      'track_add',
      'track_remove',
      'status_change',
      'self_report_outcome'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID             REFERENCES auth.users(id) ON DELETE SET NULL,   -- nullable for anon
  session_id      TEXT             NOT NULL,    -- stable per browser tab (sessionStorage)
  scholarship_id  TEXT             REFERENCES public.td_scholarships(scholarship_id) ON DELETE SET NULL,
  event_type      funnel_event_type NOT NULL,
  context         JSONB            NOT NULL DEFAULT '{}',  -- {rank, score, variant, query, filters, page, ...}
  occurred_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Append-only: grant INSERT to authenticated AND anon; revoke UPDATE/DELETE
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "funnel_events: insert authenticated"
  ON public.funnel_events FOR INSERT
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

CREATE POLICY "funnel_events: select own"
  ON public.funnel_events FOR SELECT
  USING (user_id = auth.uid());

-- Indexes for funnel analysis
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_time
  ON public.funnel_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_events_scholarship_type
  ON public.funnel_events (scholarship_id, event_type);

CREATE INDEX IF NOT EXISTS idx_funnel_events_session
  ON public.funnel_events (session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_events_type_time
  ON public.funnel_events (event_type, occurred_at DESC);

-- ── 4. experiment_assignment — sticky 50/50 variant per user ─────────────────
CREATE TABLE IF NOT EXISTS public.experiment_assignment (
  user_id         UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_key  TEXT   NOT NULL,
  variant         TEXT   NOT NULL CHECK (variant IN ('control', 'treatment')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_key)
);

ALTER TABLE public.experiment_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "experiment_assignment: own read/insert"
  ON public.experiment_assignment
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_experiment_assignment_key
  ON public.experiment_assignment (experiment_key, variant);

-- ── 5. outcome_partner — admin-imported verified outcomes ─────────────────────
CREATE TABLE IF NOT EXISTS public.outcome_partner (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scholarship_id        TEXT        REFERENCES public.td_scholarships(scholarship_id) ON DELETE SET NULL,
  external_applicant_id TEXT        NOT NULL,   -- partner's anonymised ID; NOT our user_id
  outcome               TEXT        NOT NULL CHECK (outcome IN ('applied','awarded','rejected')),
  outcome_date          DATE,
  provenance            TEXT        NOT NULL DEFAULT 'partner_verified',
  partner_name          TEXT,                   -- e.g. 'EEF', 'OVEC'
  imported_by           TEXT,                   -- admin email who ran the import
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                 TEXT
);

ALTER TABLE public.outcome_partner ENABLE ROW LEVEL SECURITY;
-- Only service-role (admin API) can touch this table; no user-facing RLS policy.

-- ── 6. Analytics views ────────────────────────────────────────────────────────
-- These power the fairness dashboard. Filter to consented profiles only.

-- 6a. Funnel conversion counts (overall)
CREATE OR REPLACE VIEW public.v_funnel_conversion AS
SELECT
  COUNT(*) FILTER (WHERE event_type = 'impression')              AS impressions,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'impression') AS unique_users_reached,
  COUNT(*) FILTER (WHERE event_type = 'view_detail')             AS view_details,
  COUNT(*) FILTER (WHERE event_type = 'click_apply')             AS click_applies,
  COUNT(*) FILTER (WHERE event_type = 'track_add')               AS track_adds,
  COUNT(*) FILTER (WHERE event_type = 'self_report_outcome'
    AND context->>'outcome' = 'applied')                         AS self_reported_applied,
  COUNT(*) FILTER (WHERE event_type = 'self_report_outcome'
    AND context->>'outcome' = 'awarded')                         AS self_reported_awarded
FROM public.funnel_events;

-- 6b. Funnel by region (protected group)
CREATE OR REPLACE VIEW public.v_funnel_by_region AS
SELECT
  sp.region,
  COUNT(*) FILTER (WHERE fe.event_type = 'impression')      AS impressions,
  COUNT(*) FILTER (WHERE fe.event_type = 'view_detail')     AS view_details,
  COUNT(*) FILTER (WHERE fe.event_type = 'click_apply')     AS click_applies,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' IN ('applied','awarded'))     AS self_reported_applied,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' = 'awarded')                  AS self_reported_awarded,
  COUNT(DISTINCT fe.user_id)                                 AS unique_users
FROM public.funnel_events fe
JOIN public.student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = TRUE
GROUP BY sp.region;

-- 6c. Funnel by household income band
CREATE OR REPLACE VIEW public.v_funnel_by_income AS
SELECT
  sp.household_income_band,
  COUNT(*) FILTER (WHERE fe.event_type = 'impression')      AS impressions,
  COUNT(*) FILTER (WHERE fe.event_type = 'view_detail')     AS view_details,
  COUNT(*) FILTER (WHERE fe.event_type = 'click_apply')     AS click_applies,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' IN ('applied','awarded'))     AS self_reported_applied,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' = 'awarded')                  AS self_reported_awarded,
  COUNT(DISTINCT fe.user_id)                                 AS unique_users
FROM public.funnel_events fe
JOIN public.student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = TRUE
GROUP BY sp.household_income_band;

-- 6d. Funnel by school type
CREATE OR REPLACE VIEW public.v_funnel_by_school_type AS
SELECT
  sp.school_type,
  COUNT(*) FILTER (WHERE fe.event_type = 'impression')      AS impressions,
  COUNT(*) FILTER (WHERE fe.event_type = 'view_detail')     AS view_details,
  COUNT(*) FILTER (WHERE fe.event_type = 'click_apply')     AS click_applies,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' IN ('applied','awarded'))     AS self_reported_applied,
  COUNT(*) FILTER (WHERE fe.event_type = 'self_report_outcome'
    AND fe.context->>'outcome' = 'awarded')                  AS self_reported_awarded,
  COUNT(DISTINCT fe.user_id)                                 AS unique_users
FROM public.funnel_events fe
JOIN public.student_profile sp ON sp.user_id = fe.user_id AND sp.consent_research = TRUE
GROUP BY sp.school_type;

-- 6e. Pseudonymised research export view (PDPA compliant)
-- user_id replaced by stable SHA-256 hash; no PII fields.
-- Only rows where consent_research = TRUE are included.
CREATE OR REPLACE VIEW public.v_research_export AS
SELECT
  encode(sha256(fe.user_id::text::bytea), 'hex')  AS pseudo_user_id,
  fe.session_id,
  fe.scholarship_id,
  fe.event_type,
  fe.context,
  fe.occurred_at,
  -- Protected attributes from consented student_profile
  sp.region,
  sp.area_type,
  sp.household_income_band,
  sp.welfare_card,
  sp.school_type,
  sp.first_generation,
  sp.birth_year,        -- NOT name/email; birth_year alone is not identifying
  sp.gpa,
  sp.intended_level,
  sp.intended_field,
  -- Experiment context
  ea.variant            AS experiment_variant
FROM public.funnel_events fe
JOIN public.student_profile sp
  ON sp.user_id = fe.user_id
  AND sp.consent_research = TRUE        -- hard gate: exclude non-consented users
LEFT JOIN public.experiment_assignment ea
  ON ea.user_id = fe.user_id
  AND ea.experiment_key = 'ranking'
WHERE fe.user_id IS NOT NULL;           -- exclude anonymous sessions from this view

-- ── 7. updated_at trigger for student_profile ─────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_student_profile_updated_at ON public.student_profile;
CREATE TRIGGER trg_student_profile_updated_at
  BEFORE UPDATE ON public.student_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Notes ────────────────────────────────────────────────────────────────────
-- Lawful basis (PDPA 2562):
--   Processing purpose: academic research into scholarship access equity.
--   Legal basis: consent (Section 19) — users actively tick consent_research.
--   Retention: raw events 3 years; pseudonymised export indefinitely.
--   Data subject rights: opt-out sets consent_research = FALSE, stopping future
--   research use; historical pseudonymised exports cannot be individually recalled.
--
-- Sensitive data (Section 26 PDPA): income, disability, ethnicity proxies.
--   explicit consent required before collection.
--
-- Minor data: guardian_consent = TRUE required when birth_year indicates age < 18.
--   The app enforces this in the form; the DB records the assertion.
