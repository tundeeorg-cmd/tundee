-- =============================================================================
-- Migration: 20260719_full_research_migration.sql
-- One comprehensive, idempotent migration covering all research, tracker,
-- and bilingual schema for TunDee.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- / CREATE OR REPLACE so a second execution is a no-op.
--
-- Supabase adaptations (vs. generic PostgreSQL DDL):
--   · PK type       BIGSERIAL  → UUID (DEFAULT gen_random_uuid())
--   · FK user ref   BIGINT → users(id)  → UUID → auth.users(id)
--   · FK sch ref    TEXT → scholarships(scholarship_id)  → TEXT → td_scholarships(scholarship_id)
--   · LINE columns  on profiles (not a separate users table)
--
-- What this migration actually creates / adds:
--   [A] td_scholarships: 13 new columns (research covariates + bilingual fields)
--   [B] profiles:        LINE linking columns (no-op if already added by tracker scripts)
--   [C] student_profile: CREATE IF NOT EXISTS (fully defined; no-op on live DB)
--   [D] event:           CREATE IF NOT EXISTS (append-only, with trigger)
--   [E] experiment_assignment: CREATE IF NOT EXISTS
--   [F] tracked_scholarship:   CREATE IF NOT EXISTS
--   [G] reminder_log:          CREATE IF NOT EXISTS
--   [H] Indexes, RLS, updated_at triggers (all idempotent)
--
-- Run on STAGING before production. Prerequisites: add_td_scholarships.sql
-- and add_research_v2.sql must have been run first.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- [PRE] Prerequisites: pgcrypto extension + province→region lookup
-- ═════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- IMMUTABLE so it can be used in GENERATED ALWAYS AS column on student_profile.
CREATE OR REPLACE FUNCTION public.derive_region(province TEXT)
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
      'พิษณุโลก','พิจิตร','กำแพงเพชร','นครสวรรค์','เพชรบูรณ์','อุทัยธานี'
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

-- ═════════════════════════════════════════════════════════════════════════════
-- [A] STEP 1 — td_scholarships: 13 new columns
-- ═════════════════════════════════════════════════════════════════════════════
-- NOTE: deadline_date, deadline_is_rolling, deadline_note, is_displayed,
--       display_reason, stale already exist — NOT touched here.

-- Research covariates (item-level moderators/confounders for fairness study)
ALTER TABLE public.td_scholarships
  ADD COLUMN IF NOT EXISTS award_amount_thb_numeric  INTEGER,
  ADD COLUMN IF NOT EXISTS award_type                TEXT
    CHECK (award_type IN ('once','annual','monthly','full')),
  ADD COLUMN IF NOT EXISTS renewable                 BOOLEAN,
  ADD COLUMN IF NOT EXISTS bond_obligation           BOOLEAN,
  ADD COLUMN IF NOT EXISTS application_open_date     DATE,
  ADD COLUMN IF NOT EXISTS welfare_card_priority     BOOLEAN,
  ADD COLUMN IF NOT EXISTS english_requirement       TEXT;

-- Bilingual identity fields
ALTER TABLE public.td_scholarships
  ADD COLUMN IF NOT EXISTS scholarship_name_en  TEXT,
  ADD COLUMN IF NOT EXISTS scholarship_name_th  TEXT,
  ADD COLUMN IF NOT EXISTS funder_en            TEXT,
  ADD COLUMN IF NOT EXISTS funder_th            TEXT,
  ADD COLUMN IF NOT EXISTS source_language      TEXT
    CHECK (source_language IN ('th','en')),
  ADD COLUMN IF NOT EXISTS translation_review   TEXT
    CHECK (translation_review IN ('verified','draft','missing'))
    DEFAULT 'missing';

-- Back-fill bilingual fields from the legacy scholarship_name / funder columns.
-- This runs only for rows where the new columns are still NULL (idempotent).
-- Map the spreadsheet "scholarship_name" header → scholarship_name_th (source is Thai).
UPDATE public.td_scholarships
SET
  scholarship_name_th = COALESCE(scholarship_name_th, scholarship_name),
  scholarship_name_en = COALESCE(scholarship_name_en, scholarship_name),
  funder_th           = COALESCE(funder_th, funder),
  funder_en           = COALESCE(funder_en, funder),
  source_language     = COALESCE(source_language, 'th'),
  translation_review  = COALESCE(translation_review, 'missing')
