/**
 * Did this session's sign-in already prove the student owns their address?
 *
 * Email sign-in is a six-digit code (or the link in the same email): reading it
 * requires the inbox. Supabase records how a session was established in the
 * token's `amr` claim, and for those methods it is 'otp' / 'magiclink'. A
 * student who signed in that way and then turns on email reminders has proven
 * the address once already; mailing them a verification link was a second
 * round trip out of the Facebook webview for nothing (seen on a phone,
 * 15 Nov 2026).
 *
 * Password, OAuth (Google, LINE) and token refreshes prove nothing about the
 * inbox, so they still get the verification email.
 */

const INBOX_METHODS = new Set(['otp', 'magiclink']);

export function sessionProvedEmail(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    const method = typeof entry === 'string'
      ? entry
      : (entry && typeof entry === 'object' ? (entry as { method?: unknown }).method : null);
    return typeof method === 'string' && INBOX_METHODS.has(method);
  });
}
