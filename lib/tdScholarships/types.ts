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

export interface TdScholarship {
  scholarship_id: string;
  scholarship_name: string;
  funder: string;
  funder_type: TdFunderType | null;
  level: TdLevel | null;
  field_of_study: string | null;
  award_amount_thb: string | null;
  region_eligibility: string | null;
  targets_low_income: boolean;
  num_recipients: number | null;
  min_gpa: number | null;
  income_cap_thb: number | null;
  language: string | null;
  deadline_raw: string | null;
  status: TdStatus | null;
  application_link: string;
  source: string | null;
  verification_status: string | null;
  last_verified: string | null;
  verified_by: string | null;
  notes: string | null;
  // Derived
  deadline_date: string | null;
  deadline_is_rolling: boolean;
  deadline_note: string | null;
  is_displayed: boolean;
  display_reason: string | null;
  stale: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// What the client-side import engine produces per row
export interface TdImportRow {
  rowNum: number;
  scholarship_id: string;
  scholarship_name: string;
  funder: string;
  funder_type: TdFunderType | null;
  level: TdLevel | null;
  field_of_study: string | null;
  award_amount_thb: string | null;
  region_eligibility: string | null;
  targets_low_income: boolean;
  num_recipients: number | null;
  min_gpa: number | null;
  income_cap_thb: number | null;
  language: string | null;
  deadline_raw: string | null;
  status: TdStatus | null;
  application_link: string | null;
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
