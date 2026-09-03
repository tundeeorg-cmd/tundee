/**
 * Grade-level normalization shared by the eligibility filter and the public
 * /start preview matcher.
 *
 * Why this exists: /profile/setup stores compound values ('M1-M3', 'M4-M6',
 * 'vocational'), while the eligibility filter used to compare against single-year
 * tokens ('M4', 'M5', 'M6') only. Every "High school" scholarship was therefore
 * dropped with reason `level_mismatch` for real signed-up students. Both sides now
 * go through the buckets below, so the stored value and the matcher can never
 * drift apart again.
 */

export type LevelBucket = 'high_school' | 'vocational' | 'undergraduate' | 'graduate';

/** Scholarship-side level, plus 'multiple' meaning "no level restriction". */
export type ScholarshipLevelBucket = LevelBucket | 'multiple';

const STUDENT_LEVEL_PATTERNS: Array<[RegExp, LevelBucket]> = [
  // Vocational first — 'ปวช.' / 'ปวส.' would otherwise fall through to high school
  [/^(vocational|voc|ปวช|ปวส)/i, 'vocational'],

  // High school: M1–M6 in every spelling the app has ever stored
  [/^m[1-6](\s*[-–]\s*m?[1-6])?$/i, 'high_school'],
  [/^(high[\s_-]?school|secondary|highschool)$/i, 'high_school'],
  [/^(มัธยม|ม\.[1-6])/, 'high_school'],

  // Undergraduate
  [/^(uni|university|bachelor|undergraduate|undergrad)/i, 'undergraduate'],
  [/^(ปริญญาตรี|ป\.ตรี)/, 'undergraduate'],

  // Graduate
  [/^(graduate|grad|master|phd|doctoral|doctorate)/i, 'graduate'],
  [/^(บัณฑิตศึกษา|ปริญญาโท|ป\.โท|ปริญญาเอก|ป\.เอก)/, 'graduate'],
];

/**
 * Maps a stored student grade level to a canonical bucket.
 * Returns null when the value is blank or unrecognized — callers decide what an
 * unknown level means (the eligibility filter keeps its historical strictness).
 */
export function normalizeGradeLevel(raw: string | null | undefined): LevelBucket | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;

  const normalized = v.replace(/'/g, '').replace(/\s+/g, ' ');
  for (const [pattern, bucket] of STUDENT_LEVEL_PATTERNS) {
    if (pattern.test(normalized)) return bucket;
  }
  return null;
}

/**
 * Maps a scholarship's `level` column (TdLevel) to a bucket.
 * Returns 'multiple' for the unrestricted values, null when unrecognized.
 */
export function normalizeScholarshipLevel(raw: string | null | undefined): ScholarshipLevelBucket | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'multiple' || v === 'all' || v === 'any') return 'multiple';

  if (v.includes('vocational')) return 'vocational';
  if (v.includes('high') || v === 'secondary') return 'high_school';
  if (v.includes('under') || v.includes('bachelor')) return 'undergraduate';
  if (v.includes('master') || v.includes('phd') || v.includes('doctoral')) return 'graduate';

  return null;
}

/**
 * Which student buckets may apply to a scholarship of the given level.
 *
 * High-school and vocational students are treated as interchangeable for both
 * high-school and undergraduate scholarships — ปวช./ปวส. students are the same
 * age cohort as ม.ปลาย and apply to the same undergraduate intake. Graduate
 * scholarships stay restricted to graduate students, as before.
 */
const ELIGIBLE_STUDENT_BUCKETS: Record<LevelBucket, LevelBucket[]> = {
  high_school:   ['high_school', 'vocational'],
  vocational:    ['high_school', 'vocational'],
  undergraduate: ['high_school', 'vocational', 'undergraduate'],
  graduate:      ['graduate'],
};

/**
 * True when a student at any of `studentBuckets` may apply to a scholarship at
 * `scholarshipLevel`. An unrestricted or unrecognized scholarship level never
 * disqualifies anyone.
 */
export function levelsAreCompatible(
  scholarshipLevel: ScholarshipLevelBucket | null,
  studentBuckets: Array<LevelBucket | null>,
): boolean {
  if (!scholarshipLevel || scholarshipLevel === 'multiple') return true;

  const known = studentBuckets.filter((b): b is LevelBucket => b !== null);

  /*
   * A student whose level we do not know is not disqualified.
   *
   * `some(b => b !== null && ...)` returned false when every bucket was null,
   * so an unanswered level read as "eligible for nothing that names a level".
   * For 16 of 42 real profiles that meant 185 scholarships instead of 302, with
   * every undergraduate one — the highest-value group, and the reason most of
   * them signed up — silently absent. Those 16 are the students whose grade
   * level was rejected by profiles_grade_level_check before 3 Sep, so the
   * database dropped their answer and the matcher then punished them for the
   * gap it had created.
   *
   * This also makes the rule agree with the income cap two checks earlier in
   * eligibility.ts, which already says it plainly:
   *
   *   "Not knowing is not the same as knowing they earn too much."
   *
   * The same is true of a grade level, and it was the one hard filter still
   * treating silence as a disqualifying answer.
   *
   * Precision is unchanged wherever we DO know: a known level that does not
   * match still fails, so this widens nothing for the students who answered.
   */
  if (known.length === 0) return true;

  const allowed = ELIGIBLE_STUDENT_BUCKETS[scholarshipLevel];
  return known.some(b => allowed.includes(b));
}
