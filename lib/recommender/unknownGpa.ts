/**
 * The rule for a student whose GPA we do not know.
 *
 * A scholarship carrying a min_gpa cannot honestly be shown as a match when the
 * GPA is missing — we do not know whether the student clears the bar. So it is
 * withheld rather than optimistically included: what we show is a floor, never
 * an overclaim, and filling the GPA in can only ever reveal MORE scholarships,
 * never take one away. That is also the honest incentive to fill it in.
 *
 * Note this points the opposite way to the income-cap rule in eligibility.ts,
 * and deliberately. A student can read an income ceiling and judge it for
 * themselves, so hiding those hides need-based aid from the people it is for.
 * A min_gpa is not a judgement call — either the grade clears it or it does
 * not — so showing one on an unknown grade is simply a claim we cannot make.
 *
 * Extracted from app/api/preview-match, which has applied this to anonymous
 * visitors since the preview shipped. The signed-in recommender did not, and
 * instead substituted a GPA of 3.0: of the 34 displayed scholarships carrying a
 * minimum, that wrongly admitted 31 and wrongly withheld 3.
 *
 * Callers pass a top grade (4.0) into the recommender alongside this filter, so
 * the engine's `profile.gpa < min_gpa` test never fires on a value nobody
 * declared. Keeping both halves together is what makes the rule legible: the
 * sentinel is meaningless without the filter.
 */

import type { TdScholarship } from '@/lib/tdScholarships/types';

/** GPA to pass into the recommender when none was declared. See above. */
export const UNKNOWN_GPA_SENTINEL = 4;

export function filterForUnknownGpa(
  rows: TdScholarship[],
  gpa: number | null,
): TdScholarship[] {
  if (gpa !== null) return rows;
  return rows.filter(r => !r.min_gpa || Number(r.min_gpa) <= 0);
}
