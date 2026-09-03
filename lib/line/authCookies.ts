/**
 * Cookie names shared by the two halves of the LINE login round trip
 * (app/api/auth/line/start → app/api/auth/line/callback).
 *
 * They live here rather than in the route files because Next.js route modules
 * may only export route handlers and the recognized config options.
 */

/** CSRF state, compared byte-for-byte on the way back from LINE. */
export const LINE_AUTH_STATE_COOKIE = 'line_auth_state';

/** Post-login destination captured before the redirect to LINE. */
export const LINE_AUTH_NEXT_COOKIE = 'line_auth_next';

/**
 * OpenID nonce, echoed inside the id_token and checked on return.
 *
 * Without it nothing binds the token LINE returns to the request that asked for
 * it, so a token captured elsewhere would verify perfectly well here. LINE's
 * /verify endpoint accepts a nonce precisely so this check can be made.
 */
export const LINE_AUTH_NONCE_COOKIE = 'line_auth_nonce';

/** PKCE code_verifier. The authorization code crosses a redirect chain. */
export const LINE_AUTH_VERIFIER_COOKIE = 'line_auth_verifier';

/**
 * The visitor's /start answers and campaign, held across the LINE round trip.
 *
 * LINE's callback hands off to /auth/callback through a URL it builds itself,
 * so anything that must reach the profile merge has to be parked somewhere the
 * callback can read. Before this existed, every LINE signup recorded
 * recruitment_source = 'organic' regardless of which ad paid for it.
 */
export const LINE_AUTH_PREVIEW_COOKIE = 'line_auth_preview';
export const LINE_AUTH_UTM_COOKIE = 'line_auth_utm';

/**
 * Id of the /start answers parked by /api/intake, held across the LINE round
 * trip for the same reason LINE_AUTH_PREVIEW_COOKIE is: the visitor leaves for
 * access.line.me and comes back, and whatever was in the URL is gone by then.
 */
export const LINE_AUTH_INTAKE_COOKIE = 'line_auth_intake';

/**
 * Set only on the one retry after an auto-login failure, so the retry cannot
 * loop.
 *
 * It has to be a cookie rather than a query param: LINE redirects to the
 * Callback URL registered in the Developers Console, byte for byte, so nothing
 * the callback receives can carry state we put on the way out.
 */
export const LINE_AUTH_RETRY_COOKIE = 'line_auth_retry';

/** All of these only need to outlive the OAuth round trip. */
export const LINE_AUTH_COOKIE_MAX_AGE = 600;
