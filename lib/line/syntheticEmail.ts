/**
 * Placeholder email addresses for LINE users whose real address we cannot see.
 *
 * LINE only returns an email once the Login channel has been granted the *Email address
 * permission*, which is a manual review by LINE. Until then a LINE signup has no address
 * at all, and Supabase Auth requires one — so the bridge in
 * `app/api/auth/line/callback` mints a synthetic one instead.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve. That is the point: the
 * address is inert and cannot accidentally be delivered to a real inbox belonging to
 * someone else.
 *
 * The consequence, which callers must handle: **these accounts cannot receive email.**
 * Anything that sends to a user address has to skip them, or every send bounces to a
 * domain that does not exist — which is exactly the traffic that damages a sender's
 * reputation, and it fails silently because the bounce happens after the API accepts it.
 *
 * Defined here rather than in the callback so that senders can recognise these addresses
 * without importing an auth route, and so the domain exists in exactly one place.
 */

export const SYNTHETIC_EMAIL_DOMAIN = 'line.tundee.invalid';

/** The placeholder address for a LINE user id. */
export function syntheticEmail(lineUserId: string): string {
  return `line_${lineUserId.replace(/[^A-Za-z0-9_-]/g, '')}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** True when this address is a placeholder and nothing can be delivered to it. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}
