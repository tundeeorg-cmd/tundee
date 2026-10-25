/**
 * Randomization before an account exists (PART 2 step 2, PART 3 step 2).
 *
 * BEHIND A SWITCH. Everything here is inert unless ANON_RANDOMIZATION=on, which
 * must not be set until (a) scripts/20261030_v28_anon_assignments.sql has been
 * run, (b) the study team has approved the consent wording shown on /start and the
 * handling of under-18 participants, and (c) the amendment moving the
 * randomization point has been adopted (research/AMENDMENT-*.md).
 *
 * THE IDENTITY
 *   Before sign-in a visitor is an anon_id: a random UUID in a first-party,
 *   httpOnly cookie (90 days, Domain=.tundee.org in production). The server mints
 *   and reads it; the browser never handles it, so it cannot be chosen by the page.
 *   (It can still be discarded by clearing cookies, which re-rolls the visitor; that
 *   is the known price of randomizing an unauthenticated person.)
 *
 * THE ASSIGNMENT
 *   The same HMAC as for accounts, with the anon_id in place of the user id and the
 *   same stratum (region_group x income_bracket), so the arm is reproducible from
 *   the anon_id alone and a re-submitted quiz returns the same arm.
 *
 * THE MERGE, when the visitor signs in (decideMerge below)
 *   The profile is the unit of analysis, so a profile that already has an arm wins
 *   and a disagreement is recorded in randomization_conflicts; an anonymous arm is
 *   lifted onto a profile that has none, keeping its ORIGINAL assigned-at time.
 *   Nobody who has declined research consent on their account is lifted, and the
 *   pilot cohort is never randomized.
 */

import { createHmac } from 'node:crypto';
import {
  ASSIGNMENT_ALGORITHM_VERSION,
  computeFairnessEligible,
  computeRankingVariant,
  randomizationSalt,
  stratumKey,
  type RankingVariant,
} from './assignment';

/** First-party cookie holding the anonymous id. Server-set, httpOnly. */
export const ANON_COOKIE = 'tundee_anon';
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAnonId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** The switch. Anything other than the literal 'on' is off. */
export function anonRandomizationEnabled(): boolean {
  return process.env.ANON_RANDOMIZATION === 'on';
}

/** What the database stores for an anonymous visitor. Never sent to the browser. */
export interface AnonAssignment {
  anon_id: string;
  ranking_variant: RankingVariant;
  ranking_assigned_at: string;
  assignment_algorithm_version: string;
  stratum: string;
  fairness_eligible: boolean;
  research_consent_version: string;
  research_consented_at: string;
  claimed_by: string | null;
}

/**
 * The assignment for an anon_id and the answers it gave. Deterministic; consent is
 * a precondition, not an input — the caller must not call this without it.
 */
export function buildAnonAssignment(input: {
  anonId: string;
  province: string;
  incomeBracket: number;
  consentVersion: string;
  now: Date;
}): Omit<AnonAssignment, 'claimed_by'> {
  const stratum = stratumKey(input.province, input.incomeBracket);
  return {
    anon_id: input.anonId,
    ranking_variant: computeRankingVariant(input.anonId, stratum, randomizationSalt()),
    ranking_assigned_at: input.now.toISOString(),
    assignment_algorithm_version: ASSIGNMENT_ALGORITHM_VERSION,
    stratum,
    fairness_eligible: computeFairnessEligible(input.province, input.incomeBracket),
    research_consent_version: input.consentVersion,
    research_consented_at: input.now.toISOString(),
  };
}

/** Whether the fairness adjustment is applied to an anonymous visitor's ranking. */
export function anonFairnessMode(a: Pick<AnonAssignment, 'ranking_variant' | 'fairness_eligible'> | null): 'on' | 'off' {
  return a && a.ranking_variant === 'fairness_adjusted' && a.fairness_eligible ? 'on' : 'off';
}

// ── The merge rule ───────────────────────────────────────────────────────────

export interface ProfileFacts {
  cohort: string | null;
  ranking_variant: string | null;
}

export interface AccountConsent {
  /** False when the account has no student_profile row at all. */
  hasRow: boolean;
  consent_research: boolean | null;
}

export type MergeDecision =
  | { action: 'none'; reason: 'no_anon_assignment' | 'claimed_by_other' | 'already_claimed' | 'pilot_cohort' | 'declined_on_account' }
  | { action: 'same_arm' }
  | { action: 'conflict'; anonArm: RankingVariant; profileArm: RankingVariant }
  | { action: 'lift' };

/**
 * What to do with an anonymous assignment when its owner signs in. Pure, and the
 * one place the rule is written down — PART 2 step 2: the profile's arm always
 * wins; an anonymous arm is lifted only onto a profile that has none.
 */
export function decideMerge(input: {
  userId: string;
  anon: Pick<AnonAssignment, 'ranking_variant' | 'claimed_by'> | null;
  profile: ProfileFacts | null;
  consent: AccountConsent;
}): MergeDecision {
  const { userId, anon, profile, consent } = input;
  if (!anon) return { action: 'none', reason: 'no_anon_assignment' };
  if (anon.claimed_by) {
    return { action: 'none', reason: anon.claimed_by === userId ? 'already_claimed' : 'claimed_by_other' };
  }
  if (profile?.cohort === 'pilot') return { action: 'none', reason: 'pilot_cohort' };
  // An explicit "no" on the account is the later and more specific decision.
  if (consent.hasRow && consent.consent_research === false) return { action: 'none', reason: 'declined_on_account' };

  const profileArm = profile?.ranking_variant ?? null;
  if (profileArm === 'baseline' || profileArm === 'fairness_adjusted') {
    return profileArm === anon.ranking_variant
      ? { action: 'same_arm' }
      : { action: 'conflict', anonArm: anon.ranking_variant, profileArm };
  }
  return { action: 'lift' };
}

/** A stable, non-reversible tag for logs: never print the anon_id itself. */
export function anonLogTag(anonId: string): string {
  return createHmac('sha256', 'tundee-anon-log').update(anonId).digest('hex').slice(0, 8);
}
