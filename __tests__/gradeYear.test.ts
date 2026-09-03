/**
 * grade_year: which year inside grade_level's range.
 *
 * Added because ม.4–6, ม.1–3 and ปวช./ปวส. treat every student inside the
 * range identically — measured on the live catalogue, all three currently
 * return byte-identical match sets. Nearly every Thai undergraduate
 * scholarship recruits from ม.6 specifically, so a ม.4 student and a ม.6
 * student are not the same applicant, and grade_level alone cannot tell them
 * apart.
 */

import { describe, it, expect } from 'vitest';
import {
  GRADE_YEARS,
  hasGradeYear,
  gradeYearsFor,
  gradeYearLabel,
  coherentGradeYear,
  isFinalSchoolYear,
} from '@/lib/profile/gradeLevels';

describe('which levels have a year worth asking about', () => {
  it('offers years for both secondary ranges', () => {
    expect(hasGradeYear('M1-M3')).toBe(true);
    expect(hasGradeYear('M4-M6')).toBe(true);
  });

  it('does not offer a year for vocational', () => {
    // ปวช.1–3 and ปวส.1–2 are two different qualifications whose year numbers
    // do not line up, so a single 1-6 field would mean different things for
    // different students. Asked as a level distinction instead, not a year.
    expect(hasGradeYear('vocational')).toBe(false);
  });

  it('does not offer a year where the matcher could not use one', () => {
    // No scholarship in the catalogue recruits specifically from second-year
    // undergraduates — asking would be a wizard step whose answer changes
    // nothing.
    expect(hasGradeYear('uni')).toBe(false);
    expect(hasGradeYear('graduate')).toBe(false);
  });

  it('handles blank and unknown input without throwing', () => {
    expect(hasGradeYear(null)).toBe(false);
    expect(hasGradeYear(undefined)).toBe(false);
    expect(hasGradeYear('')).toBe(false);
    expect(hasGradeYear('not-a-real-level')).toBe(false);
  });
});

describe('gradeYearsFor', () => {
  it('returns exactly the years inside each range', () => {
    expect(gradeYearsFor('M1-M3')).toEqual([1, 2, 3]);
    expect(gradeYearsFor('M4-M6')).toEqual([4, 5, 6]);
  });

  it('returns nothing to offer where there is no year to ask', () => {
    expect(gradeYearsFor('vocational')).toEqual([]);
    expect(gradeYearsFor(null)).toEqual([]);
  });
});

describe('gradeYearLabel', () => {
  it('renders the Thai label as ม.<year>', () => {
    expect(gradeYearLabel(1, 'th')).toBe('ม.1');
    expect(gradeYearLabel(6, 'th')).toBe('ม.6');
  });

  it('renders the English label as the international Grade number', () => {
    // ม.1 is internationally Grade 7 — the +6 offset is what makes this right
    // rather than off-by-six for an English-reading parent or partner org.
    expect(gradeYearLabel(1, 'en')).toBe('Grade 7');
    expect(gradeYearLabel(6, 'en')).toBe('Grade 12');
  });
});

describe('coherentGradeYear — the write-time coherence rule', () => {
  it('accepts a year that belongs to the given level', () => {
    expect(coherentGradeYear('M4-M6', 6)).toBe(6);
    expect(coherentGradeYear('M1-M3', 2)).toBe(2);
  });

  it('rejects a year outside the level range, returning null rather than clamping', () => {
    // Silent clamping would put a grade on the record the student never gave —
    // the same mistake /profile's old default-to-M6 made.
    expect(coherentGradeYear('M4-M6', 3)).toBeNull();
    expect(coherentGradeYear('M1-M3', 4)).toBeNull();
  });

  it('rejects any year for a level that has none', () => {
    expect(coherentGradeYear('vocational', 1)).toBeNull();
    expect(coherentGradeYear('uni', 2)).toBeNull();
    expect(coherentGradeYear(null, 6)).toBeNull();
  });

  it('rejects the exact stale-year shape this function exists to catch', () => {
    // A student who changes ม.6 → ม.2 sends grade_level='M1-M3' with a
    // grade_year=6 left over from before. That pairing must be correctable —
    // dropped to null — never written as-is and never allowed to fail the
    // request the way a database CHECK would have.
    expect(coherentGradeYear('M1-M3', 6)).toBeNull();
  });

  it('rejects non-numeric and non-integer input rather than coercing it', () => {
    expect(coherentGradeYear('M4-M6', 'six' as unknown)).toBeNull();
    expect(coherentGradeYear('M4-M6', 4.5)).toBeNull();
    expect(coherentGradeYear('M4-M6', null)).toBeNull();
    expect(coherentGradeYear('M4-M6', undefined)).toBeNull();
  });

  it('accepts a numeric string, since that is what a form field sends', () => {
    expect(coherentGradeYear('M4-M6', '6')).toBe(6);
  });
});

describe('isFinalSchoolYear — the ม.6 case the undergraduate intake recruits from', () => {
  it('is true only for M4-M6 at year 6', () => {
    expect(isFinalSchoolYear('M4-M6', 6)).toBe(true);
  });

  it('is false for ม.4 and ม.5', () => {
    expect(isFinalSchoolYear('M4-M6', 4)).toBe(false);
    expect(isFinalSchoolYear('M4-M6', 5)).toBe(false);
  });

  it('is false when the year is unknown', () => {
    // Silence is not evidence of ม.6 — unlike the eligibility filter, which
    // treats an unknown LEVEL as "do not disqualify", this is a positive claim
    // ("recruit this student now") that an absent answer cannot support.
    expect(isFinalSchoolYear('M4-M6', null)).toBe(false);
    expect(isFinalSchoolYear('M4-M6', undefined)).toBe(false);
  });

  it('is false for every other grade level regardless of the year value', () => {
    expect(isFinalSchoolYear('M1-M3', 6)).toBe(false);
    expect(isFinalSchoolYear('vocational', 6)).toBe(false);
    expect(isFinalSchoolYear(null, 6)).toBe(false);
  });
});

describe('GRADE_YEARS agrees with the migration', () => {
  it('is exactly the two secondary ranges, 1-3 and 4-6', () => {
    // scripts/20260903_v21_grade_year.sql constrains grade_year to 1-6 overall
    // and deliberately does NOT cross-check against grade_level in the
    // database — this module is where that coherence actually lives.
    expect(Object.keys(GRADE_YEARS).sort()).toEqual(['M1-M3', 'M4-M6']);
    expect(GRADE_YEARS['M1-M3']).toEqual([1, 2, 3]);
    expect(GRADE_YEARS['M4-M6']).toEqual([4, 5, 6]);
  });
});
