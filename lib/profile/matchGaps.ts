/**
 * Which of the answers the RECOMMENDER scores on are missing from a profile.
 *
 * Deliberately not computeCompleteness (lib/studentProfile.ts). That counts the
 * 17 research questions on the profile form — gender, disability, parent
 * education — and none of them changes a single match. Telling a student
 * "fill these in and TunDee will find better scholarships" about fields the
 * scorer never reads would be untrue. These are the fields it does read
 * (lib/recommender/scorer.ts, eligibility.ts), and the /scholarships page reads
 * them with silent defaults — a missing income bracket is scored as 4, a
 * missing GPA as 3.0 — so a gap here really does make the list less accurate.
 *
 * The common gap is income: /auth/callback writes grade level, province and GPA
 * for a /start visitor, and the /start preview never asks about income.
 *
 * Welfare card is not listed: it is a boolean defaulting to false, so "never
 * answered" and "no card" cannot be told apart.
 */

export type MatchGapField = 'grade_level' | 'grade_year' | 'gpa' | 'province' | 'income_bracket' | 'fields_of_interest';

/** The profile columns this reads, exactly as stored (nulls intact). */
export interface MatchGapInput {
  grade_level?: string | null;
  grade_year?: number | null;
  gpa?: number | string | null;
  province?: string | null;
  income_bracket?: number | null;
  fields_of_interest?: string[] | null;
}

/** Most valuable first: these orderings decide which gap the nudge names. */
const ORDER: MatchGapField[] = ['grade_level', 'income_bracket', 'gpa', 'province', 'grade_year', 'fields_of_interest'];

export const MATCH_GAP_LABEL: Record<MatchGapField, { th: string; en: string }> = {
  grade_level:        { th: 'ระดับชั้น',         en: 'school level' },
  grade_year:         { th: 'ชั้นปี',             en: 'year' },
  gpa:                { th: 'เกรดเฉลี่ย',         en: 'GPA' },
  province:           { th: 'จังหวัด',            en: 'province' },
  income_bracket:     { th: 'รายได้ครอบครัว',     en: 'family income' },
  fields_of_interest: { th: 'สาขาที่สนใจ',        en: 'fields of interest' },
};

/** School levels whose year (ม.1–3 / ม.4–6) the matcher uses. */
function needsYear(level: string): boolean {
  return level === 'M1-M3' || level === 'M4-M6';
}

export interface MatchGaps {
  missing: MatchGapField[];
  /** Share of the applicable matching answers that are present, 0–100. */
  percent: number;
}

export function matchProfileGaps(p: MatchGapInput): MatchGaps {
  const level = (p.grade_level ?? '').trim();
  const applicable = ORDER.filter(f => f !== 'grade_year' || needsYear(level));

  const has: Record<MatchGapField, boolean> = {
    grade_level:        level !== '',
    grade_year:         typeof p.grade_year === 'number',
    gpa:                p.gpa !== null && p.gpa !== undefined && String(p.gpa).trim() !== '',
    province:           (p.province ?? '').trim() !== '',
    income_bracket:     typeof p.income_bracket === 'number',
    // ['any'] is what /api/profile/save writes when nothing was chosen.
    fields_of_interest: (p.fields_of_interest ?? []).some(f => f && f !== 'any'),
  };

  const missing = applicable.filter(f => !has[f]);
  const percent = Math.round(((applicable.length - missing.length) / applicable.length) * 100);
  return { missing, percent };
}
