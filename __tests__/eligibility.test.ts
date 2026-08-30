/**
 * Unknown income must not disqualify.
 *
 * A missing income_bracket used to resolve to 999,999/month — the richest
 * bracket — so a student who had not answered the question was filtered out of
 * every scholarship with an income ceiling. Those are the need-based ones.
 */

import { describe, it, expect } from 'vitest';
import { isEligible } from '@/lib/recommender/eligibility';
import { classifyProtectedGroup } from '@/lib/recommender/reranker';
import { previewCompletesProfile } from '@/lib/preview/types';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const NOW = new Date('2026-08-30T00:00:00Z');

function capped(income_cap_thb: number | null): TdScholarship {
  return {
    scholarship_id: 'SCH-1', scholarship_name: 'S', name_th: 'ทุน', name_en: 'S',
    funder: 'F', status: 'Open', is_displayed: true, is_verified: true,
    level: 'Undergraduate', field_of_study: null, region_eligibility: 'National',
    min_gpa: null, income_cap_thb, amount_thb: 50_000, deadline_date: '2027-12-31',
    targets_low_income: true, apply_url: null, description: null, requirements: null,
    contact_info: null, source_url: null, notes: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as unknown as TdScholarship;
}

function profile(overrides: Partial<RecommenderProfile> = {}): RecommenderProfile {
  return {
    user_id: 'u', province_id: 'กรุงเทพมหานคร', income_bracket: 4, gpa: 3.5,
    grade_level: 'uni', fields_of_interest: ['any'], welfare_card: false,
    region: 'Bangkok', area_type: 'urban', household_income_band: 'band_4',
    intended_level: 'undergraduate', intended_field: null, ...overrides,
  };
}

describe('income cap with an unknown bracket', () => {
  // 150,000/yr is below bracket 4's ceiling (20,000 × 12 = 240,000), so a
  // declared bracket 4 is ruled out and the null case is a real difference.
  it('does not disqualify when income was never declared', () => {
    const r = isEligible(capped(150_000), profile({ income_bracket: null }), NOW);
    expect(r.eligible).toBe(true);
  });

  it('still disqualifies a bracket that genuinely exceeds the cap', () => {
    const r = isEligible(capped(150_000), profile({ income_bracket: 4 }), NOW);
    expect(r).toEqual({ eligible: false, reason: 'income_exceeds_cap' });
  });

  it('still admits a bracket that fits under the cap', () => {
    expect(isEligible(capped(150_000), profile({ income_bracket: 1 }), NOW).eligible).toBe(true);
  });

  it('treats an out-of-range bracket as unknown, not as rich', () => {
    expect(isEligible(capped(150_000), profile({ income_bracket: 99 }), NOW).eligible).toBe(true);
  });

  it('is unaffected when the scholarship has no cap at all', () => {
    expect(isEligible(capped(null), profile({ income_bracket: null }), NOW).eligible).toBe(true);
  });
});

describe('classifyProtectedGroup with an unknown bracket', () => {
  const northeast = { province_id: 'ขอนแก่น', region: 'Northeast' };

  it('does not call an unknown-income student low-income', () => {
    // `null <= 3` is true in JavaScript; the pre-registered definition needs a
    // declared bracket, and lib/research/assignment.ts already returns false.
    expect(classifyProtectedGroup(profile({ ...northeast, income_bracket: null })))
      .toBe('advantaged');
  });

  it('still protects a declared low-income student in a targeted region', () => {
    expect(classifyProtectedGroup(profile({ ...northeast, income_bracket: 2 })))
      .toBe('disadvantaged');
  });
});

describe('previewCompletesProfile', () => {
  const input = { level: 'uni', province: 'ขอนแก่น', income: 3, gpa: 3.2 };

  it('accepts a preview that fills every required field', () => {
    expect(previewCompletesProfile(input)).toBe(true);
  });

  it('rejects a preview with no income, which is what half-wrote five profiles', () => {
    expect(previewCompletesProfile({ ...input, income: null } as never)).toBe(false);
  });

  it('rejects a missing preview', () => {
    expect(previewCompletesProfile(null)).toBe(false);
  });
});