WHERE
  scholarship_name_th IS NULL
  OR scholarship_name_en IS NULL
  OR funder_th IS NULL
  OR funder_en IS NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- [B] STEP 2 — profiles: LINE linking columns
--     (Added by add_tracker_v2.sql; these are no-ops if already present)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS line_user_id              TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS line_linked_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS line_link_code            TEXT,
  ADD COLUMN IF NOT EXISTS line_link_code_expires_at TIMESTAMPTZ;

-- ═════════════════════════════════════════════════════════════════════════════
-- [C] STEP 3 — student_profile (1:1 with auth.users)
--     PK is user_id UUID (Supabase convention; no separate BIGSERIAL id).
--     No-op if already exists from add_research_v2.sql.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.student_profile (
  user_id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  province              TEXT,
  region                TEXT        GENERATED ALWAYS AS (public.derive_region(province)) STORED,
  area_type             TEXT        CHECK (area_type IN ('urban','peri_urban','rural')),
  household_income_band TEXT        CHECK (household_income_band IN (
                                      'band_1','band_2','band_3','band_4','band_5','band_6','band_7',
                                      '<100k','100-200k','200-360k','360-600k','600k+','unknown'
                                    )),
  monthly_income_thb    INTEGER,
  welfare_card          BOOLEAN     DEFAULT FALSE,
  first_generation      BOOLEAN,
  parent_education      TEXT        CHECK (parent_education IN (
                                      'none','primary','secondary','vocational',
                                      'bachelor','postgrad','unknown'
                                    )),
  household_size        INTEGER,
  school_type           TEXT        CHECK (school_type IN (
                                      'government','private','international','vocational',
                                      'home_school','other'
                                    )),
  school_province       TEXT,
  gpa                   NUMERIC(3,2) CHECK (gpa BETWEEN 0 AND 4),
  class_rank_pct        NUMERIC(5,2),
  gender                TEXT,
  birth_year            INTEGER     CHECK (birth_year BETWEEN 1990 AND 2015),
  disability_status     TEXT,
  intended_level        TEXT        CHECK (intended_level IN (
                                      'high_school','vocational_certificate','associate_degree',
                                      'bachelor','undergraduate','master','masters','phd','multiple'
                                    )),
  intended_field        TEXT,
  language_pref         TEXT        DEFAULT 'th'
                                    CHECK (language_pref IN ('th','en','th_en','other')),
  consent_research      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_at            TIMESTAMPTZ,
  consent_version       TEXT,
  guardian_consent      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add any columns that may be missing from an older student_profile definition
ALTER TABLE public.student_profile
  ADD COLUMN IF NOT EXISTS monthly_income_thb  INTEGER,
  ADD COLUMN IF NOT EXISTS parent_education    TEXT,
  ADD COLUMN IF NOT EXISTS household_size      INTEGER,
  ADD COLUMN IF NOT EXISTS school_province     TEXT,
  ADD COLUMN IF NOT EXISTS class_rank_pct      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS disability_status   TEXT;

-- Widen area_type check to include peri_urban (safe: no existing rows use it)
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_area_type_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_area_type_check
       CHECK (area_type IN ('urban','peri_urban','rural'));

-- Widen household_income_band to accept both label formats
ALTER TABLE public.student_profile
  DROP CONSTRAINT IF EXISTS student_profile_household_income_band_check;
ALTER TABLE public.student_profile
  ADD  CONSTRAINT student_profile_household_income_band_check
       CHECK (household_income_band IN (
         'band_1','band_2','band_3','band_4','band_5','band_6','band_7',
         '<100k','100-200k','200-360k','360-600k','600k+','unknown'
       ));

-- Indexes
ALTER TABLE public.student_profile ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_student_profile_region
  ON public.student_profile (region);
CREATE INDEX IF NOT EXISTS idx_student_profile_income
  ON public.student_profile (household_income_band);
CREATE INDEX IF NOT EXISTS idx_student_profile_province
  ON public.student_profile (province);

-- RLS: users read/write own row; admin reads all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='student_profile' AND policyname='student_profile: own read/write'
  ) THEN
    CREATE POLICY "student_profile: own read/write"
      ON public.student_profile FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_student_profile_updated_at ON public.student_profile;
