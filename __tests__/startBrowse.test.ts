/**
 * /start shows real scholarships before it asks anything (PART 3 step 1).
 *
 * The default list is the same for every visitor — open scholarships, soonest
 * deadline first — and is never personalized, because a visitor who has not been
 * randomized must not receive a treatment. Nothing is blurred, covered or gated.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import {
  CLOSING_SOON_DAYS, NO_FILTERS, applyFilters, bangkokToday, daysUntil, hasActiveFilters, isActionable, sortByDeadline,
} from '@/lib/scholarships/startFilter';

const TODAY = '2026-10-26';
const s = (over: Partial<TdScholarship>): TdScholarship => ({
  scholarship_id: 'x', scholarship_name_th: 'ทุน', scholarship_name_en: 'Grant', scholarship_name: 'Grant',
  funder_th: 'มูลนิธิ', funder_en: 'Foundation', funder: 'Foundation',
  level: 'Undergraduate', status_effective: 'Open', deadline_date: '2026-12-01',
  targets_low_income: false, ...over,
} as unknown as TdScholarship);

describe('ordering', () => {
  it('soonest deadline first, undated after every dated one, past deadlines never first', () => {
    const items = [
      s({ scholarship_id: 'rolling', deadline_date: null }),
      s({ scholarship_id: 'dec',     deadline_date: '2026-12-01' }),
      s({ scholarship_id: 'nov',     deadline_date: '2026-11-03' }),
    ];
    expect(sortByDeadline(items, TODAY).map((i) => i.scholarship_id)).toEqual(['nov', 'dec', 'rolling']);
  });

  it('is deterministic: the same input in any order gives the same list', () => {
    const items = [s({ scholarship_id: 'a', scholarship_name_th: 'ก', deadline_date: '2026-11-01' }),
                   s({ scholarship_id: 'b', scholarship_name_th: 'ข', deadline_date: '2026-11-01' })];
    expect(sortByDeadline(items, TODAY).map((i) => i.scholarship_id))
      .toEqual(sortByDeadline([...items].reverse(), TODAY).map((i) => i.scholarship_id));
  });

  it('computes days in Bangkok time, not the server\'s', () => {
    expect(daysUntil('2026-10-27', TODAY)).toBe(1);
    expect(daysUntil('2026-10-26', TODAY)).toBe(0);
    expect(daysUntil(null, TODAY)).toBeNull();
    // 17:30 UTC on the 25th is already the 26th in Bangkok.
    expect(bangkokToday(new Date('2026-10-25T17:30:00Z'))).toBe('2026-10-26');
  });
});

describe('what counts as actionable', () => {
  it('open or closing soon, and not past its deadline', () => {
    expect(isActionable(s({}), TODAY)).toBe(true);
    expect(isActionable(s({ status_effective: 'Closing Soon', deadline_date: '2026-10-26' }), TODAY)).toBe(true);
    expect(isActionable(s({ status_effective: 'Closed' }), TODAY)).toBe(false);
    expect(isActionable(s({ status_effective: 'Opening Soon' }), TODAY)).toBe(false);
    expect(isActionable(s({ deadline_date: '2026-10-25' }), TODAY)).toBe(false);
  });
});

describe('filters', () => {
  const items = [
    s({ scholarship_id: 'hs',  level: 'High school', scholarship_name_th: 'ทุนเรียนดี', deadline_date: '2026-11-05' }),
    s({ scholarship_id: 'ug',  level: 'Undergraduate', funder_th: 'ธนาคารกรุงไทย', deadline_date: '2027-03-01' }),
    s({ scholarship_id: 'phd', level: 'PhD', targets_low_income: true, deadline_date: null }),
  ];

  it('no filters returns everything and reports none active', () => {
    expect(applyFilters(items, NO_FILTERS, TODAY)).toHaveLength(3);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('searches names and funders, in Thai, case-insensitively', () => {
    expect(applyFilters(items, { ...NO_FILTERS, query: 'เรียนดี' }, TODAY).map((i) => i.scholarship_id)).toEqual(['hs']);
    expect(applyFilters(items, { ...NO_FILTERS, query: 'กรุงไทย' }, TODAY).map((i) => i.scholarship_id)).toEqual(['ug']);
  });

  it('level chips map to the catalogue levels; postgraduate covers master and PhD', () => {
    expect(applyFilters(items, { ...NO_FILTERS, level: 'high_school' }, TODAY)).toHaveLength(1);
    expect(applyFilters(items, { ...NO_FILTERS, level: 'postgraduate' }, TODAY).map((i) => i.scholarship_id)).toEqual(['phd']);
  });

  it(`"closing soon" means a dated deadline within ${CLOSING_SOON_DAYS} days`, () => {
    expect(applyFilters(items, { ...NO_FILTERS, closingSoon: true }, TODAY).map((i) => i.scholarship_id)).toEqual(['hs']);
  });

  it('low-income keeps only scholarships that target it', () => {
    expect(applyFilters(items, { ...NO_FILTERS, lowIncome: true }, TODAY).map((i) => i.scholarship_id)).toEqual(['phd']);
  });
});

describe('the page', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('shows the list from the server, not after a client fetch', () => {
    expect(read('app/start/page.tsx')).toContain('getStartCards');
    expect(read('app/start/StartLanding.tsx')).toContain('initialCards');
  });

  it('the default list reads no profile, score, arm or recommender', () => {
    for (const f of ['components/start/StartBrowse.tsx', 'lib/scholarships/startBrowse.ts', 'lib/scholarships/startFilter.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/recommend\(|ranking_variant|fairness|experiment\/assign/);
    }
  });

  it('puts nothing in front of the list: no modal, overlay, blur or login to look', () => {
    const src = read('components/start/StartBrowse.tsx');
    expect(src).not.toMatch(/createPortal|role="dialog"|fixed inset|blur\(|\/auth/);
  });

  it('keeps the matcher as an opt-in, inside the page', () => {
    const src = read('components/start/StartBrowse.tsx');
    expect(src).toContain('PreviewMatcher');
    expect(src).toContain('matcherOpen');
  });

  it('a failed server load still renders: the matcher is offered, never a blank page', () => {
    expect(read('components/start/StartBrowse.tsx')).toContain('useState(!listOk)');
  });
});
