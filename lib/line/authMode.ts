/**
 * LINE sign-in is a Supabase Auth provider: `custom:line`.
 *
 * Configured in the Supabase dashboard (Authentication → Custom Providers) in
 * *Manual* mode. Supabase exchanges the code and reads the profile from LINE's
 * userinfo endpoint; the session lands through /auth/callback like Google's.
 * Accounts are labelled LINE and have no email — LINE's userinfo never returns
 * one — until the student adds one for reminders (app/api/auth/verify-email).
 *
 * Why Manual mode: LINE signs web-login ID tokens HS256 with the channel
 * secret, while its discovery document only advertises ES256, so auto-discovery
 * rejects every token ("unexpected signature algorithm HS256"). Manual mode with
 * no JWKS skips the ID token and uses userinfo. Verified on production
 * 2026-10-04; live since the same day.
 *
 * Accounts from before the switch were given their `custom:line` identity by
 * scripts/20261005_v23_line_identities.sql, so they sign into the account they
 * already had. The original bridge (our own token exchange plus a placeholder
 * email) was removed once that was confirmed in production.
 */

/** The provider id as configured in Supabase: Custom Providers → identifier `line`. */
export const LINE_PROVIDER = 'custom:line' as const;

interface IdentityLike {
  provider?: string;
  provider_id?: string;
  identity_data?: Record<string, unknown> | null;
}

/** The LINE user id (`sub`) on a Supabase user's `custom:line` identity, or null. */
export function lineSubOf(user: { identities?: IdentityLike[] | null }): string | null {
  const identity = user.identities?.find(i => i.provider === LINE_PROVIDER);
  if (!identity) return null;
  const sub = identity.identity_data?.sub;
  if (typeof sub === 'string' && sub) return sub;
  return identity.provider_id || null;
}

/**
 * Markers on the /auth/callback URL a Supabase-mode LINE attempt returns to.
 * Supabase appends its own `error` params to that same URL when the attempt
 * fails, so these are how /auth/callback tells a failed LINE attempt (retry
 * once, then explain) from a failed Google one. Query params rather than
 * cookies: they travel with exactly the attempt they describe and cannot go
 * stale or leak into the next sign-in.
 */
export const LINE_CALLBACK_FLAG = 'via_line';
export const LINE_CALLBACK_RETRY_FLAG = 'line_retry';
