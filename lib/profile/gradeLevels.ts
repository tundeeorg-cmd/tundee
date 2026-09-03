/**
 * The canonical grade-level vocabulary. One list, imported by every side.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * On 31 Aug 2026 every secondary-school and vocational student who completed the
 * nine-step wizard lost all nine steps at 100%:
 *
 *   [23514] new row for relation "profiles" violates check constraint
 *   "profiles_grade_level_check"
 *
 * There were three grade vocabularies and nothing forced them to agree:
 *
 *   A. the database CHECK + /profile   'M4' 'M5' 'M6' 'uni' 'graduate'
 *   B. the wizard + /start preview     'M1-M3' 'M4-M6' 'vocational' 'uni' 'graduate'
 *   C. the recommender's normalizer    understood both
 *
 * Only 'uni' and 'graduate' were legal in both A and B, which is exactly — and
 * only — what production contained: 16 uni, 5 graduate, 1 M6, and not one
 * high-school or vocational student on a product built for Thai high-school
 * students.
 *
 * B won. The recommender already normalizes all of B correctly, the /start
 * preview cookie already carries B, and narrowing to A would have meant deleting
 * the ม.1–3 and ปวช./ปวส. options — telling a third of the audience the product
 * is not for them. The database was the only artifact still on A.
 *
 * THE RULE: nothing anywhere may hard-code a grade-level string. Import from
 * here. The database CHECK is generated from this list by
 * scripts/20260831_v19_grade_level_domain.sql and asserted against it by
 * __tests__/profileSetup.e2e.test.ts, so the two cannot drift again.
 */

export interface GradeLevelOption {
  /** The value stored in profiles.grade_level. Never shown to a user. */
  value: string;
  th: string;
  en: string;
}

/**
 * The five options, in the order they are offered.
 *
 * Order matters: it is the order of the wizard's radio list and of the /start
 * preview's, and those two must present the same choices in the same sequence
 * or a visitor's preview answer lands on a different row after signup.
 */
export const GRADE_LEVELS: readonly GradeLevelOption[] = [
  { value: 'M1-M3',      th: 'ม.1–3',         en: 'Grade 7–9' },
  { value: 'M4-M6',      th: 'ม.4–6',         en: 'Grade 10–12' },
  { value: 'vocational', th: 'ปวช./ปวส.',     en: 'Vocational' },
  { value: 'uni',        th: 'ปริญญาตรี',      en: 'Undergraduate' },
  { value: 'graduate',   th: 'บัณฑิตศึกษา',   en: 'Graduate' },
] as const;

/** The stored values, and the exact domain of the database CHECK constraint. */
export const GRADE_LEVEL_VALUES: readonly string[] = GRADE_LEVELS.map(g => g.value);

/**
 * Single-year secondary values from vocabulary A, retired on 31 Aug 2026.
 *
 * The v19 migration rewrites the rows that hold them ('M4'/'M5'/'M6' → 'M4-M6')
 * and the constraint does NOT admit them, so this list is not a second legal
 * vocabulary — it exists so the migration and its test name the same set, and so
 * a stored value from a browser tab left open across the deploy can be recognised
 * and upgraded rather than silently failing validation.
 */
export const RETIRED_GRADE_LEVELS: Readonly<Record<string, string>> = {
  M4: 'M4-M6',
  M5: 'M4-M6',
  M6: 'M4-M6',
} as const;

/** True when `value` may be written to profiles.grade_level as-is. */
export function isValidGradeLevel(value: unknown): value is string {
  return typeof value === 'string' && GRADE_LEVEL_VALUES.includes(value);
}

/**
 * Maps any value the app has ever stored onto the canonical set.
 *
 * Returns null for blank/unknown input rather than guessing. A guess here would
 * put a grade on a student's record that they never claimed — which is what
 * /profile did for two months by defaulting an unreadable value to 'M6'.
 */
export function canonicalizeGradeLevel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  if (isValidGradeLevel(v)) return v;
  return RETIRED_GRADE_LEVELS[v] ?? null;
}

/** The bilingual label for a stored value, for display only. */
export function gradeLevelLabel(value: string, lang: 'th' | 'en'): string {
  const canonical = canonicalizeGradeLevel(value);
  const opt = GRADE_LEVELS.find(g => g.value === canonical);
  return opt ? opt[lang] : value;
}

// ─── Year within the range ────────────────────────────────────────────────────

/**
 * Which years a grade level contains, when it contains distinguishable years.
 *
 * Only the two secondary ranges do. 'vocational' spans ปวช.1–3 and ปวส.1–2 —
 * two different qualifications whose year numbers do not line up, so a single
 * 1–6 field would mean different things for different students. 'uni' and
 * 'graduate' have years too, but nothing in the matcher would use them: no
 * scholarship in the catalogue recruits specifically from second-year
 * undergraduates.
 *
 * Asking a question whose answer changes nothing is a step in a wizard that
 * already loses people, so it is not asked.
 */
export const GRADE_YEARS: Readonly<Record<string, readonly number[]>> = {
  'M1-M3': [1, 2, 3],
  'M4-M6': [4, 5, 6],
} as const;

/** True when this grade level has a year worth asking about. */
export function hasGradeYear(gradeLevel: string | null | undefined): boolean {
  return !!gradeLevel && gradeLevel in GRADE_YEARS;
}

/** The years to offer for a level, or an empty list when there is nothing to ask. */
export function gradeYearsFor(gradeLevel: string | null | undefined): readonly number[] {
  return (gradeLevel && GRADE_YEARS[gradeLevel]) || [];
}

/** Display label for a year, e.g. 6 → 'ม.6' / 'Grade 12'. */
export function gradeYearLabel(year: number, lang: 'th' | 'en'): string {
  return lang === 'th' ? `ม.${year}` : `Grade ${year + 6}`;
}

/**
 * The year to store, given a level and a proposed year.
 *
 * Returns null whenever the pairing does not hold — a year outside the level's
 * range, or a level that has no years at all. That is the whole coherence rule,
 * and it lives here rather than in a database CHECK on purpose.
 *
 * scripts/20260903_v21_grade_year.sql explains the reasoning: a cross-column
 * constraint would REFUSE the write when a student changes ม.6 → ม.2 and a
 * stale year comes along for the ride. profiles_grade_level_check refused every
 * school student for weeks on that exact shape of mistake, and 16 rows still
 * carry a NULL grade_level because of it. Correcting a mismatch costs the
 * student nothing; rejecting it costs them their answers.
 */
export function coherentGradeYear(
  gradeLevel: string | null | undefined,
  year: unknown,
): number | null {
  const allowed = gradeYearsFor(gradeLevel);
  if (allowed.length === 0) return null;
  const n = typeof year === 'number' ? year : Number(year);
  if (!Number.isInteger(n)) return null;
  return allowed.includes(n) ? n : null;
}

/** True when the student is in their final school year — the ม.6 case the
 *  undergraduate scholarship intake actually recruits from. */
export function isFinalSchoolYear(
  gradeLevel: string | null | undefined,
  year: number | null | undefined,
): boolean {
  return gradeLevel === 'M4-M6' && year === 6;
}
