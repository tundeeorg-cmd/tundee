/**
 * Consent gate utilities for the TunDee research pipeline.
 *
 * PDPA 2562 (Personal Data Protection Act) requires explicit consent
 * before processing personal data for research purposes, and explicit
 * consent from a guardian for data subjects under 18.
 *
 * These functions are pure (no I/O) so they can be used in:
 *   - Server-side API routes (consent enforcement before export)
 *   - Client-side form validation (guardian consent UI gate)
 *   - Unit tests (no mocking required)
 */

import type { StudentProfileRow } from './tableTypes';

/** Current consent form version. Bump this when the consent text changes. */
export const CURRENT_CONSENT_VERSION = '2026-07-v1';

/** Age threshold below which a guardian's consent is also required (PDPA §25). */
export const MINOR_AGE_THRESHOLD = 18;

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
 * Based on birth_year: if the student would be under MINOR_AGE_THRESHOLD
 * in the given reference year, a guardian must also consent.
 */
export function requiresGuardianConsent(
  birthYear: number | null,
  referenceYear: number = new Date().getFullYear(),
): boolean {
  if (birthYear === null) return false;
  return referenceYear - birthYear < MINOR_AGE_THRESHOLD;
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
