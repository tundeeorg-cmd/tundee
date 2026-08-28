/**
 * Counterfactual logging for the fairness-ranking trial.
 *
 * Implements §4 of research/PREREGISTRATION.md: on every recommendation
 * request, persist BOTH the baseline ranking and the ranking actually served —
 * for users in both arms.
 *
 * Why both, always: without the baseline stored for treatment users, the
 * counterfactual is destroyed on every request and rank displacement cannot be
 * measured after the fact without re-running a recommender whose inputs
 * (scholarship set, scores, eligibility) have since moved.
 *
 * This replaces nothing, because nothing was doing it. The `recommendations`
 * table the data dictionary describes for this purpose has never been written
 * to, and its UPSERT-per-(user × scholarship) shape would have overwritten the
 * history it exists to preserve.
 */

import { createClient } from '@/lib/supabase/client';
import { getSessionId } from './session';

/**
 * Stamped on every stored ranking. Bump when the recommender's scoring or
 * re-ranking changes in a way that makes rankings non-comparable across time.
 *
 * v1 = bootstrap bias priors from historical_bias_score
 * (getEqualizedOddsCorrection, lib/matching/engine.ts).
 */
export const RECOMMENDER_ALGORITHM_VERSION = 'recommender-v1-bootstrap-bias';

export interface RankedItem {
  scholarship_id: string;
  raw_score: number;
  fairness_score: number;
}

interface RankingEntry {
  scholarship_id: string;
  rank: number;
  score: number;
}

/** Ordered [{scholarship_id, rank, score}] — rank is 1-indexed. */
function toRanking(
  items: RankedItem[],
  score: (i: RankedItem) => number,
): RankingEntry[] {
  return [...items]
    .sort((a, b) => score(b) - score(a))
    .map((item, idx) => ({
      scholarship_id: item.scholarship_id,
      rank:           idx + 1,
      score:          Math.round(score(item) * 10000) / 10000,
    }));
}

/**
 * The multiplier actually delivered, as a single per-request figure.
 *
 * Per-item multipliers differ (they depend on each scholarship's bias prior),
 * so this records the LARGEST applied — the strongest intervention this request
 * delivered. Null when nothing was boosted. Per-item magnitudes remain
 * recoverable from the two stored rankings.
 */
function maxMultiplier(items: RankedItem[]): number | null {
  let max = 1;
  for (const i of items) {
    if (i.raw_score > 0) max = Math.max(max, i.fairness_score / i.raw_score);
  }
  return max > 1 ? Math.round(max * 10000) / 10000 : null;
}

export interface LogRecommendationArgs {
  userId: string | null;
  rankingVariant: 'baseline' | 'fairness_adjusted' | null;
  fairnessEligible: boolean;
  items: RankedItem[];
  surface?: string;
}

/**
 * Persist one recommendation request. Fire-and-forget: a research write must
 * never block or break the student's page.
 *
 * Anonymous callers (the /start preview) pass userId null and a null variant —
 * they have no arm by design, since randomization happens at profile
 * completion and showing an adjusted ranking to an unassigned visitor would
 * contaminate the pre-treatment period (§4).
 */
export function logRecommendationRequest(args: LogRecommendationArgs): void {
  void writeRecommendationRequest(args);
}

async function writeRecommendationRequest({
  userId,
  rankingVariant,
  fairnessEligible,
  items,
  surface = 'matches',
}: LogRecommendationArgs): Promise<void> {
  if (!items.length) return;

  try {
    const treated = rankingVariant === 'fairness_adjusted' && fairnessEligible;

    const supabase = createClient();
    const { error } = await supabase.from('recommendation_request').insert({
      user_id:           userId,
      session_id:        getSessionId(),
      ranking_variant:   userId ? rankingVariant : null,
      fairness_eligible: fairnessEligible,
      // The CHECK constraint permits a multiplier only where treatment was
      // actually delivered, so do not send one for a baseline-arm user even if
      // the scores happen to differ.
      fairness_multiplier_applied: treated ? maxMultiplier(items) : null,
      baseline_ranking:  toRanking(items, i => i.raw_score),
      served_ranking:    toRanking(items, i => treated ? i.fairness_score : i.raw_score),
      algorithm_version: RECOMMENDER_ALGORITHM_VERSION,
      surface,
    });

    if (error) console.warn('[recommendation_request] write error:', error.message);
  } catch (err) {
    console.warn('[recommendation_request] unexpected error:', err);
  }
}
