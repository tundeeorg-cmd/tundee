/**
 * List-level explanation de-duplication.
 *
 * The scorer is pure per-item and can't see a scholarship's neighbours, so two
 * cards sharing a strongest reason produce the same sentence. recommend() picks
 * a distinct candidate per card in rank order.
 *
 * The invariants that matter: ranking is never affected, the top card keeps its
 * best sentence, and a repeated-but-true sentence is preferred over generic
 * filler when alternatives run out.
 */

import { describe, it, expect } from 'vitest';
import { recommend } from '@/lib/recommender/recommend';
import {
  diversifyExplanations,
  dedupeOptions,
  combineOptions,
  GENERIC_OPTION,
  type ExplanationOption,
} from '@/lib/recommender/explanations';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const FIXED_NOW = new Date('2026-07-19T00:00:00Z');

function makeScholarship(overrides: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id:      'SCH-DEDUP-001',
    scholarship_name:    'Test Scholarship',
    funder:              'Test Foundation',
    status:              'Open',
    is_displayed:        true,
    level:               'Undergraduate',
    field_of_study:      null,
    region_eligibility:  'National',
    min_gpa:             3.0,
    income_cap_thb:      null,
    deadline_date:       '2027-12-31',
    deadline_is_rolling: false,
    targets_low_income:  false,
    renewable:           null,
    bond_obligation:     null,
    num_recipients:      null,
    award_value_tier:    null,
    created_at:          '2026-01-01T00:00:00Z',
    updated_at:          '2026-01-01T00:00:00Z',
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
    fields_of_interest:    [],
    welfare_card:          false,
    region:                null,
    area_type:             null,
    household_income_band: null,
    intended_level:        'uni',
    intended_field:        null,
    ...overrides,
  };
}

