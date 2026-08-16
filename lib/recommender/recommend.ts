/**
 * Main recommend() entry point — composes the three-stage pipeline:
 *   1. filterEligible()  — hard disqualification (no ineligible item ever surfaces)
 *   2. ContentBasedScorer.score()  — content-based base score (0–1)
 *   3. rerank()  — fairness-aware final ordering (fairness_mode controls correction)
 *
 * Pure function: deterministic given the same inputs. Safe to call client-side or
 * server-side. Does NOT perform I/O; callers are responsible for fetching data and
 * logging impressions.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';
import type { RecommenderProfile, RecommendOptions, RecommendResult, Scorer } from './types';
import { filterEligible } from './eligibility';
import { ContentBasedScorer } from './scorer';
import { rerank, classifyProtectedGroup } from './reranker';
import { diversifyExplanations, type ExplanationOption } from './explanations';

export function recommend(
  scholarships: TdScholarship[],
  profile: RecommenderProfile,
  options: RecommendOptions,
  nowDate: Date = new Date(),
): RecommendResult {
  const { fairness_mode, variant, limit = 20, scorer: customScorer } = options;
  const scorer: Scorer = customScorer ?? new ContentBasedScorer(nowDate);

  // Stage 1: hard eligibility filter
  const candidates = filterEligible(scholarships, profile, nowDate);

  // Stage 2: base scoring (null = scorer's own hard disqualification guard)
  // Candidate sentences are kept aside rather than threaded through rerank —
  // they are presentation only and have no bearing on ranking.
  const explanationOptions = new Map<string, ExplanationOption[]>();

  const prescored = candidates
    .map(s => {
      const result = scorer.score(s, profile);
      if (!result) return null;
      if (result.explanation_options?.length) {
        explanationOptions.set(s.scholarship_id, result.explanation_options);
      }
      return { scholarship: s, raw_score: result.score, reasons: result.reasons, reasons_en: result.reasons_en, explanation: result.explanation, explanation_en: result.explanation_en };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Stage 3: fairness-aware re-ranking
  const items = rerank(prescored, profile, fairness_mode, limit);

  // Stage 4: presentation only — vary the copy so adjacent cards don't repeat
  // the same sentence. Runs after re-ranking so it follows final display order,
  // and never touches scores, ordering, or the reasons chips.
  diversifyExplanations(items, item => explanationOptions.get(item.scholarship.scholarship_id));

  return {
    items,
    fairness_mode,
    variant,
    candidate_count: candidates.length,
    protected_group: classifyProtectedGroup(profile),
  };
}
