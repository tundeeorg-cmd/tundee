/**
 * Is the anonymous arm of the study collecting complete records? Pure.
 *
 * Read by /api/health/research. Counts only, never split by arm (PART 2 step 8,
 * no peeking): how many visitors were randomized on /start in the window, how many
 * of those rows carry their covariates, how many were shown at least one ranked
 * card, and how many apply-clicks were bound to an anonymous participant.
 */

import { hasAnonCovariates } from './anonCovariates';

export const ANON_HEALTH_WINDOW_HOURS = 24;

/** Below this many assignments in the window, a low share is noise, not an alert. */
export const MIN_N_FOR_ANON_ALERT = 10;
/** A randomized visitor is shown results at once; fewer than this share means impressions are being lost. */
export const MIN_IMPRESSION_SHARE = 0.9;

export interface AnonAssignmentHealthRow {
  anon_id: string;
  level?: unknown;
  region_group?: unknown;
  income_bracket?: unknown;
  recruitment_source?: unknown;
}

export interface AnonHealth {
  window_hours: number;
  assignments: number;
  /** Share (0–1) of those assignments with level, region, income and source recorded. null when none. */
  with_covariates_share: number | null;
  /** Share (0–1) of those (all consented) assignments with >= 1 impression. null when none. */
  with_impression_share: number | null;
  /** apply_click rows with an anon_id in the window. Total only, never by arm. */
  apply_clicks: number;
  alerts: string[];
}

const share = (n: number, d: number): number | null => (d ? Number((n / d).toFixed(3)) : null);

export function summarizeAnonHealth(input: {
  assignments: AnonAssignmentHealthRow[];
  anonIdsWithImpression: Iterable<string>;
  anonApplyClicks: number;
}): AnonHealth {
  const seen = new Set(input.anonIdsWithImpression);
  const n = input.assignments.length;
  const withCov = input.assignments.filter((a) => hasAnonCovariates(a)).length;
  const withImp = input.assignments.filter((a) => seen.has(a.anon_id)).length;

  const alerts: string[] = [];
  // Every row written since v38 must carry its covariates; one without is a bug, at any n.
  if (n > 0 && withCov < n) alerts.push('anon_covariates_missing');
  const impShare = share(withImp, n);
  if (n >= MIN_N_FOR_ANON_ALERT && impShare !== null && impShare < MIN_IMPRESSION_SHARE) alerts.push('anon_impressions_missing');

  return {
    window_hours: ANON_HEALTH_WINDOW_HOURS,
    assignments: n,
    with_covariates_share: share(withCov, n),
    with_impression_share: impShare,
    apply_clicks: input.anonApplyClicks,
    alerts,
  };
}
