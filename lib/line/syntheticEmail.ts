/**
 * Placeholder addresses on LINE accounts from before LINE became a Supabase
 * provider.
 *
 * The original LINE bridge had to give every account an email, because that
 * was the only way it could mint a session, and LINE returns none. It used
 * `line_<LINE id>@line.tundee.invalid`. The bridge is gone and nothing creates
 * these any more, but the accounts it made keep theirs until the student adds a
 * real address (app/api/auth/verify-email, claim) — so anything that sends
 * mail must still recognise and skip them.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so a send would
 * bounce against a domain that cannot exist — exactly the traffic that damages
 * a sender's reputation, failing silently after the API accepts it.
 */

export const SYNTHETIC_EMAIL_DOMAIN = 'line.tundee.invalid';

/** True when this address is a placeholder and nothing can be delivered to it. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}