function run(scholarships: TdScholarship[], profile = makeProfile()) {
  return recommend(
    scholarships,
    profile,
    { fairness_mode: 'off', variant: 'test', limit: 50 },
    FIXED_NOW,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe('explanation helpers', () => {
  it('dedupes by Thai text, preserving order', () => {
    const opts: ExplanationOption[] = [
      { th: 'ก', en: 'a' },
      { th: 'ข', en: 'b' },
      { th: 'ก', en: 'a again' },
    ];
    expect(dedupeOptions(opts).map(o => o.th)).toEqual(['ก', 'ข']);
  });

  it('joins two clauses with Thai และ and English and', () => {
    const c = combineOptions({ th: 'ก', en: 'a' }, { th: 'ข', en: 'b' });
    expect(c.th).toBe('ก และข');
    expect(c.en).toBe('a, and b');
    expect(c.clauses).toEqual(['ก', 'ข']);
  });
});

describe('diversifyExplanations', () => {
  it('gives each item the best sentence not already used above it', () => {
    const items = [
      { explanation: '', explanation_en: '' },
      { explanation: '', explanation_en: '' },
    ];
    const shared: ExplanationOption = { th: 'เหมือนกัน', en: 'same' };
    const alt: ExplanationOption = { th: 'ต่างกัน', en: 'different' };

    diversifyExplanations(items, item => (item === items[0] ? [shared] : [shared, alt]));

    expect(items[0].explanation).toContain('เหมือนกัน');
    expect(items[1].explanation).toContain('ต่างกัน');
  });

  it('leaves the top card with its strongest sentence', () => {
    const items = [
      { explanation: '', explanation_en: '' },
      { explanation: '', explanation_en: '' },
    ];
    const best: ExplanationOption = { th: 'ดีที่สุด', en: 'best' };
    diversifyExplanations(items, () => [best, { th: 'รองลงมา', en: 'second' }]);

    expect(items[0].explanation).toContain('ดีที่สุด');
    expect(items[1].explanation).toContain('รองลงมา');
  });

  it('repeats a true sentence rather than inventing filler when options run out', () => {
    const items = [
      { explanation: '', explanation_en: '' },
      { explanation: '', explanation_en: '' },
    ];
    const only: ExplanationOption = { th: 'ข้อเดียว', en: 'only one' };
    diversifyExplanations(items, () => [only]);

    expect(items[0].explanation).toContain('ข้อเดียว');
    expect(items[1].explanation).toContain('ข้อเดียว');
    expect(items[1].explanation).not.toContain(GENERIC_OPTION.th);
  });

  it('avoids reusing a clause that appeared inside an earlier sentence', () => {
    // "A และ B" then a bare "B" are different strings but read as a repeat.
    const items = [
      { explanation: '', explanation_en: '' },
      { explanation: '', explanation_en: '' },
    ];
    const shared: ExplanationOption = { th: 'ไม่กำหนดเกรดขั้นต่ำ', en: 'no minimum GPA' };
    const region: ExplanationOption = { th: 'ในภูมิภาคของคุณ', en: 'in your region' };
    const other:  ExplanationOption = { th: 'เป็นทุนเต็มจำนวน', en: 'full ride' };

    diversifyExplanations(items, item =>
      item === items[0]
        ? [combineOptions(region, shared)]
        : [shared, other],
    );

    expect(items[0].explanation).toContain('ไม่กำหนดเกรดขั้นต่ำ');
    expect(items[1].explanation).not.toContain('ไม่กำหนดเกรดขั้นต่ำ');
    expect(items[1].explanation).toContain('เป็นทุนเต็มจำนวน');
  });

  it('skips items with no candidates instead of blanking them', () => {
    const items = [{ explanation: 'untouched', explanation_en: 'untouched' }];
    diversifyExplanations(items, () => undefined);
    expect(items[0].explanation).toBe('untouched');
  });
});

// ─── Through the full pipeline ────────────────────────────────────────────────

describe('recommend() explanation diversity', () => {
  it('does not repeat a sentence across cards sharing a highlight', () => {
    // The production case: several low-income scholarships, no personal reason
    // to tell them apart, previously all rendering one identical sentence.
    const result = run([
      makeScholarship({ scholarship_id: 'A', targets_low_income: true, min_gpa: null }),
      makeScholarship({ scholarship_id: 'B', targets_low_income: true, renewable: true }),
      makeScholarship({ scholarship_id: 'C', targets_low_income: true, deadline_is_rolling: true }),
    ]);

    const explanations = result.items.map(i => i.explanation);
    expect(explanations).toHaveLength(3);
    expect(new Set(explanations).size).toBe(3);
  });

  it('does not change ranking', () => {
    const scholarships = [
      makeScholarship({ scholarship_id: 'LOW',  min_gpa: 3.4 }),
      makeScholarship({ scholarship_id: 'HIGH', min_gpa: 1.0, targets_low_income: true, award_value_tier: 'full_ride' }),
    ];
    const result = run(scholarships);

    const scores = result.items.map(i => i.final_score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('leaves the reasons chips alone', () => {
    const result = run([
      makeScholarship({ scholarship_id: 'A', targets_low_income: true, min_gpa: 3.0 }),
      makeScholarship({ scholarship_id: 'B', targets_low_income: true, min_gpa: 3.0 }),
    ]);

    for (const item of result.items) {
      expect(item.reasons).toContain('GPA 3.5 ≥ ขั้นต่ำ 3');
    }
  });

  it('keeps every sentence prefixed for the UI', () => {
    const result = run([
      makeScholarship({ scholarship_id: 'A', targets_low_income: true }),
      makeScholarship({ scholarship_id: 'B', targets_low_income: true }),
    ]);
    for (const item of result.items) {
      expect(item.explanation.startsWith('ทุนนี้เหมาะกับคุณเพราะ')).toBe(true);
    }
  });

  it('falls back to repetition, not filler, for genuinely identical scholarships', () => {
    // Two rows with the same attributes have nothing to distinguish them.
    const result = run([
      makeScholarship({ scholarship_id: 'A', targets_low_income: true, min_gpa: 3.0 }),
      makeScholarship({ scholarship_id: 'B', targets_low_income: true, min_gpa: 3.0 }),
    ]);
    for (const item of result.items) {
      expect(item.explanation).not.toContain(GENERIC_OPTION.th);
    }
  });
});
