/**
 * Tests for the TunDee Layer 3 hybrid recommender.
 *
 * Covers all 5 steps:
 *   STEP 1: Candidate generation — hard eligibility filter
 *   STEP 2: Base scoring — ContentBasedScorer
 *   STEP 3: Fairness-aware re-ranking (fairness_mode off vs on)
 *   STEP 4: Offline evaluation metrics
 *   STEP 5: Guardrails — ineligible items never surface; candidate set same in both modes
 */

import { describe, it, expect } from 'vitest';
import { filterEligible, isEligible } from '@/lib/recommender/eligibility';
import { ContentBasedScorer, computeBiasPrior } from '@/lib/recommender/scorer';
import { rerank, classifyProtectedGroup, computeEqualOpportunityGap } from '@/lib/recommender/reranker';
import { recommend } from '@/lib/recommender/recommend';
import type { RecommenderProfile, FairnessMode } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeScholarship(overrides: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id:   'SCH-TEST-001',
    scholarship_name: 'Test Scholarship',
    name_th:          'ทุนทดสอบ',
    name_en:          'Test Scholarship',
    funder:           'Test Foundation',
    status:           'Open',
    is_displayed:     true,
    is_verified:      true,
    level:            'Undergraduate',
    field_of_study:   null,
    region_eligibility: 'National',
    min_gpa:          null,
    income_cap_thb:   null,
    amount_thb:       50_000,
    deadline_date:    '2027-12-31',
    targets_low_income: false,
    apply_url:        null,
    description:      null,
    requirements:     null,
    contact_info:     null,
    source_url:       null,
    notes:            null,
    created_at:       '2026-01-01T00:00:00Z',
    updated_at:       '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as TdScholarship;
}

function makeProfile(overrides: Partial<RecommenderProfile> = {}): RecommenderProfile {
  return {
    user_id:               'test-user',
    province_id:           'กรุงเทพมหานคร',
    income_bracket:        4,
    gpa:                   3.5,
    grade_level:           'uni',
    fields_of_interest:    ['any'],
    welfare_card:          false,
    region:                'Bangkok',
    area_type:             'urban',
    household_income_band: 'band_4',
    intended_level:        'undergraduate',
    intended_field:        null,
    ...overrides,
  };
}

const FIXED_NOW = new Date('2026-07-19T00:00:00Z');

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: Candidate generation — eligibility filter
// ═══════════════════════════════════════════════════════════════════════════════

