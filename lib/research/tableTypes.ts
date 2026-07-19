/**
 * TypeScript row types for the three research tables.
 *
 *   student_profile       — protected attributes; 1:1 with auth.users
 *   Event                 — append-only interaction log with recommender signals
 *   ExperimentAssignment  — sticky 50/50 treatment assignment per experiment
 *
 * These types mirror the PostgreSQL column definitions in
 * scripts/20260719_research_tables_v3.sql and are adapted for Supabase
 * (uuid PKs, auth.users(id) FK).
 *
 * PDPA note: no PII fields (no email, name, phone, LINE id) appear here.
 * user_id is the Supabase UUID — a pseudonymous opaque identifier.
 */

// ─── student_profile ─────────────────────────────────────────────────────────

/** Income band labels accepted by student_profile.household_income_band. */
export type HouseholdIncomeBand =
  // v2 format (kept for backward compat)
  | 'band_1' | 'band_2' | 'band_3' | 'band_4' | 'band_5' | 'band_6' | 'band_7'
  // v3 human-readable format
  | '<100k' | '100-200k' | '200-360k' | '360-600k' | '600k+' | 'unknown';

export type Region       = 'Bangkok' | 'Central' | 'North' | 'Northeast' | 'South' | 'East' | 'West' | 'Other';
export type AreaType     = 'urban' | 'peri_urban' | 'rural';
export type ParentEduc   = 'none' | 'primary' | 'secondary' | 'vocational' | 'bachelor' | 'postgrad' | 'unknown';
export type SchoolType   = 'government' | 'private' | 'international' | 'vocational' | 'home_school' | 'other';
export type IntendedLevel = 'high_school' | 'vocational_certificate' | 'associate_degree' | 'bachelor' | 'master' | 'phd' | 'undergraduate' | 'masters' | 'multiple';
export type LanguagePref = 'th' | 'en' | 'th_en' | 'other';

export interface StudentProfileRow {
  /** FK → auth.users(id); also the PK. */
  user_id:               string;

  // Geography
  province:              string | null;
  /** GENERATED ALWAYS AS derive_region(province) STORED — read-only. */
  region:                Region | null;
  area_type:             AreaType | null;

  // Socioeconomic
  household_income_band: HouseholdIncomeBand | null;
  monthly_income_thb:    number | null;
  welfare_card:          boolean | null;
  first_generation:      boolean | null;
  parent_education:      ParentEduc | null;
  household_size:        number | null;

  // Education
  school_type:           SchoolType | null;
  school_province:       string | null;
  gpa:                   number | null;
  class_rank_pct:        number | null;

  // Demographics (sensitive; self-described; nullable)
  gender:                string | null;
  birth_year:            number | null;
  disability_status:     string | null;

  // Academic intent
  intended_level:        IntendedLevel | null;
  intended_field:        string | null;
  language_pref:         LanguagePref | null;

  // Consent (PDPA)
  consent_research:      boolean;
  consent_at:            string | null;
  consent_version:       string | null;
  guardian_consent:      boolean | null;

  created_at:            string;
  updated_at:            string;
}

/** Fields allowed on insert/update (excludes generated columns). */
export type StudentProfileInsert = Omit<StudentProfileRow, 'region' | 'created_at' | 'updated_at'>;
export type StudentProfileUpdate = Partial<Omit<StudentProfileRow, 'user_id' | 'region' | 'created_at' | 'updated_at'>>;

// ─── event ───────────────────────────────────────────────────────────────────

export type EventType =
  | 'search'
  | 'view_list'
  | 'impression'
  | 'view_detail'
  | 'click_apply'
  | 'track_add'
  | 'track_remove'
  | 'status_change'
  | 'self_report_outcome'
  | 'outcome_verified';

export type FairnessMode   = 'on' | 'off';
export type OutcomeValue   = 'applied' | 'awarded' | 'rejected' | 'withdrawn';
export type OutcomeSource  = 'click_inferred' | 'self_report' | 'partner_verified';

export interface EventRow {
  id:                  string;         // uuid; generated
  occurred_at:         string;         // timestamptz; default now()

  user_id:             string | null;  // nullable for anonymous sessions
  session_id:          string | null;
  scholarship_id:      string | null;  // text FK → td_scholarships

  event_type:          EventType;

  // Recommender context
  rank_position:       number | null;
  score:               number | null;
  recommender_variant: string | null;
  fairness_mode:       FairnessMode | null;

  // Search context
  query_text:          string | null;
  filters:             Record<string, unknown> | null;

  // Free-form payload
  context:             Record<string, unknown>;

  // Outcome (for self_report_outcome / outcome_verified events)
  outcome:             OutcomeValue | null;
  outcome_source:      OutcomeSource | null;
  outcome_date:        string | null;   // date
}

/** Fields required/allowed on insert. id and occurred_at are auto-generated. */
export type EventInsert = Omit<EventRow, 'id' | 'occurred_at'> & {
  occurred_at?: string;  // override if caller wants a specific timestamp
};

// ─── experiment_assignment ───────────────────────────────────────────────────

export type ExperimentVariant = 'control' | 'treatment';

export interface ExperimentAssignmentRow {
  id:             string;        // uuid; generated (added in v3 migration)
  user_id:        string;        // uuid FK → auth.users
  experiment_key: string;        // e.g. 'ranking'
  variant:        ExperimentVariant;
  assigned_at:    string;        // timestamptz
}

export type ExperimentAssignmentInsert = Omit<ExperimentAssignmentRow, 'id' | 'assigned_at'> & {
  assigned_at?: string;
};

// ─── tracked_scholarship ─────────────────────────────────────────────────────

/** Matches DB CHECK constraint on tracked_scholarship.status. */
export type TrackerStatus = 'interested' | 'applying' | 'applied' | 'awarded' | 'rejected';

export interface TrackedScholarshipRow {
  id:               string;        // uuid PK
  user_id:          string;        // uuid FK → auth.users
  scholarship_id:   string;        // text FK → td_scholarships
  status:           TrackerStatus;
  notes:            string | null;
  reminder_opt_in:  boolean;       // DEFAULT TRUE; controls LINE reminder delivery
  created_at:       string;        // timestamptz
  updated_at:       string;        // timestamptz; auto-updated by trigger
}

export type TrackedScholarshipInsert = Omit<TrackedScholarshipRow, 'id' | 'created_at' | 'updated_at'>;
export type TrackedScholarshipUpdate = Partial<Omit<TrackedScholarshipRow, 'id' | 'user_id' | 'scholarship_id' | 'created_at' | 'updated_at'>>;

// ─── reminder_log ────────────────────────────────────────────────────────────

export type ReminderChannel = 'line' | 'email' | 'push';

/**
 * Mirrors reminder_log SQL table (scripts/20260719_full_research_migration.sql).
 * The UNIQUE constraint on (user_id, scholarship_id, offset_days, deadline_date)
 * makes the reminder cron idempotent — a duplicate INSERT is a no-op.
 */
export interface ReminderLogRow {
  id:             number;           // bigserial PK
  user_id:        string;           // uuid FK → auth.users
  scholarship_id: string;           // text FK → td_scholarships
  offset_days:    number;           // 14 or 1 — days before deadline_date
  deadline_date:  string;           // date; drives the UNIQUE dedup key
  channel:        ReminderChannel;  // DEFAULT 'line'
  sent_at:        string;           // timestamptz; DEFAULT now()
}

export type ReminderLogInsert = Omit<ReminderLogRow, 'id'>;
