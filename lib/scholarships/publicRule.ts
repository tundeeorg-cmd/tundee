/**
 * The one rule for which scholarships the public sees. No server imports, so the
 * browser half (Browse page fallback fetch, Admin cards) can use it too.
 *
 *   A scholarship is public iff status_effective ∈ {Opening Soon, Open, Closing Soon}.
 *
 * Verification Status does not gate visibility. This is the same predicate as
 * isDisplayable() in lib/tdScholarships/displayGate.ts, which writes is_displayed, and
 * as get_public_scholarship_stats() in scripts/20261128_public_scholarship_stats.sql.
 * __tests__/publicScholarshipStats.test.ts fails if the three lists drift apart.
 */

export const PUBLIC_STATUSES = ['Opening Soon', 'Open', 'Closing Soon'] as const;

export function isPubliclyDisplayed(statusEffective: string | null | undefined): boolean {
  return (PUBLIC_STATUSES as readonly string[]).includes(statusEffective ?? '');
}

/**
 * The count shown when the live figure is unavailable. A floor the catalogue has
 * cleared since mid-2026, so it is never an overstatement; never 0, which would read
 * as "no scholarships".
 */
export const SCHOLARSHIP_COUNT_FLOOR = 200;

/** "404" / "กว่า 200" / "200+": the number to put in copy, live when possible. */
export function scholarshipCountLabel(count: number | null | undefined, lang: 'th' | 'en'): string {
  if (typeof count === 'number' && count > 0) return count.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');
  return lang === 'th' ? `กว่า ${SCHOLARSHIP_COUNT_FLOOR}` : `${SCHOLARSHIP_COUNT_FLOOR}+`;
}
