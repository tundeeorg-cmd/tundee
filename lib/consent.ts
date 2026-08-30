/**
 * PDPA consent, captured inline on /auth beside the sign-in controls.
 *
 * It used to be step 0 of the /profile/setup wizard, which forced every new user
 * through the wizard even when /start had already collected their answers. Moving
 * it here lets the signup path write a complete, consented profile and drop the
 * user straight on their matched results.
 *
 * Carried three ways, because the paths differ in what survives them:
 *   • cookie      — Google and LINE return to the same browser, and a SameSite=Lax
 *                   cookie survives a top-level redirect
 *   • form field  — the no-JS shell posts a `required` checkbox
 *   • query param — a student who escapes an embedded webview into Chrome lands in
 *                   a browser with an empty cookie jar; the URL is the only
 *                   carrier that crosses that boundary
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

/**
 * True when ANY carrier presents consent — cookie, form field, or query param.
 *
 * Server-side enforcement needs this because the carrier differs by path: the
 * hydrated client sets a cookie before every sign-in, while the no-JS form posts a
 * checkbox and the no-JS LINE control submits a query param. One of them presenting
 * valid consent is enough; they are the same click reported through different channels.
 *
 * Until this existed, consent was enforced only in the browser — the signup routes
 * accepted anything, so the checkbox could be skipped by posting to them directly.
 * The tick is a PDPA record written onto a minor's profile; it should not be
 * defeatable with curl.
 */
export function hasValidConsent(...values: (string | null | undefined)[]): boolean {
  return values.some(isValidConsent);
}
