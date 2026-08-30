/**
 * Email verification tokens.
 *
 * TunDee verifies an address for exactly one reason: before sending deadline
 * reminders to it. Signup does not verify, nothing in the product is gated on a
 * verified address, and no verification mail is sent unless a student asks for
 * email reminders. Every send is a step where someone in a Facebook webview
 * leaves the browser, so the sends have to earn their place.
 *
 * Stateless HMAC rather than a tokens table: there is nothing to store that the
 * signature does not already prove, and a table would need its own expiry
 * sweep. The token binds user id AND address, so it stops being valid the
 * moment either changes — a link mailed to an old address cannot verify a new
 * one.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** 7 days. Long enough to survive a student who reads mail once a week. */
export const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dedicated secret where one is configured; the service-role key otherwise.
 *
 * The fallback keeps this from becoming a new required env var that, if
 * forgotten on deploy, would silently break reminders. Both are server-only and
 * neither is ever sent to a browser.
 */
function secret(): string | null {
  return process.env.EMAIL_VERIFY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/** `<userId>.<expiryMs>.<signature>`, safe in a URL with no encoding. */
export function createVerificationToken(
  userId: string,
  email: string,
  now: number = Date.now(),
): string | null {
  const key = secret();
  if (!key) {
    console.error('[emailVerification] no signing secret configured');
    return null;
  }
  const expires = now + VERIFICATION_TTL_MS;
  const payload = `${userId}:${email.toLowerCase()}:${expires}`;
  return `${userId}.${expires}.${sign(payload, key)}`;
}

export type VerificationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'expired' | 'bad_signature' | 'no_secret' };

/**
 * Checks a token against the address it is being used to verify.
 *
 * `email` is supplied by the caller from the account record, not from the URL:
 * a token is only meaningful for the address it was minted for, and taking that
 * address from the same string that carries the signature would let anyone
 * choose both halves.
 */
export function verifyVerificationToken(
  token: string | null | undefined,
  email: string,
  now: number = Date.now(),
): VerificationResult {
  const key = secret();
  if (!key) return { ok: false, reason: 'no_secret' };
  if (!token) return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [userId, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  if (!userId || !Number.isFinite(expires)) return { ok: false, reason: 'malformed' };
  if (now > expires) return { ok: false, reason: 'expired' };

  const expected = sign(`${userId}:${email.toLowerCase()}:${expires}`, key);

  // Constant-time, and length-checked first because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true, userId };
}
