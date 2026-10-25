/**
 * Who may be randomized on /start (the age question). Pure.
 *
 * The age threshold is MINOR_AGE_THRESHOLD in consentGate.ts — the same number the
 * export uses to decide whether a guardian's consent is needed — so there is ONE
 * place to change it. Which number is right (18, or 20, the age of majority in the
 * Civil and Commercial Code) is an open question for counsel and the ethics committee
 * (research/PROPOSAL-2026-10-minors-and-consent.md); the SQL constant in
 * scripts/20261031_v29 must be changed with it, and a test fails if they drift.
 *
 * The answer is SELF-DECLARED and cannot be checked. A visitor who is under the
 * threshold can say otherwise. This lowers the chance a minor is randomized without a
 * guardian; it does not remove it, and the ethics application has to say so.
 *
 * Under the threshold (or unanswered) a visitor gets the whole service — the same
 * scholarships, the baseline ranking — and is simply not in the study: no assignment,
 * no cookie, no row. The reach is still countable (research_participation on the
 * quiz_completed event) without storing anything about the person.
 */

import { MINOR_AGE_THRESHOLD } from './consentGate';

/** The age at which a visitor can be offered the study. One value, imported. */
export const START_ADULT_AGE = MINOR_AGE_THRESHOLD;

/** What the quiz_completed event records about the visitor's place in the study. */
export type ResearchParticipation =
  | 'not_offered'          // randomization is off
  | 'age_not_answered'
  | 'ineligible_minor'
  | 'declined'
  | 'consented';

export function researchParticipation(input: {
  offered: boolean;
  adult: boolean | null;
  consented: boolean;
}): ResearchParticipation {
  if (!input.offered) return 'not_offered';
  if (input.adult === null) return 'age_not_answered';
  if (input.adult === false) return 'ineligible_minor';
  return input.consented ? 'consented' : 'declined';
}

/** The visitor's own answer, before randomization is requested. */
export function mayBeRandomized(input: { adult: unknown; consent: unknown }): 'ok' | 'ineligible_minor' | 'no_consent' {
  // Age first: a visitor who is not (declared) an adult is never asked for, nor
  // credited with, consent to research.
  if (input.adult !== true) return 'ineligible_minor';
  if (input.consent !== true) return 'no_consent';
  return 'ok';
}
