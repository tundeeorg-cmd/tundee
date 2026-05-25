// lib/matching/types.ts
// Student profile and matching result types for the TunDee fairness engine.

export interface StudentProfile {
  province_id: string            // Thai province name e.g. 'ขอนแก่น'
  income_bracket: number         // 1-7 (1=lowest <5k THB/mo, 7=highest >50k)
  gpa: number                    // 0.00-4.00
  fields_of_interest: string[]   // ['any'] or ['วิศวกรรมศาสตร์','แพทยศาสตร์',...]
  welfare_card: boolean
  grade_level: string            // 'M4'|'M5'|'M6'|'uni'|'graduate'
}

export interface ScholarshipRow {
  id: string                     // UUID from Supabase
  name_th: string
  name_en: string | null
  funder_name_th: string | null
  funder_name_en: string | null
  funder_type: 'government' | 'corporate' | 'foundation' | 'royal' | 'university' | 'international' | null
  amount_thb: number | null
  amount_type: string | null
  min_gpa: number | null
  max_income_thb: number | null
  field_of_study: string[]
  province_restriction: string[]
  welfare_card_priority: boolean
  deadline_date: string | null
  application_url: string | null
  description_th: string | null
  description_en: string | null
  historical_bias_score: number  // 0.1-0.9, default 0.5
  grade_levels: string[] | null
}

export interface MatchResult {
  scholarship: ScholarshipRow
  raw_score: number              // 0.0-1.0 before fairness correction
  fairness_score: number         // 0.0-1.0 after equalized odds correction
  correction_applied: number     // the multiplier used (1.0 = no change)
  fairness_boosted: boolean      // true if correction > 1.0
  rank: number
  reasons: string[]              // Thai explainability strings
  reasons_en: string[]           // English explainability strings
}
