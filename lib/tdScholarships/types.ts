export type TdFunderType =
  | 'Thai University'
  | 'Thai Government / Royal'
  | 'Corporate / Bank / Foundation'
  | 'International (open to Thais)';

export type TdLevel =
  | 'High school'
  | 'Undergraduate'
  | "Master's"
  | 'PhD'
  | 'Multiple';

export type TdStatus = 'Open' | 'Recheck' | 'Closed';

export type TdAwardType         = 'once' | 'annual' | 'monthly' | 'full';
export type TdSourceLanguage    = 'th' | 'en';
export type TdTranslationReview = 'verified' | 'draft' | 'missing';

/**
 * Normalized award value tier codes stored in DB.
 * Raw spreadsheet strings (with ≥, en-dashes, parentheses) are mapped on import.
 */
export type TdAwardValueTier =
  | 'full_ride'    // "Full-ride (tuition+living)"
  | 'full_tuition' // "Full-tuition"
  | 'large'        // "Large (≥100k THB)"
  | 'medium'       // "Medium (20k–100k)"
  | 'small'        // "Small (<20k)"
  | 'stipend_only'; // "Stipend-only"

export interface TdScholarship {
  scholarship_id: string;

  // ── Bilingual identity fields (canonical; back-filled from legacy on import) ──
  scholarship_name_en: string | null;
  scholarship_name_th: string | null;
  funder_en: string | null;
  funder_th: string | null;
  source_language: TdSourceLanguage | null;
  translation_review: TdTranslationReview | null;

  // ── Deprecated legacy single-language columns (kept nullable for read compat) ──
  /** @deprecated Populated from scholarship_name_en/th. Use bilingual columns. */
  scholarship_name: string;
  /** @deprecated Populated from funder_en/funder_th. Use bilingual columns. */
  funder: string;

  funder_type: TdFunderType | null;
  level: TdLevel | null;
  field_of_study: string | null;

  // ── Award ──────────────────────────────────────────────────────────────────
  /** Normalized tier code (column 9 of 28-field schema). */
  award_value_tier: TdAwardValueTier | null;
  /** Parsed numeric award amount in THB. */
  award_amount_thb_numeric: number | null;
  award_type: TdAwardType | null;
  /** @deprecated Free-text award amount string. Use award_amount_thb_numeric. */
  award_amount_thb: string | null;

  // ── Eligibility ────────────────────────────────────────────────────────────
  renewable: boolean | null;
  bond_obligation: boolean | null;
  region_eligibility: string | null;
  targets_low_income: boolean;
  welfare_card_priority: boolean | null;
  income_cap_thb: number | null;
  num_recipients: number | null;
  min_gpa: number | null;
  english_requirement: string | null;
  /** @deprecated Use english_requirement. Medium of instruction. */
  language: string | null;

  // ── Deadline ───────────────────────────────────────────────────────────────
  deadline_raw: string | null;
  deadline_date: string | null;
  deadline_is_rolling: boolean;
  deadline_note: string | null;

  // ── Status & verification ──────────────────────────────────────────────────
  status: TdStatus | null;
  verification_status: string | null;
  last_verified: string | null;
  verified_by: string | null;

  // ── URLs ───────────────────────────────────────────────────────────────────
  /** Canonical application URL (column 24 of 28-field schema). */
  application_url: string | null;
  /** Canonical source/reference URL (column 25 of 28-field schema). */
  source_url: string | null;
  /** @deprecated Use application_url. Legacy column kept for read compat. */
  application_link: string;
  /** @deprecated Use source_url. Legacy column kept for read compat. */
  source: string | null;

  // ── Misc ───────────────────────────────────────────────────────────────────
  notes: string | null;
  /** @deprecated No longer in the canonical 28-field schema. */
  application_open_date: string | null;

  // ── Display gate (set by app, not import sheet) ────────────────────────────
  is_displayed: boolean;
  display_reason: string | null;
  stale: boolean;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  created_at: string;
  updated_at: string;
}

// ── Import row (output of parseTdImportFile) ─────────────────────────────────

export interface TdImportRow {
  rowNum: number;
  scholarship_id: string;

  // Bilingual (canonical)
  scholarship_name_en: string | null;
  scholarship_name_th: string | null;
  funder_en: string | null;
  funder_th: string | null;
  source_language: TdSourceLanguage | null;

  // Derived for backward compat (populated from bilingual fields)
  scholarship_name: string;
  funder: string;

  funder_type: TdFunderType | null;
  level: TdLevel | null;
  field_of_study: string | null;

  award_value_tier: TdAwardValueTier | null;
  award_amount_thb_numeric: number | null;
  award_type: TdAwardType | null;
  /** @deprecated */
  award_amount_thb: string | null;

  renewable: boolean | null;
  bond_obligation: boolean | null;
  region_eligibility: string | null;
  targets_low_income: boolean;
  welfare_card_priority: boolean | null;
  income_cap_thb: number | null;
  num_recipients: number | null;
  min_gpa: number | null;
  english_requirement: string | null;

  deadline_raw: string | null;
  // Parsed deadline fields (populated by engine)
  deadline_date: string | null;
  deadline_is_rolling: boolean;
  deadline_note: string | null;

  status: TdStatus | null;

  application_url: string | null;
  source_url: string | null;
  /** @deprecated */
  application_link: string | null;
  /** @deprecated */
  source: string | null;

  verification_status: string | null;
  last_verified: string | null;
  notes: string | null;

  // Engine metadata
  action: 'insert' | 'update' | 'skip';
  skipReason: string;
  isDuplicate: boolean;
}

export interface TdImportReport {
  rows: TdImportRow[];
  totalRows: number;
  willInsert: number;
  willUpdate: number;
  willSkip: number;
  duplicateIds: string[];
}
