#!/usr/bin/env npx tsx
/**
 * Offline evaluation harness for the TunDee Layer 3 hybrid recommender (STEP 4).
 *
 * Computes ranking quality and fairness metrics on a synthetic seeded dataset.
 * Synthetic dataset injects known bias: national scholarships have high bias_prior,
 * so fairness_mode="on" should visibly rerank for disadvantaged students.
 *
 * Metrics:
 *   Ranking quality:   Precision@k, Recall@k, NDCG@k
 *   Fairness:          Exposure parity, Equal-opportunity gap
 *   Experiment comparison: control ("off") vs treatment ("on") per group
 *
 * Usage:
 *   npx tsx scripts/eval_harness.ts [--k 10] [--students 200]
 *
 * Output: JSON to stdout (pipe to jq for pretty-print).
 */

import { recommend }                    from '../lib/recommender/recommend';
import { computeEqualOpportunityGap }   from '../lib/recommender/reranker';
import type { RecommenderProfile, ScoredItem, FairnessMode } from '../lib/recommender/types';
import type { TdScholarship }           from '../lib/tdScholarships/types';

// ─── Synthetic data generators ────────────────────────────────────────────────

/** Deterministic seeded pseudo-random (LCG). Seed-stable for reproducibility. */
function makeRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1_664_525 + 1_013_904_223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

const NORTHEAST_PROVINCE = 'ขอนแก่น';
const BANGKOK_PROVINCE   = 'กรุงเทพมหานคร';

function makeProfile(index: number, rng: () => number): RecommenderProfile {
  const isDisadvantaged = index % 2 === 0;   // alternating for balanced split
  return {
    user_id:               `synthetic-user-${index}`,
    province_id:           isDisadvantaged ? NORTHEAST_PROVINCE : BANGKOK_PROVINCE,
    income_bracket:        isDisadvantaged ? Math.floor(rng() * 3) + 1 : Math.floor(rng() * 3) + 4,
    gpa:                   2.5 + rng() * 1.5,
    grade_level:           'uni',
    fields_of_interest:    ['any'],
    welfare_card:          isDisadvantaged && rng() > 0.5,
    region:                isDisadvantaged ? 'Northeast' : 'Bangkok',
    area_type:             isDisadvantaged ? 'rural' : 'urban',
    household_income_band: isDisadvantaged ? `band_${Math.floor(rng() * 3) + 1}` : `band_${Math.floor(rng() * 3) + 4}`,
    intended_level:        'undergraduate',
    intended_field:        rng() > 0.5 ? 'engineering' : null,
  };
}

function makeScholarships(count: number, rng: () => number): TdScholarship[] {
  return Array.from({ length: count }, (_, i) => {
    const isNational      = i % 3 !== 0;       // 2/3 national (bias_prior=0.65)
    const targetsLowIncome = i % 5 === 0;      // 1/5 target low-income (bias_prior=0.3)
    const hasIncomeCap    = i % 4 === 0;       // 1/4 have income cap
    const hasMinGpa       = i % 3 === 0;       // 1/3 have GPA requirement

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30 + Math.floor(rng() * 300));

    return {
      scholarship_id:    `SCH-${String(i).padStart(4, '0')}`,
      scholarship_name:  `ทุน Synthetic ${i}`,
      funder:            isNational ? `Major Foundation ${i % 5}` : `Regional Fund ${i % 3}`,
      funder_type:       null,
      status:            'Open' as const,
      is_displayed:      true,
      level:             'Undergraduate' as const,
      field_of_study:    i % 4 === 0 ? 'engineering' : i % 4 === 1 ? null : 'any',
      region_eligibility: isNational ? 'National' : 'Northeast',
      min_gpa:           hasMinGpa ? 2.5 + rng() * 0.5 : null,
      income_cap_thb:    hasIncomeCap ? 150_000 + Math.floor(rng() * 200_000) : null,
      award_amount_thb:  String(20_000 + Math.floor(rng() * 200_000)),
      deadline_date:     deadline.toISOString().slice(0, 10),
      deadline_raw:      null,
      deadline_is_rolling: false,
      deadline_note:     null,
      targets_low_income: targetsLowIncome,
      application_link:  '',
      source:            null,
      num_recipients:    null,
      language:          null,
      verification_status: null,
      last_verified:     null,
      verified_by:       null,
      notes:             null,
      stale:             false,
      is_displayed_reason: null,
      display_reason:    null,
      created_at:        '2026-01-01T00:00:00Z',
      updated_at:        '2026-01-01T00:00:00Z',
    } as unknown as TdScholarship;
  });
}

// ─── Metric computation ───────────────────────────────────────────────────────

function dcg(ranks: number[], k: number): number {
  return ranks
    .filter(r => r <= k)
    .reduce((acc, r) => acc + 1 / Math.log2(r + 1), 0);
}