CREATE TRIGGER trg_student_profile_updated_at
  BEFORE UPDATE ON public.student_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- [D] STEP 4 — event (append-only enriched interaction log)
--     PK is UUID (Supabase convention; not BIGSERIAL).
--     No-op if already exists from 20260719_research_tables_v3.sql.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.event (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id          TEXT,
  scholarship_id      TEXT        REFERENCES public.td_scholarships(scholarship_id) ON DELETE SET NULL,
  event_type          TEXT        NOT NULL CHECK (event_type IN (
                                    'search','view_list','impression','view_detail','click_apply',
                                    'track_add','track_remove','status_change',
                                    'self_report_outcome','outcome_verified'
                                  )),
  rank_position       INTEGER,
  score               NUMERIC(6,4),
  recommender_variant TEXT,
  fairness_mode       TEXT        CHECK (fairness_mode IN ('on','off')),
  query_text          TEXT,
  filters             JSONB,
  context             JSONB       NOT NULL DEFAULT '{}',
  outcome             TEXT        CHECK (outcome IN ('applied','awarded','rejected','withdrawn')),
  outcome_source      TEXT        CHECK (outcome_source IN (
                                    'click_inferred','self_report','partner_verified'
                                  )),
  outcome_date        DATE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_user_time
  ON public.event (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_sch_type
  ON public.event (scholarship_id, event_type);
CREATE INDEX IF NOT EXISTS idx_event_type_time
  ON public.event (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_session
  ON public.event (session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_fairness
  ON public.event (fairness_mode, occurred_at DESC)
  WHERE fairness_mode IS NOT NULL;

-- RLS: append-only via policies
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='event' AND policyname='event: insert own or anon'
  ) THEN
    CREATE POLICY "event: insert own or anon"
      ON public.event FOR INSERT
      WITH CHECK (user_id IS NULL OR user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='event' AND policyname='event: select own'
  ) THEN
    CREATE POLICY "event: select own"
      ON public.event FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- DB-level append-only guard: raises EXCEPTION on UPDATE or DELETE.
-- To correct an outcome, INSERT a new outcome_verified row instead.
CREATE OR REPLACE FUNCTION public.event_append_only_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'event table is append-only: UPDATE and DELETE are not permitted. '
    'Insert a new row with event_type=''outcome_verified'' to correct an outcome.';
END;
$$;

DROP TRIGGER IF EXISTS trg_event_append_only ON public.event;
CREATE TRIGGER trg_event_append_only
  BEFORE UPDATE OR DELETE ON public.event
  FOR EACH ROW EXECUTE FUNCTION public.event_append_only_guard();

-- ═════════════════════════════════════════════════════════════════════════════
-- [E] STEP 5 — experiment_assignment (sticky 50/50 treatment)
--     Composite PK (user_id, experiment_key) + surrogate UUID id column.
--     No-op if already exists.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.experiment_assignment (
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_key  TEXT    NOT NULL,
  variant         TEXT    NOT NULL CHECK (variant IN ('control','treatment')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_key)
);

-- Surrogate id column (added in v3; no-op if already present)
ALTER TABLE public.experiment_assignment
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_assignment_id
  ON public.experiment_assignment (id);
CREATE INDEX IF NOT EXISTS idx_experiment_assignment_key
  ON public.experiment_assignment (experiment_key, variant);

ALTER TABLE public.experiment_assignment ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='experiment_assignment' AND policyname='experiment_assignment: own read/insert'
  ) THEN
    CREATE POLICY "experiment_assignment: own read/insert"
      ON public.experiment_assignment FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- [F] STEP 6 — tracked_scholarship (per-user application tracker)
--     Uses UUID PK (Supabase convention; existing DB uses uuid from tracker scripts).
--     No-op if already exists.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tracked_scholarship (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id TEXT        NOT NULL REFERENCES public.td_scholarships(scholarship_id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'interested'
                             CHECK (status IN ('interested','applying','applied','awarded','rejected')),
  notes          TEXT,
  reminder_opt_in BOOLEAN    NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scholarship_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_user
  ON public.tracked_scholarship (user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_scholarship
  ON public.tracked_scholarship (scholarship_id);

ALTER TABLE public.tracked_scholarship ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='tracked_scholarship' AND policyname='tracked_scholarship: own crud'
  ) THEN
    CREATE POLICY "tracked_scholarship: own crud"
      ON public.tracked_scholarship FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_tracked_scholarship_updated_at ON public.tracked_scholarship;
CREATE TRIGGER trg_tracked_scholarship_updated_at
  BEFORE UPDATE ON public.tracked_scholarship
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- [G] STEP 7 — reminder_log (idempotent LINE reminder ledger)
--     UNIQUE on (user_id, scholarship_id, offset_days, deadline_date) so
--     the cron job is safe to re-run without re-sending.
--     Existing DB uses bigserial PK (from add_tracker_v2.sql); IF NOT EXISTS
--     is a no-op so the existing schema is preserved exactly.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id TEXT        NOT NULL REFERENCES public.td_scholarships(scholarship_id) ON DELETE CASCADE,
  offset_days    INTEGER     NOT NULL,
  deadline_date  DATE        NOT NULL,
  channel        TEXT        NOT NULL DEFAULT 'line',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scholarship_id, offset_days, deadline_date)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_user
  ON public.reminder_log (user_id, deadline_date DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- [H] Pseudonymised research export view (consent-gated)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_event_research_export AS
SELECT
  encode(sha256(e.user_id::text::bytea), 'hex') AS pseudo_user_id,
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
FROM public.event e
JOIN public.student_profile sp
  ON sp.user_id = e.user_id
  AND sp.consent_research = TRUE
LEFT JOIN public.experiment_assignment ea
  ON ea.user_id = e.user_id AND ea.experiment_key = 'ranking'
WHERE e.user_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- Summary of changes
-- =============================================================================
-- Tables created (IF NOT EXISTS — no-op on live DB if previously migrated):
--   public.student_profile
--   public.event
--   public.experiment_assignment
--   public.tracked_scholarship
--   public.reminder_log
--
-- Columns added to public.td_scholarships:
--   award_amount_thb_numeric INTEGER
--   award_type               TEXT ('once'|'annual'|'monthly'|'full')
--   renewable                BOOLEAN
--   bond_obligation          BOOLEAN
--   application_open_date    DATE
--   welfare_card_priority    BOOLEAN
--   english_requirement      TEXT
--   scholarship_name_en      TEXT
--   scholarship_name_th      TEXT
--   funder_en                TEXT
--   funder_th                TEXT
--   source_language          TEXT ('th'|'en')
--   translation_review       TEXT ('verified'|'draft'|'missing'; DEFAULT 'missing')
--
-- Columns added to public.profiles (no-op if tracker scripts ran first):
--   line_user_id              TEXT UNIQUE
--   line_linked_at            TIMESTAMPTZ
--   line_link_code            TEXT
--   line_link_code_expires_at TIMESTAMPTZ
--
-- Columns added to public.student_profile (if missing from older definition):
--   monthly_income_thb  INTEGER
--   parent_education    TEXT
--   household_size      INTEGER
--   school_province     TEXT
--   class_rank_pct      NUMERIC(5,2)
--   disability_status   TEXT
--
-- Columns added to public.experiment_assignment (if missing):
--   id  UUID
--
-- Triggers:
--   trg_student_profile_updated_at   (BEFORE UPDATE → set_updated_at())
--   trg_tracked_scholarship_updated_at (BEFORE UPDATE → set_updated_at())
--   trg_event_append_only            (BEFORE UPDATE OR DELETE → raises EXCEPTION)
--
-- Views created/replaced:
--   public.v_event_research_export   (pseudonymised, consent-gated)
-- =============================================================================
