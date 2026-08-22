/**
 * "Why recommended" copy from ContentBasedScorer.
 *
 * Two properties matter, both of them conversion-facing on /start:
 *   1. The lead clause is the reason that contributed the MOST score, not
 *      whichever happened to be pushed first.
 *   2. Neighbouring cards don't all say the same thing — a student whose only
 *      personal signal is their region used to get an identical sentence on
 *      every card in the list.
 */

import { describe, it, expect } from 'vitest';
import { ContentBasedScorer } from '@/lib/recommender/scorer';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const FIXED_NOW = new Date('2026-07-19T00:00:00Z');
const scorer = new ContentBasedScorer(FIXED_NOW);

function makeScholarship(overrides: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id:      'SCH-EXP-001',
    scholarship_name:    'Test Scholarship',
    funder:              'Test Foundation',
    status:              'Open',
    is_displayed:        true,
    level:               'Undergraduate',
    field_of_study:      null,
    region_eligibility:  'National',
    min_gpa:             null,
    income_cap_thb:      null,
    deadline_date:       '2027-12-31',
    deadline_is_rolling: false,
    targets_low_income:  false,
    renewable:           null,
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
    province:              'ขอนแก่น',
    income_bracket:        4,
    gpa:                   3.25,
    grade_level:           'M4-M6',
    fields_of_interest:    [],
    welfare_card:          false,
    region:                null,
    area_type:             null,
    household_income_band: null,
    intended_level:        'M4-M6',
    intended_field:        null,
    ...overrides,
  };
}

describe('explanation copy', () => {
  it('always produces a Thai sentence with the expected prefix', () => {
    const r = scorer.score(makeScholarship(), makeProfile());
    expect(r!.explanation.startsWith('ทุนนี้เหมาะกับคุณเพราะ')).toBe(true);
    expect(r!.explanation_en.startsWith('Recommended because')).toBe(true);
  });

  it('leads with the field match over a weaker region match', () => {
    // Field contributes 0.20, region 0.15 — but region is pushed later, so the
    // old reasons[0] logic would still have surfaced whichever came first.
    const r = scorer.score(
      makeScholarship({ field_of_study: 'Engineering', region_eligibility: 'Northeast' }),
      makeProfile({ fields_of_interest: ['engineering'] }),
    );
    expect(r!.explanation).toContain('สาขา');
  });

  it('leads with a strong GPA margin when it outweighs everything else', () => {
    const r = scorer.score(
      makeScholarship({ min_gpa: 2.0, region_eligibility: 'Northeast' }),
      makeProfile({ gpa: 4.0 }),
    );
    expect(r!.explanation).toContain('เกรด');
  });

  it('still explains a GPA that exactly meets the minimum', () => {
    // Zero margin, so the reason carries weight 0 — but it is true and specific,
    // which beats falling through to boilerplate.
    const r = scorer.score(
      makeScholarship({ min_gpa: 2.0 }),
      makeProfile({ gpa: 2.0 }),
    );
    expect(r!.explanation).toContain('ผ่านเกณฑ์ขั้นต่ำ 2');
  });

  it('falls back to a generic sentence when nothing distinguishes the scholarship', () => {
    // No personal reason fires and no highlight applies: GPA below the minimum
    // (the eligibility layer, not the scorer, drops these), a declared field the
    // student doesn't share, national reach, and no notable award attributes.
    const r = scorer.score(
      makeScholarship({ min_gpa: 3.5, field_of_study: 'Engineering', num_recipients: 5 }),
      makeProfile({ gpa: 2.0, fields_of_interest: ['nursing'] }),
    );
    expect(r!.explanation).toBe('ทุนนี้เหมาะกับคุณเพราะตรงตามเกณฑ์คุณสมบัติ');
  });

  it('distinguishes scholarships that share the same personal reason', () => {
    // The /start regression: three Northeast scholarships, one student, and
    // previously three identical "ภูมิภาคตรงกัน" sentences.
    const profile = makeProfile();
    const region = { region_eligibility: 'Northeast' };

    const explanations = [
      makeScholarship({ ...region, scholarship_id: 'A', award_value_tier: 'full_ride' }),
      makeScholarship({ ...region, scholarship_id: 'B', targets_low_income: true }),
      makeScholarship({ ...region, scholarship_id: 'C', min_gpa: 3.0, renewable: true }),
    ].map(s => scorer.score(s, profile)!.explanation);

    expect(new Set(explanations).size).toBe(3);
  });

  it('mentions the region and the scholarship highlight together', () => {
    const r = scorer.score(
      makeScholarship({ region_eligibility: 'Northeast', award_value_tier: 'full_ride' }),
      makeProfile(),
    );
    expect(r!.explanation).toContain('ภูมิภาค');
    expect(r!.explanation).toContain('เต็มจำนวน');
  });

  it('never repeats the same clause twice', () => {
    const r = scorer.score(
      makeScholarship({ region_eligibility: 'Northeast', targets_low_income: true }),
      makeProfile({ welfare_card: true }),
    );
    const clauses = r!.explanation.replace('ทุนนี้เหมาะกับคุณเพราะ', '').split(' และ');
    expect(new Set(clauses).size).toBe(clauses.length);
  });

  it('does not claim a region match for a student with no region on file', () => {
    // String.includes('') is true for every string, so a null region used to
    // match every region-restricted scholarship.
    const r = scorer.score(
      makeScholarship({ region_eligibility: 'Northeast' }),
      makeProfile({ province: 'กรุงเทพมหานคร', region: null }),
    );
    expect(r!.reasons).not.toContain('ภูมิภาคตรงกัน');
    expect(r!.explanation).not.toContain('ภูมิภาค');
  });

  it('does not claim a region match when province is blank too', () => {
    const r = scorer.score(
      makeScholarship({ region_eligibility: 'Northeast' }),
      makeProfile({ province: '', region: null }),
    );
    expect(r!.reasons).not.toContain('ภูมิภาคตรงกัน');
  });

  it('still matches a genuine region hit', () => {
    const r = scorer.score(
      makeScholarship({ region_eligibility: 'Northeast' }),
      makeProfile({ province: 'ขอนแก่น', region: null }),
    );
    expect(r!.reasons).toContain('ภูมิภาคตรงกัน');
  });

  it('leaves the reasons chips untouched', () => {
    // reasons/reasons_en drive the card chips and the research export — this
    // change is explanation-only and must not alter them.
    const r = scorer.score(
      makeScholarship({ min_gpa: 3.0, region_eligibility: 'Northeast' }),
      makeProfile(),
    );
    expect(r!.reasons).toContain('GPA 3.3 ≥ ขั้นต่ำ 3');
    expect(r!.reasons).toContain('ภูมิภาคตรงกัน');
    expect(r!.reasons_en).toContain('Region match');
  });
});