function ndcg(result: ScoredItem[], relevantIds: Set<string>, k: number): number {
  const ideal = Array.from({ length: Math.min(relevantIds.size, k) }, (_, i) => i + 1);
  const idcg  = dcg(ideal, k);
  if (idcg === 0) return 0;

  const achievedRanks = result
    .filter(r => r.rank <= k && relevantIds.has(r.scholarship.scholarship_id ?? ''))
    .map(r => r.rank);

  return dcg(achievedRanks, k) / idcg;
}

interface EvalMetrics {
  precision_at_k: number;
  recall_at_k: number;
  ndcg_at_k: number;
  mean_rank_disadvantaged: number;
  mean_rank_advantaged: number;
  exposure_parity: number;          // |mean_rank_dis - mean_rank_adv|
  equal_opportunity_gap: number;    // |P(top-k|dis) - P(top-k|adv)|
  fairness_boost_rate: number;      // fraction of items with correction applied
}

function evalMode(
  scholarships: TdScholarship[],
  profiles: RecommenderProfile[],
  mode: FairnessMode,
  k: number,
  nowDate: Date,
): EvalMetrics {
  let sumPrec = 0, sumRecall = 0, sumNdcg = 0;
  let sumRankDis = 0, countDis = 0;
  let sumRankAdv = 0, countAdv = 0;
  let sumEOGap = 0;
  let boostCount = 0, totalItems = 0;

  for (const profile of profiles) {
    const result = recommend(scholarships, profile, { fairness_mode: mode, variant: mode === 'on' ? 'treatment' : 'control', limit: k * 2 }, nowDate);

    // "Relevant" = any eligible scholarship (since we have no real labels)
    const relevantIds = new Set(result.items.map(r => r.scholarship.scholarship_id ?? ''));

    const topK    = result.items.filter(r => r.rank <= k);
    const hitAtK  = topK.filter(r => relevantIds.has(r.scholarship.scholarship_id ?? '')).length;
    const prec    = k > 0 ? hitAtK / k : 0;
    const rec     = relevantIds.size > 0 ? hitAtK / relevantIds.size : 0;
    sumPrec   += prec;
    sumRecall += rec;
    sumNdcg   += ndcg(result.items, relevantIds, k);

    // Collect per-item group stats
    const allItems = result.items;
    for (const item of allItems) {
      if (item.protected_group === 'disadvantaged') { sumRankDis += item.rank; countDis++; }
      else                                          { sumRankAdv += item.rank; countAdv++; }
      if (item.fairness_boosted) boostCount++;
      totalItems++;
    }

    // For equal-opportunity gap we need a cross-student view — collect per-student
    // results to do it properly in aggregateResults below
    sumEOGap += computeEqualOpportunityGap(allItems, k);
  }

  const n = profiles.length;
  const meanRankDis = countDis > 0 ? sumRankDis / countDis : 0;
  const meanRankAdv = countAdv > 0 ? sumRankAdv / countAdv : 0;

  return {
    precision_at_k:          n > 0 ? sumPrec   / n : 0,
    recall_at_k:             n > 0 ? sumRecall  / n : 0,
    ndcg_at_k:               n > 0 ? sumNdcg    / n : 0,
    mean_rank_disadvantaged:  meanRankDis,
    mean_rank_advantaged:     meanRankAdv,
    exposure_parity:         Math.abs(meanRankDis - meanRankAdv),
    equal_opportunity_gap:   n > 0 ? sumEOGap   / n : 0,
    fairness_boost_rate:     totalItems > 0 ? boostCount / totalItems : 0,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const kArg     = args.indexOf('--k');
const stArg    = args.indexOf('--students');
const K        = kArg     >= 0 ? parseInt(args[kArg + 1],     10) : 10;
const N_STUD   = stArg    >= 0 ? parseInt(args[stArg + 1],    10) : 200;
const N_SCH    = 100;
const SEED     = 42;

const rng          = makeRng(SEED);
const profiles     = Array.from({ length: N_STUD },    (_, i) => makeProfile(i, rng));
const scholarships = makeScholarships(N_SCH, rng);
const nowDate      = new Date('2026-07-19T00:00:00Z');

const controlMetrics   = evalMode(scholarships, profiles, 'off', K, nowDate);
const treatmentMetrics = evalMode(scholarships, profiles, 'on',  K, nowDate);

const report = {
  meta: {
    evaluation_date:  '2026-07-19',
    k:                K,
    n_students:       N_STUD,
    n_scholarships:   N_SCH,
    seed:             SEED,
  },
  control: {
    fairness_mode: 'off',
    ...controlMetrics,
  },
  treatment: {
    fairness_mode: 'on',
    ...treatmentMetrics,
  },
  improvement: {
    exposure_parity_delta:
      controlMetrics.exposure_parity - treatmentMetrics.exposure_parity,
    equal_opportunity_gap_delta:
      controlMetrics.equal_opportunity_gap - treatmentMetrics.equal_opportunity_gap,
    fairness_boost_rate:
      treatmentMetrics.fairness_boost_rate,
    // Positive = treatment improved fairness vs control
    fairness_improved:
      treatmentMetrics.exposure_parity < controlMetrics.exposure_parity,
  },
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
