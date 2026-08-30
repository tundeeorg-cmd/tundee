/**
 * The signup-conversion handoff.
 *
 * app/auth/callback writes the profile itself when a /start visitor supplies
 * enough to skip the setup wizard — so the wizard's CompleteRegistration never
 * runs, and before this handoff existed every signup arriving from a paid
 * /start click was invisible to the ad platforms.
 *
 * The two properties that matter: it fires for that path, and it fires at most
 * once.
 */

import { describe, it, expect } from 'vitest';
import {
  SIGNUP_CONVERSION_COOKIE,
  readSignupConversion,
  encodeSignupConversion,
  expireSignupConversionCookie,
  isSignupConversionMethod,
  isFirstSignIn,
  FIRST_SIGN_IN_WINDOW_MS,
} from '@/lib/analytics/signupConversion';

describe('readSignupConversion', () => {
  it('reads the method the server left behind', () => {
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=google|0|`)?.method).toBe('google');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=line|0|`)?.method).toBe('line');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=password|0|`)?.method).toBe('password');
  });

  it('carries the browser the account was created IN, not the one reading it', () => {
    // The two differ for anyone who escaped a webview into Chrome — they
    // convert in Chrome, and recording "not a webview" there would hide the
    // exact path the escape hatch exists to create.
    const c = readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=password|1|facebook`);
    expect(c).toEqual({ method: 'password', inWebview: true, app: 'facebook' });
  });

  it('round-trips through encodeSignupConversion', () => {
    for (const c of [
      { method: 'password' as const, inWebview: true,  app: 'tiktok' as const },
      { method: 'google'   as const, inWebview: false, app: null },
      { method: 'line'     as const, inWebview: true,  app: 'messenger' as const },
    ]) {
      expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=${encodeSignupConversion(c)}`)).toEqual(c);
    }
  });

  it('still reads the bare method the previous deploy wrote', () => {
    // A cookie set by the old code may be in flight for up to five minutes
    // after deploy. Dropping it would turn real conversions into silent
    // no-ops during exactly the window someone is watching the rollout.
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=google`))
      .toEqual({ method: 'google', inWebview: false, app: null });
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=email`)?.method).toBe('email');
  });

  it('finds it among other cookies, in any position', () => {
    expect(readSignupConversion(`a=1; ${SIGNUP_CONVERSION_COOKIE}=line|0|; b=2`)?.method).toBe('line');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=line|0|; b=2`)?.method).toBe('line');
    expect(readSignupConversion(`a=1; ${SIGNUP_CONVERSION_COOKIE}=line|0|`)?.method).toBe('line');
  });

  it('returns null when absent, empty or junk — never guesses a conversion', () => {
    expect(readSignupConversion('')).toBeNull();
    expect(readSignupConversion('other=1')).toBeNull();
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=`)).toBeNull();
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=facebook|1|facebook`)).toBeNull();
  });

  it('is not fooled by a cookie whose name merely ends with ours', () => {
    expect(readSignupConversion(`not_${SIGNUP_CONVERSION_COOKIE}=google|0|`)).toBeNull();
  });

  it('handles a url-encoded value', () => {
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=${encodeURIComponent('google|1|instagram')}`))
      .toEqual({ method: 'google', inWebview: true, app: 'instagram' });
  });
});

describe('expireSignupConversionCookie', () => {
  it('expires immediately on the same path the callback set', () => {
    const c = expireSignupConversionCookie();
    expect(c).toContain(`${SIGNUP_CONVERSION_COOKIE}=`);
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('path=/');
  });

  it('makes a second read return null — the event can only fire once', () => {
    // Mirrors what SignupConversion.tsx does: read, then expire.
    let jar = `${SIGNUP_CONVERSION_COOKIE}=google|0|`;
    expect(readSignupConversion(jar)?.method).toBe('google');

    jar = '';   // the browser applies Max-Age=0 by dropping it
    expect(readSignupConversion(jar)).toBeNull();
  });
});

describe('isSignupConversionMethod', () => {
  it('accepts every real method, including the retired one', () => {
    expect(isSignupConversionMethod('google')).toBe(true);
    expect(isSignupConversionMethod('line')).toBe(true);
    expect(isSignupConversionMethod('password')).toBe(true);
    // 'email' is the magic-link flow that password auth replaced. Accounts
    // created that way still exist and still sign in, so it is not dead.
    expect(isSignupConversionMethod('email')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const v of ['', 'apple', 'GOOGLE', null, undefined, 1, {}]) {
      expect(isSignupConversionMethod(v)).toBe(false);
    }
  });
});

describe('isFirstSignIn', () => {
  const created = '2026-08-30T10:00:00.000Z';
  const plus = (ms: number) => new Date(Date.parse(created) + ms).toISOString();

  it('is true on the sign-in that created the account', () => {
    expect(isFirstSignIn(created, created)).toBe(true);
    expect(isFirstSignIn(created, plus(1200))).toBe(true);
  });

  it('is true when nothing has stamped last_sign_in_at yet', () => {
    expect(isFirstSignIn(created, null)).toBe(true);
    expect(isFirstSignIn(created, undefined)).toBe(true);
  });

  it('is false for a returning user, which is what stops re-reporting', () => {
    expect(isFirstSignIn(created, plus(3 * 24 * 3600_000))).toBe(false);
    expect(isFirstSignIn(created, plus(FIRST_SIGN_IN_WINDOW_MS + 1))).toBe(false);
  });

  it('treats the boundary as already returning', () => {
    expect(isFirstSignIn(created, plus(FIRST_SIGN_IN_WINDOW_MS))).toBe(false);
    expect(isFirstSignIn(created, plus(FIRST_SIGN_IN_WINDOW_MS - 1))).toBe(true);
  });

  it('does not report when the timestamps are unusable', () => {
    expect(isFirstSignIn(null, created)).toBe(false);
    expect(isFirstSignIn(undefined, created)).toBe(false);
    expect(isFirstSignIn('not a date', created)).toBe(false);
  });

  it('reports when only last_sign_in_at is unparseable', () => {
    // created_at is sound, so the account is real; the missing half of the
    // comparison should not silently drop a genuine signup.
    expect(isFirstSignIn(created, 'garbage')).toBe(true);
  });

  it('is symmetric, so clock skew either way cannot drop a signup', () => {
    expect(isFirstSignIn(created, plus(-1200))).toBe(true);
  });
});
