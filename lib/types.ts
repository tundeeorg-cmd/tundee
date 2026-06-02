export type FunderType = 'government' | 'corporate' | 'foundation' | 'royal' | 'university';
export type AmountType = 'monthly' | 'one-time' | 'annual';
export type Language = 'th' | 'en';

export interface Scholarship {
  id: string;
  name_th: string;
  name_en: string | null;
  funder_name_th: string | null;
  funder_name_en: string | null;
  funder_type: FunderType | null;
  amount_thb: number | null;
  amount_type: AmountType | null;
  min_gpa: number | null;
  max_income_thb: number | null;
  field_of_study: string[] | null;
  province_restriction: string[] | null;
  welfare_card_priority: boolean;
  deadline_date: string | null;
  application_url: string | null;
  documents_required: string[] | null;
  description_th: string | null;
  description_en: string | null;
  is_active: boolean;
  created_at: string;
  last_verified_at: string | null;
  // New columns added with real scholarship data
  tier?: 'SAFETY' | 'TARGET' | 'REACH';
  renewable?: boolean;
  bond_obligation?: boolean;
  english_level?: string;
  english_score_required?: string | null;
  special_skills?: string[];
  talents?: string[];
  awards_required?: string[];
  grade_levels?: string[];
  historical_bias_score?: number;
}

export interface ChecklistStep {
  id: number;
  step_number: number;
  name_th: string;
  name_en: string;
  description_th: string | null;
  description_en: string | null;
}

export interface FilterState {
  funderType: FunderType | '';
  minGpa: number | null;
  fieldOfStudy: string;
  province: string;
  welfareCard: boolean;
}
