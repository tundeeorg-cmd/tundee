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

/** Both cookies only need to outlive the OAuth round trip. */
export const LINE_AUTH_COOKIE_MAX_AGE = 600;
