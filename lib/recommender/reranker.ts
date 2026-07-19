/**
 * Fairness-aware re-ranker for the TunDee recommender (STEP 3).
 *
 * Implements the Equal Opportunity post-processing approach from:
 *   Hardt, M., Price, E., & Srebro, N. (2016). Equality of opportunity in
 *   supervised learning. NeurIPS 2016.
 *
 * Treatment condition (fairness_mode = "on"):
 *   For students in the "disadvantaged" protected group, apply a multiplicative
 *   correction to the raw content score before final sort. The correction is
 *   scholarship-specific, based on a historical bias prior (or eventually a
 *   learned CTR gap between protected groups).
 *
 *   correction_factor = clamp(1 + (bias_prior − 0.5) × 0.6, 1.0, 2.0)
 *   This is a no-op when bias_prior ≤ 0.5 (scholarship already fair or favours
 *   disadvantaged students).
 *
 * Control condition (fairness_mode = "off"):
 *   No correction — pure content-based ranking. Serves as the control arm in
 *   the causal inference experiment.
 *
 * Protected group definition (A = "disadvantaged"):
 *   region ∈ {Northeast, South}  AND  income_bracket ≤ 3
 *
 * fairness_mode is toggled by the experiment_assignment variant:
 *   variant = "control"   → fairness_mode = "off"
 *   variant = "treatment" → fairness_mode = "on"
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import type { RecommenderProfile, FairnessMode, ScoredItem } from './types';
import { computeBiasPrior } from './scorer';

const DISADVANTAGED_REGIONS = new Set([
  'northeast', 'อีสาน', 'ภาคตะวันออกเฉียงเหนือ',
  'south', 'ใต้', 'ภาคใต้',
]);

/** Classify a student into the protected group for fairness re-ranking. */
export function classifyProtectedGroup(
  profile: RecommenderProfile,
): 'disadvantaged' | 'advantaged' {
  const region = (profile.region ?? '').toLowerCase().trim();
  const isTargetedRegion = DISADVANTAGED_REGIONS.has(region);
  const isLowIncome      = profile.income_bracket <= 3;
  return (isTargetedRegion && isLowIncome) ? 'disadvantaged' : 'advantaged';
}

interface PreScoredItem {
  scholarship: TdScholarship;
  raw_score: number;
  reasons: string[];
  reasons_en: string[];
  explanation: string;
  explanation_en: string;
}

/**
 * Re-ranks a list of pre-scored items applying fairness correction if mode = "on".
 * Does NOT change the candidate set — that is the eligibility filter's job.
 * Returns ScoredItem[] sorted by final_score DESC, with ranks assigned.
 */
export function rerank(
  prescored: PreScoredItem[],
  profile: RecommenderProfile,
  mode: FairnessMode,
  limit: number = 20,
): ScoredItem[] {
  const protectedGroup = classifyProtectedGroup(profile);
  const applyCorrection = mode === 'on' && protectedGroup === 'disadvantaged';

  const withFairness = prescored.map(item => {
    const bias = computeBiasPrior(item.scholarship);
    let correctionFactor = 1.0;
    let fairnessBoosted  = false;

    if (applyCorrection && bias > 0.5) {
      correctionFactor = Math.min(1.0 + (bias - 0.5) * 0.6, 2.0);
      fairnessBoosted  = correctionFactor > 1.0;
    }

    const fairnessScore = Math.min(item.raw_score * correctionFactor, 1.0);
    const finalScore    = mode === 'on' ? fairnessScore : item.raw_score;

    return {
      scholarship:      item.scholarship,
      raw_score:        item.raw_score,
      fairness_score:   fairnessScore,
      final_score:      finalScore,
      protected_group:  protectedGroup,
      fairness_boosted: fairnessBoosted,
      correction_factor: correctionFactor,
      reasons:          item.reasons,
      reasons_en:       item.reasons_en,
      explanation:      item.explanation,
      explanation_en:   item.explanation_en,
      rank:             0,  // assigned below
    } satisfies Omit<ScoredItem, 'rank'> & { rank: number };
  });

  // Sort by final_score DESC
  withFairness.sort((a, b) => b.final_score - a.final_score);

  // Assign 1-indexed ranks and slice to limit
  return withFairness.slice(0, limit).map((item, i) => ({ ...item, rank: i + 1 }));
}

/**
 * Compute the equal-opportunity gap across the ranked list.
 * Gap = |P(rank ≤ k | eligible, disadvantaged) − P(rank ≤ k | eligible, advantaged)|
 *
 * Used by the offline evaluation harness and logged in admin analytics.
 */
export function computeEqualOpportunityGap(
  results: ScoredItem[],
  k: number = 10,
): number {
  const disadvantaged = results.filter(r => r.protected_group === 'disadvantaged');
  const advantaged    = results.filter(r => r.protected_group === 'advantaged');

  if (disadvantaged.length === 0 || advantaged.length === 0) return 0;

  const pTopK_dis = disadvantaged.filter(r => r.rank <= k).length / disadvantaged.length;
  const pTopK_adv = advantaged.filter(r => r.rank <= k).length / advantaged.length;
  return Math.abs(pTopK_dis - pTopK_adv);
}
