/**
 * Consent gate utilities for the TunDee research pipeline.
 *
 * PDPA 2562 (Personal Data Protection Act) requires explicit consent
 * before processing personal data for research purposes, and explicit
 * consent from a guardian for data subjects who are minors.
 *
 * These functions are pure (no I/O) so they can be used in:
 *   - Server-side API routes (consent enforcement before export)
 *   - Client-side form validation (guardian consent UI gate)
 *   - Unit tests (no mocking required)
 */

import type { StudentProfileRow } from './tableTypes';

/** Current consent form version. Bump this when the consent text changes. */
export const CURRENT_CONSENT_VERSION = '2026-07-v1';

/**
 * Age below which a guardian's consent is also required. 20 is the age of majority in
 * the Civil and Commercial Code, and PDPA §20 lets a minor consent alone only to what
 * the Civil Code lets a minor do alone; consenting to research use of income and
 * grades is not obviously that. Chosen by the project owner on 2026-10-26 (it was 18);
 * counsel and the ethics committee may still change it. Mirrored in
 * research_minor_age_threshold() in SQL (scripts/20261101_v33_minor_age_threshold_20.sql);
 * a test fails if they drift.
 */
export const MINOR_AGE_THRESHOLD = 20;

/**
 * Returns true if this student profile may be included in research exports.
 * Requires consent_research = TRUE AND consent is not stale (version matches).
 *
 * Stale-consent check: if consent_version doesn't match CURRENT_CONSENT_VERSION,
 * the student must re-consent before their data is used.
 */
export function isResearchConsented(profile: Pick<StudentProfileRow, 'consent_research' | 'consent_version'>): boolean {
  return profile.consent_research === true
    && profile.consent_version === CURRENT_CONSENT_VERSION;
}

/**
 * Returns true if guardian consent is required for this profile.
 *
 * Only the birth YEAR is stored, so `referenceYear - birthYear` can overstate the age
 * by one (someone born in December is that many "years old" for eleven months before
 * they are). A student is therefore treated as an adult only when they cannot be under
 * the threshold on ANY day of the reference year: the year difference must EXCEED
 * MINOR_AGE_THRESHOLD. With 20, a student born in `year - 20` is still asked for a
 * guardian (some of them are 19 and they cannot be told apart), and one born in
 * `year - 21` or earlier is not. A missing birth year cannot make anyone a minor.
 */
export function requiresGuardianConsent(
  birthYear: number | null,
  referenceYear: number = new Date().getFullYear(),
): boolean {
  if (birthYear === null) return false;
  return referenceYear - birthYear <= MINOR_AGE_THRESHOLD;
}

/**
 * Returns true if a minor's profile is fully consented (both the student
 * and their guardian have consented).
 */
export function isMinorFullyConsented(profile: Pick<StudentProfileRow, 'consent_research' | 'guardian_consent' | 'birth_year'>): boolean {
  if (!requiresGuardianConsent(profile.birth_year)) return true;  // not a minor
  return profile.consent_research === true && profile.guardian_consent === true;
}

/**
 * Filter a list of profiles to those eligible for research export.
 * Applies both the consent gate and stale-version check.
 *
 * The SQL view v_event_research_export enforces the same rule at query time;
 * this function is the TypeScript equivalent for application-layer enforcement.
 */
export function filterConsented<T extends Pick<StudentProfileRow, 'consent_research' | 'consent_version'>>(
  profiles: T[],
): T[] {
  return profiles.filter(isResearchConsented);
}

/** Why a student's data may not be exported; null means it may. */
export type ExportExclusion =
  | 'no_student_profile'
  | 'no_research_consent'
  | 'stale_consent_version'
  | 'minor_without_guardian';

/**
 * The ONE test an export applies to a student, in the order a person would ask it:
 * is there a record, did they say yes, was it to the CURRENT wording, and — if they
 * are a minor — did a guardian say yes too.
 *
 * The stale-version rule is the point of this function. Before it, the export route
 * and the SQL views checked `consent_research = TRUE` alone, so a student who agreed
 * to superseded wording (`2026-01-v1`) was exported although isResearchConsented()
 * said their consent had lapsed. Consent given to different words is not consent to
 * these.
 *
 * Age comes from birth_year only when the student gave it; with none, the minor rule
 * cannot fire (requiresGuardianConsent says so), and that is a known limit.
 */
export function exportExclusion(
  sp: Pick<StudentProfileRow, 'consent_research' | 'consent_version' | 'guardian_consent' | 'birth_year'> | null | undefined,
): ExportExclusion | null {
  if (!sp) return 'no_student_profile';
  if (sp.consent_research !== true) return 'no_research_consent';
  if (!isResearchConsented(sp)) return 'stale_consent_version';
  if (!isMinorFullyConsented(sp)) return 'minor_without_guardian';
  return null;
}