describe('isEligible — hard eligibility filter', () => {
  it('accepts a standard open scholarship for a matching profile', () => {
    const s = makeScholarship();
    const p = makeProfile();
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('rejects is_displayed=false scholarships', () => {
    const s = makeScholarship({ is_displayed: false });
    expect(isEligible(s, makeProfile(), FIXED_NOW).eligible).toBe(false);
    expect(isEligible(s, makeProfile(), FIXED_NOW).reason).toBe('not_displayed');
  });

  it('rejects closed (non-Open) scholarships', () => {
    const s = makeScholarship({ status: 'Closed' as never });
    expect(isEligible(s, makeProfile(), FIXED_NOW).eligible).toBe(false);
  });

  it('rejects scholarships with past deadlines', () => {
    const s = makeScholarship({ deadline_date: '2025-01-01' });
    expect(isEligible(s, makeProfile(), FIXED_NOW).eligible).toBe(false);
    expect(isEligible(s, makeProfile(), FIXED_NOW).reason).toBe('past_deadline');
  });

  it('accepts scholarships with future deadlines', () => {
    const s = makeScholarship({ deadline_date: '2027-01-01' });
    expect(isEligible(s, makeProfile(), FIXED_NOW).eligible).toBe(true);
  });

  it('rejects when student GPA is below minimum', () => {
    const s = makeScholarship({ min_gpa: 3.5 });
    const p = makeProfile({ gpa: 3.0 });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(false);
    expect(isEligible(s, p, FIXED_NOW).reason).toBe('gpa_below_minimum');
  });

  it('accepts when student GPA meets or exceeds minimum', () => {
    const s = makeScholarship({ min_gpa: 3.0 });
    const p = makeProfile({ gpa: 3.5 });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('rejects when student income bracket ceiling exceeds income cap', () => {
    // bracket 5 = ≤30k/month = 360k/year; cap = 180k/year → ineligible
    const s = makeScholarship({ income_cap_thb: 180_000 });
    const p = makeProfile({ income_bracket: 5 });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(false);
    expect(isEligible(s, p, FIXED_NOW).reason).toBe('income_exceeds_cap');
  });

  it('accepts when student income bracket ceiling is within income cap', () => {
    // bracket 1 = ≤5k/month = 60k/year; cap = 180k/year → eligible
    const s = makeScholarship({ income_cap_thb: 180_000 });
    const p = makeProfile({ income_bracket: 1 });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('rejects on field mismatch when student has a declared field', () => {
    const s = makeScholarship({ field_of_study: 'medicine' });
    const p = makeProfile({ fields_of_interest: ['engineering'], intended_field: 'engineering' });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(false);
    expect(isEligible(s, p, FIXED_NOW).reason).toBe('field_mismatch');
  });

  it('accepts on field match', () => {
    const s = makeScholarship({ field_of_study: 'engineering, computer science' });
    const p = makeProfile({ fields_of_interest: ['engineering'] });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('accepts any field when scholarship is open (null field_of_study)', () => {
    const s = makeScholarship({ field_of_study: null });
    const p = makeProfile({ fields_of_interest: ['medicine'] });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('accepts any student when scholarship field is "any"', () => {
    const s = makeScholarship({ field_of_study: 'any' });
    const p = makeProfile({ fields_of_interest: ['engineering'] });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });

  it('rejects high-school scholarship for a university student', () => {
    const s = makeScholarship({ level: 'High school' as never });
    const p = makeProfile({ grade_level: 'uni' });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(false);
  });

  it('accepts undergraduate scholarship for a university student', () => {
    const s = makeScholarship({ level: 'Undergraduate' as never });
    const p = makeProfile({ grade_level: 'uni' });
    expect(isEligible(s, p, FIXED_NOW).eligible).toBe(true);
  });
});

describe('filterEligible', () => {
  it('returns only eligible scholarships from a mixed list', () => {
    const scholarships = [
      makeScholarship({ scholarship_id: 'A', is_displayed: true }),
      makeScholarship({ scholarship_id: 'B', is_displayed: false }),
      makeScholarship({ scholarship_id: 'C', min_gpa: 4.0 }),  // student has 3.5
      makeScholarship({ scholarship_id: 'D', deadline_date: '2025-01-01' }),  // past
      makeScholarship({ scholarship_id: 'E', is_displayed: true }),
    ];
    const profile = makeProfile({ gpa: 3.5 });
    const result = filterEligible(scholarships, profile, FIXED_NOW);
    const ids = result.map(s => s.scholarship_id);
    expect(ids).toContain('A');
    expect(ids).toContain('E');
    expect(ids).not.toContain('B');
    expect(ids).not.toContain('C');
    expect(ids).not.toContain('D');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: Base scoring — ContentBasedScorer
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContentBasedScorer', () => {
  const scorer = new ContentBasedScorer(FIXED_NOW);

  it('returns a score between 0 and 1 for a valid scholarship-profile pair', () => {
    const result = scorer.score(makeScholarship(), makeProfile());
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(1);
  });

  it('returns reasons array', () => {
    const result = scorer.score(makeScholarship(), makeProfile());
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.reasons)).toBe(true);
    expect(Array.isArray(result!.reasons_en)).toBe(true);
  });

  it('scores higher when GPA is well above minimum', () => {
    const s = makeScholarship({ min_gpa: 2.0 });
    const pHigh = makeProfile({ gpa: 3.9 });
    const pLow  = makeProfile({ gpa: 2.1 });
    const rHigh = scorer.score(s, pHigh)!;
    const rLow  = scorer.score(s, pLow)!;
    expect(rHigh.score).toBeGreaterThan(rLow.score);
  });

  it('scores higher for welfare card holder when scholarship targets low income', () => {
    const s = makeScholarship({ targets_low_income: true });
    const pWelfare   = makeProfile({ welfare_card: true });
    const pNoWelfare = makeProfile({ welfare_card: false });
    const rW  = scorer.score(s, pWelfare)!;
    const rNW = scorer.score(s, pNoWelfare)!;
    expect(rW.score).toBeGreaterThan(rNW.score);
  });

  it('scores higher for field match than open-field scholarship', () => {
    const sMatched = makeScholarship({ field_of_study: 'engineering' });
    const sOpen    = makeScholarship({ field_of_study: null });
    const p        = makeProfile({ fields_of_interest: ['engineering'] });
    const rM = scorer.score(sMatched, p)!;
    const rO = scorer.score(sOpen, p)!;
    expect(rM.score).toBeGreaterThan(rO.score);
  });

  it('gives urgency bonus for scholarship closing within 14 days', () => {
    const nowDate   = new Date('2026-07-19T00:00:00Z');
    const urgent    = new Date(nowDate); urgent.setDate(urgent.getDate() + 7);
    const notUrgent = new Date(nowDate); notUrgent.setDate(notUrgent.getDate() + 90);

    const sUrgent    = makeScholarship({ deadline_date: urgent.toISOString().slice(0, 10) });
    const sNotUrgent = makeScholarship({ deadline_date: notUrgent.toISOString().slice(0, 10) });

    const sc = new ContentBasedScorer(nowDate);
    const rU  = sc.score(sUrgent,    makeProfile())!;
    const rNU = sc.score(sNotUrgent, makeProfile())!;
    expect(rU.score).toBeGreaterThan(rNU.score);
  });

  it('returns an explanation string', () => {
    const result = scorer.score(makeScholarship(), makeProfile());
    expect(typeof result!.explanation).toBe('string');
    expect(result!.explanation.length).toBeGreaterThan(0);
  });
});

describe('computeBiasPrior', () => {
  it('returns 0.3 for scholarships targeting low income', () => {
    const s = makeScholarship({ targets_low_income: true });
    expect(computeBiasPrior(s)).toBe(0.3);
  });

  it('returns 0.65 for national scholarships without income targeting', () => {
    const s = makeScholarship({ region_eligibility: 'National', targets_low_income: false });
    expect(computeBiasPrior(s)).toBe(0.65);
  });

  it('returns 0.35 for Northeast-restricted scholarships', () => {
    const s = makeScholarship({ region_eligibility: 'Northeast', targets_low_income: false });
    expect(computeBiasPrior(s)).toBe(0.35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: Fairness re-ranking
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyProtectedGroup', () => {
  it('classifies Northeast + low-income as disadvantaged', () => {
    const p = makeProfile({ region: 'Northeast', income_bracket: 2 });
    expect(classifyProtectedGroup(p)).toBe('disadvantaged');
  });

  it('classifies South + low-income as disadvantaged', () => {
    const p = makeProfile({ region: 'South', income_bracket: 3 });
    expect(classifyProtectedGroup(p)).toBe('disadvantaged');
  });

  it('classifies Bangkok + any income as advantaged', () => {
    const p = makeProfile({ region: 'Bangkok', income_bracket: 2 });
    expect(classifyProtectedGroup(p)).toBe('advantaged');
  });

  it('classifies Northeast + high income as advantaged (income bracket > 3)', () => {
    const p = makeProfile({ region: 'Northeast', income_bracket: 5 });
    expect(classifyProtectedGroup(p)).toBe('advantaged');
  });

  it('classifies null region as advantaged (benefit of doubt)', () => {
    const p = makeProfile({ region: null, income_bracket: 1 });
    expect(classifyProtectedGroup(p)).toBe('advantaged');
  });
});

describe('rerank — fairness_mode off', () => {
  const prescored = [
    { scholarship: makeScholarship({ scholarship_id: 'A' }), raw_score: 0.9, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    { scholarship: makeScholarship({ scholarship_id: 'B' }), raw_score: 0.7, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    { scholarship: makeScholarship({ scholarship_id: 'C' }), raw_score: 0.5, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
  ];

  it('sorts by raw_score DESC when mode is off', () => {
    const p = makeProfile({ region: 'Northeast', income_bracket: 2 });
    const result = rerank(prescored, p, 'off');
    expect(result.map(r => r.scholarship.scholarship_id)).toEqual(['A', 'B', 'C']);
  });

  it('assigns 1-indexed ranks', () => {
    const p = makeProfile();
    const result = rerank(prescored, p, 'off');
    expect(result.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('does not boost any item in off mode', () => {
    const p = makeProfile({ region: 'Northeast', income_bracket: 1 });
    const result = rerank(prescored, p, 'off');
    expect(result.every(r => !r.fairness_boosted)).toBe(true);
    expect(result.every(r => r.correction_factor === 1.0)).toBe(true);
  });
});

describe('rerank — fairness_mode on', () => {
  it('boosts scores for disadvantaged students on biased scholarships', () => {
    // National scholarship → bias_prior = 0.65 → correction ≈ 1.09
    const biasedScholarship  = makeScholarship({ region_eligibility: 'National', targets_low_income: false });
    const prescored = [
      { scholarship: biasedScholarship, raw_score: 0.5, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    ];
    const disadvantaged = makeProfile({ region: 'Northeast', income_bracket: 2 });
    const result = rerank(prescored, disadvantaged, 'on');
    expect(result[0].fairness_boosted).toBe(true);
    expect(result[0].fairness_score).toBeGreaterThan(result[0].raw_score);
    expect(result[0].correction_factor).toBeGreaterThan(1.0);
  });

  it('does NOT boost scores for advantaged students even in on mode', () => {
    const biasedScholarship = makeScholarship({ region_eligibility: 'National', targets_low_income: false });
    const prescored = [
      { scholarship: biasedScholarship, raw_score: 0.5, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    ];
    const advantaged = makeProfile({ region: 'Bangkok', income_bracket: 5 });
    const result = rerank(prescored, advantaged, 'on');
    expect(result[0].fairness_boosted).toBe(false);
    expect(result[0].correction_factor).toBe(1.0);
  });

  it('does NOT boost low-bias scholarships (bias_prior ≤ 0.5)', () => {
    // targets_low_income=true → bias_prior = 0.3 (≤ 0.5 → no boost)
    const fairScholarship = makeScholarship({ targets_low_income: true });
    const prescored = [
      { scholarship: fairScholarship, raw_score: 0.5, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    ];
    const disadvantaged = makeProfile({ region: 'Northeast', income_bracket: 1 });
    const result = rerank(prescored, disadvantaged, 'on');
    expect(result[0].fairness_boosted).toBe(false);
    expect(result[0].correction_factor).toBe(1.0);
  });

  it('respects the limit parameter', () => {
    const prescored = Array.from({ length: 30 }, (_, i) => ({
      scholarship: makeScholarship({ scholarship_id: `S${i}` }),
      raw_score: 0.5,
      reasons: [], reasons_en: [], explanation: '', explanation_en: '',
    }));
    const result = rerank(prescored, makeProfile(), 'on', 10);
    expect(result).toHaveLength(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: Offline evaluation harness
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeEqualOpportunityGap', () => {
  it('returns 0 when only one group is present', () => {
    const items = [
      { rank: 1, protected_group: 'advantaged', scholarship: makeScholarship({ scholarship_id: 'A' }) },
      { rank: 2, protected_group: 'advantaged', scholarship: makeScholarship({ scholarship_id: 'B' }) },
    ] as Parameters<typeof computeEqualOpportunityGap>[0];
    expect(computeEqualOpportunityGap(items, 5)).toBe(0);
  });

  it('returns 0 when both groups have equal top-k exposure', () => {
    const items = [
      { rank: 1, protected_group: 'disadvantaged' },
      { rank: 2, protected_group: 'advantaged' },
    ] as Parameters<typeof computeEqualOpportunityGap>[0];
    // k=2: both groups have 1 member in top-2 → 1/1 each → gap = 0
    expect(computeEqualOpportunityGap(items, 2)).toBe(0);
  });

  it('returns a positive gap when disadvantaged group is under-represented in top-k', () => {
    // 3 advantaged in top-5, 0 disadvantaged in top-5 → gap > 0
    const items = [
      { rank: 1, protected_group: 'advantaged' },
      { rank: 2, protected_group: 'advantaged' },
      { rank: 3, protected_group: 'advantaged' },
      { rank: 6, protected_group: 'disadvantaged' },
      { rank: 7, protected_group: 'disadvantaged' },
    ] as Parameters<typeof computeEqualOpportunityGap>[0];
    const gap = computeEqualOpportunityGap(items, 5);
    expect(gap).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5: Guardrails — end-to-end invariants
// ═══════════════════════════════════════════════════════════════════════════════

describe('recommend() — guardrails', () => {
  const scholarships = [
    makeScholarship({ scholarship_id: 'ELIGIBLE_A',   is_displayed: true,  status: 'Open' }),
    makeScholarship({ scholarship_id: 'ELIGIBLE_B',   is_displayed: true,  status: 'Open', min_gpa: 2.0 }),
    makeScholarship({ scholarship_id: 'INELIGIBLE_C', is_displayed: false, status: 'Open' }),
    makeScholarship({ scholarship_id: 'INELIGIBLE_D', is_displayed: true,  status: 'Closed' as never }),
    makeScholarship({ scholarship_id: 'INELIGIBLE_E', is_displayed: true,  status: 'Open', min_gpa: 4.5 }),
    makeScholarship({ scholarship_id: 'INELIGIBLE_F', is_displayed: true,  status: 'Open', deadline_date: '2020-01-01' }),
  ];
  const profile = makeProfile({ gpa: 3.0 });

  it('never includes ineligible scholarships in results (mode = off)', () => {
    const result = recommend(scholarships, profile, { fairness_mode: 'off', variant: 'control' }, FIXED_NOW);
    const ids = result.items.map(i => i.scholarship.scholarship_id);
    expect(ids).not.toContain('INELIGIBLE_C');
    expect(ids).not.toContain('INELIGIBLE_D');
    expect(ids).not.toContain('INELIGIBLE_E');
    expect(ids).not.toContain('INELIGIBLE_F');
  });

  it('never includes ineligible scholarships in results (mode = on)', () => {
    const result = recommend(scholarships, profile, { fairness_mode: 'on', variant: 'treatment' }, FIXED_NOW);
    const ids = result.items.map(i => i.scholarship.scholarship_id);
    expect(ids).not.toContain('INELIGIBLE_C');
    expect(ids).not.toContain('INELIGIBLE_D');
    expect(ids).not.toContain('INELIGIBLE_E');
    expect(ids).not.toContain('INELIGIBLE_F');
  });

  it('includes all eligible scholarships', () => {
    const result = recommend(scholarships, profile, { fairness_mode: 'off', variant: 'control' }, FIXED_NOW);
    const ids = result.items.map(i => i.scholarship.scholarship_id);
    expect(ids).toContain('ELIGIBLE_A');
    expect(ids).toContain('ELIGIBLE_B');
  });

  it('candidate_count is the same regardless of fairness_mode', () => {
    const resultOff = recommend(scholarships, profile, { fairness_mode: 'off', variant: 'control' }, FIXED_NOW);
    const resultOn  = recommend(scholarships, profile, { fairness_mode: 'on',  variant: 'treatment' }, FIXED_NOW);
    expect(resultOff.candidate_count).toBe(resultOn.candidate_count);
  });

  it('produces deterministic output given same inputs', () => {
    const r1 = recommend(scholarships, profile, { fairness_mode: 'on', variant: 'treatment' }, FIXED_NOW);
    const r2 = recommend(scholarships, profile, { fairness_mode: 'on', variant: 'treatment' }, FIXED_NOW);
    expect(r1.items.map(i => i.scholarship.scholarship_id))
      .toEqual(r2.items.map(i => i.scholarship.scholarship_id));
    expect(r1.items.map(i => i.rank)).toEqual(r2.items.map(i => i.rank));
  });

  it('final_score uses raw_score in off mode', () => {
    const result = recommend(scholarships, profile, { fairness_mode: 'off', variant: 'control' }, FIXED_NOW);
    for (const item of result.items) {
      expect(item.final_score).toBe(item.raw_score);
    }
  });

  it('final_score uses fairness_score in on mode', () => {
    const result = recommend(scholarships, profile, { fairness_mode: 'on', variant: 'treatment' }, FIXED_NOW);
    for (const item of result.items) {
      expect(item.final_score).toBe(item.fairness_score);
    }
  });

  it('respects limit parameter', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      makeScholarship({ scholarship_id: `S${i}`, is_displayed: true }),
    );
    const result = recommend(many, profile, { fairness_mode: 'off', variant: 'control', limit: 5 }, FIXED_NOW);
    expect(result.items).toHaveLength(5);
  });

  it('fairness mode improves exposure for disadvantaged students on biased dataset', () => {
    // Synthetic biased dataset: 10 national scholarships (bias_prior=0.65)
    const biasedScholarships = Array.from({ length: 10 }, (_, i) =>
      makeScholarship({
        scholarship_id:    `BIASED-${i}`,
        region_eligibility: 'National',
        targets_low_income: false,
        min_gpa:           2.0,
      }),
    );
    const disadvantaged = makeProfile({ region: 'Northeast', income_bracket: 2, gpa: 3.0 });

    const off = recommend(biasedScholarships, disadvantaged, { fairness_mode: 'off', variant: 'control' }, FIXED_NOW);
    const on  = recommend(biasedScholarships, disadvantaged, { fairness_mode: 'on',  variant: 'treatment' }, FIXED_NOW);

    // In on-mode, at least some items should be boosted
    const boostCount = on.items.filter(i => i.fairness_boosted).length;
    expect(boostCount).toBeGreaterThan(0);

    // In off-mode, no items are boosted
    const offBoostCount = off.items.filter(i => i.fairness_boosted).length;
    expect(offBoostCount).toBe(0);
  });
});

// ── Pluggable scorer interface ──────────────────────────────────────────────────

describe('Scorer interface is pluggable', () => {
  it('accepts a custom scorer implementation', () => {
    const customScorer = {
      score: (s: TdScholarship, _p: RecommenderProfile) => ({
        score:          0.99,
        reasons:        ['custom'],
        reasons_en:     ['custom'],
        explanation:    'custom',
        explanation_en: 'custom',
      }),
    };

    const s = [makeScholarship({ scholarship_id: 'X' })];
    const p = makeProfile();
    const result = recommend(s, p, { fairness_mode: 'off', variant: 'control', scorer: customScorer }, FIXED_NOW);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].raw_score).toBe(0.99);
    expect(result.items[0].reasons).toContain('custom');
  });
});
