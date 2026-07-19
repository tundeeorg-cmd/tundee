/**
 * Type definitions for the TunDee hybrid recommender.
 *
 * Architecture: Eligibility Filter → Content-Based Scorer → Fairness Re-ranker
 *
 * fairness_mode = "off" → base ranking only (control condition in causal study)
 * fairness_mode = "on"  → fairness-aware re-ranking (treatment condition)
 *
 * Fairness definition: Equal Opportunity (Hardt, Price, Srebro 2016; relaxation
 * of Equalized Odds focusing on qualified students only):
 *   P(top-k | eligible, A=disadvantaged) ≈ P(top-k | eligible, A=advantaged)
 *
 * Protected group (A=1 / "disadvantaged"):
 *   region ∈ {Northeast, South}  AND  income_bracket ≤ 3 (≤ ฿15k/month)
 *   (expanded from Northeast-only; South shows comparable historical underrepresentation)
 *
 * Reference:
 *   Dwork, C., Hardt, M., Pitassi, T., Reingold, O., & Zemel, R. (2012).
 *   Fairness through awareness. ITCS 2012.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface RecommenderProfile {
  user_id: string;

  // From profiles table
  province_id: string;         // Thai province name, e.g. 'เชียงใหม่'
  income_bracket: number;      // 1–7 (mapped to monthly THB ceilings)
  gpa: number;
  grade_level: string;         // 'M4'|'M5'|'M6'|'uni'|'graduate'
  fields_of_interest: string[];
  welfare_card: boolean;

  // From student_profile table (enriched; may be null if not filled)
  region: string | null;       // Bangkok|Central|North|Northeast|South|East|West
  area_type: 'urban' | 'peri_urban' | 'rural' | null;
  household_income_band: string | null;   // band_1..band_7
  intended_level: string | null;
  intended_field: string | null;
}

// ─── Recommender config ───────────────────────────────────────────────────────

export type FairnessMode = 'off' | 'on';

export interface RecommendOptions {
  fairness_mode: FairnessMode;
  variant: string;             // experiment variant ('control'|'treatment')
  limit?: number;              // default 20
  scorer?: Scorer;             // pluggable scorer; defaults to ContentBasedScorer
}

// ─── Scorer interface (pluggable; swap in CF model post cold-start) ──────────

export interface ScorerResult {
  /** Normalized 0–1 base match quality. null = hard ineligible. */
  score: number;
  reasons: string[];
  reasons_en: string[];
  /** Why recommended — one sentence shown to the student. */
  explanation: string;
  explanation_en: string;
}

export interface Scorer {
  score(scholarship: TdScholarship, profile: RecommenderProfile): ScorerResult | null;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ScoredItem {
  scholarship: TdScholarship;
  raw_score: number;         // content-based score (0–1)
  fairness_score: number;    // after re-ranking correction (0–1)
  final_score: number;       // the score used for the final sort
  rank: number;              // 1-indexed position in returned list
  protected_group: 'disadvantaged' | 'advantaged';
  fairness_boosted: boolean;
  correction_factor: number; // multiplier applied (1.0 = no change)
  reasons: string[];
  reasons_en: string[];
  explanation: string;       // single-sentence "why recommended" (Thai)
  explanation_en: string;    // single-sentence "why recommended" (English)
}

export interface RecommendResult {
  items: ScoredItem[];
  fairness_mode: FairnessMode;
  variant: string;
  candidate_count: number;   // size of eligible set before re-ranking
  protected_group: 'disadvantaged' | 'advantaged';
}
