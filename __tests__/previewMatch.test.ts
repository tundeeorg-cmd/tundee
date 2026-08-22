/**
 * Logged-out preview matching for /start.
 *
 * Covers the input contract (validation + the cookie that carries a visitor's
 * answers through signup) and the matching behaviour an anonymous visitor gets
 * from the shared lib/recommender pipeline — including the guarantee that
 * expired, hidden and closed scholarships never reach a preview card.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePreviewInput,
  encodePreviewInput,
  decodePreviewInput,
  PREVIEW_LEVELS,
  PREVIEW_TOP_N,
} from '@/lib/preview/types';
import { recommend } from '@/lib/recommender/recommend';
import type { RecommenderProfile } from '@/lib/recommender/types';
import type { TdScholarship } from '@/lib/tdScholarships/types';

const FIXED_NOW = new Date('2026-07-19T00:00:00Z');

function makeScholarship(overrides: Partial<TdScholarship> = {}): TdScholarship {
  return {
    scholarship_id:     'SCH-PREVIEW-001',
    scholarship_name:   'Test Scholarship',
    scholarship_name_th: 'ทุนทดสอบ',
    scholarship_name_en: 'Test Scholarship',
    funder:             'Test Foundation',
    status:             'Open',
    is_displayed:       true,
    level:              'High school',
    field_of_study:     null,
    region_eligibility: 'National',
    min_gpa:            null,
    income_cap_thb:     null,
    deadline_date:      '2027-12-31',
    targets_low_income: false,
    created_at:         '2026-01-01T00:00:00Z',
    updated_at:         '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as TdScholarship;
}

/** Mirrors the anonymous profile app/api/preview-match/route.ts builds. */
function previewProfile(overrides: Partial<RecommenderProfile> = {}): RecommenderProfile {
  return {
    user_id:               'anonymous-preview',
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

function match(scholarships: TdScholarship[], profile = previewProfile()) {
  return recommend(
    scholarships,
    profile,
    { fairness_mode: 'off', variant: 'anonymous', limit: 50 },
    FIXED_NOW,
  );
}

// ─── Input contract ───────────────────────────────────────────────────────────

describe('parsePreviewInput', () => {
  const valid = { level: 'M4-M6', gpa: 3.25, province: 'ขอนแก่น' };

  it('accepts every level offered on /start', () => {
    for (const level of PREVIEW_LEVELS) {
      expect(parsePreviewInput({ ...valid, level: level.value })).not.toBeNull();
    }
  });

  it('accepts a GPA sent as a string', () => {
    expect(parsePreviewInput({ ...valid, gpa: '3.5' })?.gpa).toBe(3.5);
  });

  it('rejects an unknown level', () => {
    expect(parsePreviewInput({ ...valid, level: 'M7' })).toBeNull();
  });

  it('rejects an out-of-range or non-numeric GPA', () => {
    expect(parsePreviewInput({ ...valid, gpa: 4.5 })).toBeNull();
    expect(parsePreviewInput({ ...valid, gpa: -1 })).toBeNull();
    expect(parsePreviewInput({ ...valid, gpa: 'abc' })).toBeNull();
  });

  it('rejects a province that is not one of the 77', () => {
    expect(parsePreviewInput({ ...valid, province: 'Atlantis' })).toBeNull();
  });

  it('rejects junk bodies', () => {
    expect(parsePreviewInput(null)).toBeNull();
    expect(parsePreviewInput('nope')).toBeNull();
    expect(parsePreviewInput({})).toBeNull();
  });
});

describe('preview cookie', () => {
  it('round-trips the visitor answers', () => {
    const input = { level: 'uni', gpa: 2.75, province: 'เชียงใหม่' };
    expect(decodePreviewInput(encodePreviewInput(input))).toEqual(input);
  });

  it('returns null for missing or tampered values', () => {
    expect(decodePreviewInput(null)).toBeNull();
    expect(decodePreviewInput('')).toBeNull();
    expect(decodePreviewInput('not-base64!!')).toBeNull();
    // Well-formed encoding, invalid contents — must not survive validation
    expect(decodePreviewInput(encodePreviewInput({ level: 'M9', gpa: 9, province: 'X' }))).toBeNull();
  });
});

// ─── Anonymous matching ───────────────────────────────────────────────────────

describe('logged-out matching', () => {
  it('matches a ม.4–6 student to high-school scholarships', () => {
    // Regression: 'M4-M6' used to fail the level check and return nothing.
    const result = match([makeScholarship()]);
    expect(result.items).toHaveLength(1);
  });

  it('produces a Thai why-you-match sentence for every card', () => {
    const result = match([makeScholarship({ min_gpa: 3.0 })]);
    expect(result.items[0].explanation).toContain('ทุนนี้เหมาะกับคุณเพราะ');
  });

  it('never surfaces hidden, closed or expired scholarships', () => {
    const result = match([
      makeScholarship({ scholarship_id: 'HIDDEN',  is_displayed: false }),
      makeScholarship({ scholarship_id: 'CLOSED',  status: 'Closed' }),
      makeScholarship({ scholarship_id: 'EXPIRED', deadline_date: '2026-01-01' }),
      makeScholarship({ scholarship_id: 'GOOD' }),
    ]);
    expect(result.items.map(i => i.scholarship.scholarship_id)).toEqual(['GOOD']);
  });

  it('excludes scholarships whose GPA minimum the student misses', () => {
    const result = match([makeScholarship({ min_gpa: 3.8 })], previewProfile({ gpa: 3.0 }));
    expect(result.items).toHaveLength(0);
  });

  it('does not filter on fields of study the visitor never gave us', () => {
    const result = match([makeScholarship({ field_of_study: 'Engineering' })]);
    expect(result.items).toHaveLength(1);
  });

  it('splits into previewed and locked cards', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeScholarship({ scholarship_id: `SCH-${i}` }),
    );
    const items = match(many).items;
    const preview = items.slice(0, PREVIEW_TOP_N);

    expect(preview).toHaveLength(3);
    expect(items.length - preview.length).toBe(12);
  });

  it('finds broader options when relaxing GPA, for the empty state', () => {
    const tough = [makeScholarship({ min_gpa: 3.9 })];
    const profile = previewProfile({ gpa: 2.0 });

    expect(match(tough, profile).items).toHaveLength(0);
    expect(match(tough, { ...profile, gpa: 4.0 }).items).toHaveLength(1);
  });
});
