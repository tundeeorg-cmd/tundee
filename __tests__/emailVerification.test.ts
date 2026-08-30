/**
 * Email verification tokens.
 *
 * Verification exists for exactly one purpose: to stop deadline reminders being
 * mailed to addresses nobody has proved they own. Signup verifies nothing and
 * sends nothing — an account is created, signed in and fully usable in one
 * request, because every email is a step where a student in a Facebook webview
 * leaves the browser and does not come back.
 *
 * So the token has one job, and these are the ways it must not fail at it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createVerificationToken,
  verifyVerificationToken,
  VERIFICATION_TTL_MS,
} from '@/lib/auth/emailVerification';

const USER = '2f1d8c3a-0000-4000-8000-000000000001';
const OTHER = '2f1d8c3a-0000-4000-8000-000000000002';
const EMAIL = 'student@example.com';

beforeEach(() => vi.stubEnv('EMAIL_VERIFY_SECRET', 'test-secret-not-a-real-one'));
afterEach(() => vi.unstubAllEnvs());

describe('a token verifies the pair it was minted for', () => {
  it('accepts the right user and address', () => {
    const token = createVerificationToken(USER, EMAIL)!;
    expect(verifyVerificationToken(token, EMAIL)).toEqual({ ok: true, userId: USER });
  });

  it('is case-insensitive about the address, as email is', () => {
    const token = createVerificationToken(USER, 'Student@Example.COM')!;
    expect(verifyVerificationToken(token, EMAIL).ok).toBe(true);
  });

  it('stops working when the address changes', () => {
    // A link mailed to an old address must not verify a new one — otherwise
    // changing your email to someone else's would arrive pre-verified.
    const token = createVerificationToken(USER, EMAIL)!;
    expect(verifyVerificationToken(token, 'someone.else@example.com'))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('binds the user id, so one student cannot verify with another token', () => {
    const token = createVerificationToken(OTHER, EMAIL)!;
    const result = verifyVerificationToken(token, EMAIL);
    // The signature is valid for OTHER, so the route compares the id itself.
    expect(result.ok && result.userId).toBe(OTHER);
    expect(result.ok && result.userId).not.toBe(USER);
  });
});

describe('forgery', () => {
  it('rejects a tampered signature', () => {
    const token = createVerificationToken(USER, EMAIL)!;
    const [id, exp, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyVerificationToken(`${id}.${exp}.${flipped}`, EMAIL).ok).toBe(false);
  });

  it('rejects a token whose expiry was pushed out', () => {
    // The expiry is inside the signed payload, so extending it invalidates it.
    const token = createVerificationToken(USER, EMAIL)!;
    const [id, , sig] = token.split('.');
    const later = Date.now() + VERIFICATION_TTL_MS * 10;
    expect(verifyVerificationToken(`${id}.${later}.${sig}`, EMAIL))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a substituted user id', () => {
    const token = createVerificationToken(USER, EMAIL)!;
    const [, exp, sig] = token.split('.');
    expect(verifyVerificationToken(`${OTHER}.${exp}.${sig}`, EMAIL).ok).toBe(false);
  });

  it('rejects malformed shapes rather than throwing', () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c.d', '..', 'x.notanumber.y']) {
      expect(verifyVerificationToken(bad, EMAIL).ok, bad).toBe(false);
    }
    expect(verifyVerificationToken(null, EMAIL).ok).toBe(false);
    expect(verifyVerificationToken(undefined, EMAIL).ok).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the length is checked
    // first. A crash here would be a 500 on a link a student just tapped.
    const token = createVerificationToken(USER, EMAIL)!;
    const [id, exp] = token.split('.');
    expect(() => verifyVerificationToken(`${id}.${exp}.short`, EMAIL)).not.toThrow();
    expect(verifyVerificationToken(`${id}.${exp}.short`, EMAIL).ok).toBe(false);
  });
});

describe('expiry', () => {
  it('accepts a token inside its window', () => {
    const now = 1_700_000_000_000;
    const token = createVerificationToken(USER, EMAIL, now)!;
    expect(verifyVerificationToken(token, EMAIL, now + VERIFICATION_TTL_MS - 1000).ok).toBe(true);
  });

  it('rejects one past it, and says so distinctly', () => {
    // Distinct from a bad signature: the route can tell the student to ask for
    // a new link rather than implying something is wrong with their account.
    const now = 1_700_000_000_000;
    const token = createVerificationToken(USER, EMAIL, now)!;
    expect(verifyVerificationToken(token, EMAIL, now + VERIFICATION_TTL_MS + 1000))
      .toEqual({ ok: false, reason: 'expired' });
  });
});

describe('no secret configured', () => {
  it('mints nothing and verifies nothing, rather than accepting everything', () => {
    // Failing closed matters: failing open would make every unsigned string a
    // valid proof of address ownership.
    vi.stubEnv('EMAIL_VERIFY_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(createVerificationToken(USER, EMAIL)).toBeNull();
    expect(verifyVerificationToken('anything.1.at.all', EMAIL))
      .toEqual({ ok: false, reason: 'no_secret' });
  });

  it('falls back to the service-role key so a missing var cannot break reminders', () => {
    vi.stubEnv('EMAIL_VERIFY_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-stand-in');
    const token = createVerificationToken(USER, EMAIL)!;
    expect(token).toBeTruthy();
    expect(verifyVerificationToken(token, EMAIL).ok).toBe(true);
  });
});
