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
