/**
 * Grade-level normalization — the shared bridge between the values
 * /profile/setup stores and what the eligibility filter compares against.
 *
 * Regression guard for the bug this replaced: 'M4-M6' (what the wizard actually
 * writes) matched none of the old single-year tokens, so every "High school"
 * scholarship was dropped with reason 'level_mismatch'.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeGradeLevel,
  normalizeScholarshipLevel,
  levelsAreCompatible,
} from '@/lib/recommender/gradeLevel';

describe('normalizeGradeLevel', () => {
  it('maps the values /profile/setup stores', () => {
    expect(normalizeGradeLevel('M1-M3')).toBe('high_school');
    expect(normalizeGradeLevel('M4-M6')).toBe('high_school');
    expect(normalizeGradeLevel('vocational')).toBe('vocational');
    expect(normalizeGradeLevel('uni')).toBe('undergraduate');
    expect(normalizeGradeLevel('graduate')).toBe('graduate');
  });

  it('still maps the legacy single-year tokens', () => {
    for (const v of ['M4', 'M5', 'M6', 'm4', 'm6']) {
      expect(normalizeGradeLevel(v)).toBe('high_school');
    }
  });

  it('maps Thai labels and long-form English', () => {
    expect(normalizeGradeLevel('มัธยม')).toBe('high_school');
    expect(normalizeGradeLevel('ปวช')).toBe('vocational');
    expect(normalizeGradeLevel('ปริญญาตรี')).toBe('undergraduate');
    expect(normalizeGradeLevel('bachelor')).toBe('undergraduate');
    expect(normalizeGradeLevel("master's")).toBe('graduate');
    expect(normalizeGradeLevel('PhD')).toBe('graduate');
  });

  it('returns null for blank or unrecognized values', () => {
    expect(normalizeGradeLevel('')).toBeNull();
    expect(normalizeGradeLevel(null)).toBeNull();
    expect(normalizeGradeLevel(undefined)).toBeNull();
    expect(normalizeGradeLevel('banana')).toBeNull();
  });
});

describe('normalizeScholarshipLevel', () => {
  it('maps every TdLevel value', () => {
    expect(normalizeScholarshipLevel('High school')).toBe('high_school');
    expect(normalizeScholarshipLevel('Undergraduate')).toBe('undergraduate');
    expect(normalizeScholarshipLevel("Master's")).toBe('graduate');
    expect(normalizeScholarshipLevel('PhD')).toBe('graduate');
    expect(normalizeScholarshipLevel('Multiple')).toBe('multiple');
  });

  it('treats blank as unrestricted-by-absence', () => {
    expect(normalizeScholarshipLevel('')).toBeNull();
    expect(normalizeScholarshipLevel(null)).toBeNull();
  });
});

describe('levelsAreCompatible', () => {
  it('never disqualifies on an unrestricted scholarship level', () => {
    expect(levelsAreCompatible('multiple', [null])).toBe(true);
    expect(levelsAreCompatible(null, [null])).toBe(true);
  });

  it('lets ม.ปลาย and ปวช. students reach high-school scholarships', () => {
    expect(levelsAreCompatible('high_school', ['high_school'])).toBe(true);
    expect(levelsAreCompatible('high_school', ['vocational'])).toBe(true);
    expect(levelsAreCompatible('high_school', ['undergraduate'])).toBe(false);
  });

  it('lets school-age students apply to undergraduate scholarships', () => {
    expect(levelsAreCompatible('undergraduate', ['high_school'])).toBe(true);
    expect(levelsAreCompatible('undergraduate', ['vocational'])).toBe(true);
    expect(levelsAreCompatible('undergraduate', ['undergraduate'])).toBe(true);
    expect(levelsAreCompatible('undergraduate', ['graduate'])).toBe(false);
  });

  it('keeps graduate scholarships restricted to graduate students', () => {
    expect(levelsAreCompatible('graduate', ['graduate'])).toBe(true);
    expect(levelsAreCompatible('graduate', ['undergraduate'])).toBe(false);
    expect(levelsAreCompatible('graduate', ['high_school'])).toBe(false);
  });

  it('accepts a match on either grade_level or intended_level', () => {
    expect(levelsAreCompatible('graduate', [null, 'graduate'])).toBe(true);
    expect(levelsAreCompatible('graduate', ['undergraduate', 'graduate'])).toBe(true);
  });

  it('disqualifies when no bucket is recognized', () => {
    expect(levelsAreCompatible('high_school', [null, null])).toBe(false);
  });
});
