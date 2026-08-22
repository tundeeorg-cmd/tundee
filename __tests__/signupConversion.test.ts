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
  expireSignupConversionCookie,
  isSignupConversionMethod,
} from '@/lib/analytics/signupConversion';

describe('readSignupConversion', () => {
  it('reads the method the callback left behind', () => {
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=google`)).toBe('google');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=line`)).toBe('line');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=email`)).toBe('email');
  });

  it('finds it among other cookies, in any position', () => {
    expect(readSignupConversion(`a=1; ${SIGNUP_CONVERSION_COOKIE}=line; b=2`)).toBe('line');
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=line; b=2`)).toBe('line');
    expect(readSignupConversion(`a=1; ${SIGNUP_CONVERSION_COOKIE}=line`)).toBe('line');
  });

  it('returns null when absent, empty or junk — never guesses a conversion', () => {
    expect(readSignupConversion('')).toBeNull();
    expect(readSignupConversion('other=1')).toBeNull();
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=`)).toBeNull();
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=facebook`)).toBeNull();
  });

  it('is not fooled by a cookie whose name merely ends with ours', () => {
    expect(readSignupConversion(`not_${SIGNUP_CONVERSION_COOKIE}=google`)).toBeNull();
  });

  it('handles a url-encoded value', () => {
    expect(readSignupConversion(`${SIGNUP_CONVERSION_COOKIE}=${encodeURIComponent('google')}`))
      .toBe('google');
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
    let jar = `${SIGNUP_CONVERSION_COOKIE}=google`;
    expect(readSignupConversion(jar)).toBe('google');

    jar = '';   // the browser applies Max-Age=0 by dropping it
    expect(readSignupConversion(jar)).toBeNull();
  });
});

describe('isSignupConversionMethod', () => {
  it('accepts only the three real providers', () => {
    expect(isSignupConversionMethod('google')).toBe(true);
    expect(isSignupConversionMethod('line')).toBe(true);
    expect(isSignupConversionMethod('email')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const v of ['', 'apple', 'GOOGLE', null, undefined, 1, {}]) {
      expect(isSignupConversionMethod(v)).toBe(false);
    }
  });
});
