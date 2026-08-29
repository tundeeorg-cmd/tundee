/**
 * Protected-group classification for the fairness re-ranker.
 *
 * This file exists because the correction silently never fired in production:
 * /scholarships builds its RecommenderProfile with region: null, so the
 * classifier saw an empty string, every user came back 'advantaged', and the
 * treatment arm served rankings identical to the control arm.
 *
 * The first test below is the one that would have caught it. It builds the
 * profile exactly as the live page does — region null, province carried in
 * province_id — rather than the tidy shape a unit test would invent.
 */

import { describe, it, expect } from 'vitest';
import { classifyProtectedGroup, rerank } from '@/lib/recommender/reranker';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

/** Built exactly as app/scholarships/page.tsx builds it. */
function liveProfile(over: Partial<RecommenderProfile> = {}): RecommenderProfile {
  return {
    user_id: 'u1',
    province_id: 'ขอนแก่น',
    income_bracket: 1,
    gpa: 3.0,
    grade_level: 'M4-M6',
    fields_of_interest: [],
    welfare_card: true,
    region: null, area_type: null,
    household_income_band: null, intended_level: null, intended_field: null,
    ...over,
  };
}

describe('classifyProtectedGroup on the LIVE call path (region is null)', () => {
  it('classifies a low-income Isan student as disadvantaged', () => {
    expect(classifyProtectedGroup(liveProfile())).toBe('disadvantaged');
  });

  it('requires BOTH region and low income', () => {
    expect(classifyProtectedGroup(liveProfile({ income_bracket: 4 }))).toBe('advantaged');
    expect(classifyProtectedGroup(liveProfile({ province_id: 'กรุงเทพมหานคร' }))).toBe('advantaged');
    expect(classifyProtectedGroup(liveProfile({ province_id: 'เชียงใหม่' }))).toBe('advantaged');
  });

  it('covers every Isan province at bracket 3, the boundary', () => {
    for (const p of ['ขอนแก่น', 'อุบลราชธานี', 'เลย', 'บึงกาฬ', 'สุรินทร์']) {
      expect(classifyProtectedGroup(liveProfile({ province_id: p, income_bracket: 3 })), p)
        .toBe('disadvantaged');
    }
  });

  it('does not classify an unknown province as disadvantaged', () => {
    expect(classifyProtectedGroup(liveProfile({ province_id: 'Atlantis' }))).toBe('advantaged');
    expect(classifyProtectedGroup(liveProfile({ province_id: '' }))).toBe('advantaged');
  });
});

describe('an explicitly supplied region still wins', () => {
  it('honours region when the caller provides it', () => {
    // /api/recommend passes a real region string; that path must not change.
    expect(classifyProtectedGroup(liveProfile({ region: 'northeast', province_id: 'เชียงใหม่' })))
      .toBe('disadvantaged');
    expect(classifyProtectedGroup(liveProfile({ region: 'south', province_id: 'เชียงใหม่' })))
      .toBe('disadvantaged');
  });

  it('an explicit non-disadvantaged region is not overridden by the province', () => {
    expect(classifyProtectedGroup(liveProfile({ region: 'central', province_id: 'ขอนแก่น' })))
      .toBe('advantaged');
  });
});

/** Minimal scholarship rows — only the fields the bias prior reads. */
function sch(id: string, over: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id: id,
    region_eligibility: 'ทั่วประเทศ',   // national -> bias 0.65 -> boosted
    targets_low_income: false,
    ...over,
  } as unknown as TdScholarship;
}

describe('the correction actually reaches the ranking', () => {
  const prescored = [
    { scholarship: sch('national-1'), raw_score: 0.50, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
    { scholarship: sch('lowincome-1', { targets_low_income: true }), raw_score: 0.53, reasons: [], reasons_en: [], explanation: '', explanation_en: '' },
  ];

  it('boosts a national scholarship for a disadvantaged student when mode is on', () => {
    const on  = rerank(prescored, liveProfile(), 'on', 10);
    const off = rerank(prescored, liveProfile(), 'off', 10);

    const onNational  = on.find(i => i.scholarship.scholarship_id === 'national-1')!;
    const offNational = off.find(i => i.scholarship.scholarship_id === 'national-1')!;

    expect(onNational.fairness_score).toBeGreaterThan(offNational.fairness_score);
    expect(onNational.fairness_boosted).toBe(true);
  });

  it('leaves an advantaged student untouched even with mode on', () => {
    const p = liveProfile({ province_id: 'กรุงเทพมหานคร' });
    const on  = rerank(prescored, p, 'on', 10);
    const off = rerank(prescored, p, 'off', 10);
    expect(on.map(i => i.scholarship.scholarship_id))
      .toEqual(off.map(i => i.scholarship.scholarship_id));
  });

  it('can reorder the list — the mechanism the study measures', () => {
    // 0.50 boosted by 1.09 = 0.545, overtaking the un-boosted 0.53.
    const on = rerank(prescored, liveProfile(), 'on', 10);
    expect(on[0].scholarship.scholarship_id).toBe('national-1');

    const off = rerank(prescored, liveProfile(), 'off', 10);
    expect(off[0].scholarship.scholarship_id).toBe('lowincome-1');
  });
});
