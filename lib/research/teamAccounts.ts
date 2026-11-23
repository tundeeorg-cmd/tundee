/**
 * Accounts the TunDee team uses on production. Their activity is testing, not
 * participation, so research outputs leave them out and count them by reason —
 * the account-level counterpart of TEST_ANON_IDS (lib/research/anonExport.ts).
 *
 * The rows stay in the database. Anyone querying profiles, funnel_events,
 * apply_click, anon_impressions or randomization_conflicts directly must drop these
 * ids too; research/ANALYSIS-DATA-DICTIONARY.md lists them.
 */
export const TEAM_ACCOUNT_IDS: ReadonlySet<string> = new Set([
  // Team account (email sign-up 2026-08-30, LINE linked). Randomized to
  // fairness_adjusted on 2026-09-02; used for the 2026-11-23 LINE merge test, which
  // claimed anon 203a2f6d and recorded randomization_conflicts 72b2453f.
  'efe69840-0552-4456-a643-726e4f0027ad',
]);

export function isTeamAccount(userId: string | null | undefined): boolean {
  return !!userId && TEAM_ACCOUNT_IDS.has(userId);
}

/** PostgREST `in` list for `.not('user_id', 'in', …)`. */
export function teamAccountInList(): string {
  return `(${Array.from(TEAM_ACCOUNT_IDS).join(',')})`;
}
