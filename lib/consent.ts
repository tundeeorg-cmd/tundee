/**
 * PDPA consent, captured inline on /auth beside the one-tap buttons.
 *
 * It used to be step 0 of the /profile/setup wizard, which forced every new user
 * through the wizard even when /start had already collected their answers. Moving
 * it here lets the auth callback write a complete, consented profile and drop the
 * user straight on their matched results.
 *
 * Carried two ways, because the three signup methods differ:
 *   • cookie      — Google and LINE return to the same browser, and a SameSite=Lax
 *                   cookie survives a top-level redirect
 *   • query param — an email magic link is commonly opened in a DIFFERENT browser,
 *                   where no cookie exists; baking it into emailRedirectTo is the
 *                   only carrier that survives that hop
 */

/** Bump when the wording of the terms changes. */
export const CONSENT_VERSION = '1.0';

export const CONSENT_COOKIE = 'tundee_consent';
export const CONSENT_PARAM = 'consent';

/** 24h — matches PREVIEW_COOKIE_MAX_AGE so the pair expires together. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24;

/** True only for a version string we actually issued. */
export function isValidConsent(value: string | null | undefined): boolean {
  return value === CONSENT_VERSION;
}
