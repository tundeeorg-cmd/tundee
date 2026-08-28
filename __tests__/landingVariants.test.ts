/**
 * Landing variant resolution.
 *
 * ?v= reaches an event log and, eventually, a covariate column. It is
 * validated against the registry rather than passed through, so these tests
 * are about keeping arbitrary visitor-supplied strings out of research data —
 * not only about picking the right headline.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLandingVariant,
  landingCopy,
  LANDING_VARIANTS,
  DEFAULT_LANDING_VARIANT,
} from '@/lib/landing/variants';

describe('resolveLandingVariant', () => {
  it('resolves every key that is actually in the registry', () => {
    for (const key of Object.keys(LANDING_VARIANTS)) {
      expect(resolveLandingVariant(key)).toBe(key);
    }
  });

  it('falls back to default for an unknown variant', () => {
    // A stale or mistyped ad URL must degrade to the standard page, not a
    // blank headline.
    expect(resolveLandingVariant('parents')).toBe(DEFAULT_LANDING_VARIANT);
    expect(resolveLandingVariant('does-not-exist')).toBe(DEFAULT_LANDING_VARIANT);
  });

  it('falls back to default for absent or non-string input', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(resolveLandingVariant(v as string | null | undefined)).toBe(DEFAULT_LANDING_VARIANT);
    }
  });

  it('never returns visitor-supplied text', () => {
    // The returned value is logged. If raw input could survive resolution,
    // anyone could write arbitrary strings into the research event stream.
    const hostile = [
      '<script>alert(1)</script>',
      "'; DROP TABLE funnel_events;--",
      '../../etc/passwd',
      '__proto__',
      'constructor',
      'toString',
      'x'.repeat(5000),
    ];
    for (const v of hostile) {
      const out = resolveLandingVariant(v);
      expect(Object.keys(LANDING_VARIANTS)).toContain(out);
    }
  });

  it('does not resolve inherited Object properties as variants', () => {
    // hasOwnProperty, not `in` — otherwise ?v=toString would "exist".
    expect(resolveLandingVariant('toString')).toBe(DEFAULT_LANDING_VARIANT);
    expect(resolveLandingVariant('hasOwnProperty')).toBe(DEFAULT_LANDING_VARIANT);
  });

  it('is case-insensitive and trims, so ad URLs are forgiving', () => {
    expect(resolveLandingVariant(' DEFAULT ')).toBe(DEFAULT_LANDING_VARIANT);
  });
});

describe('landingCopy', () => {
  it('always returns renderable copy, even for a bogus key', () => {
    const copy = landingCopy('nope');
    for (const field of ['badge', 'h1', 'sub', 'cta'] as const) {
      expect(typeof copy[field]).toBe('string');
      expect(copy[field].length).toBeGreaterThan(0);
    }
  });

  it('renders the live count into the trust line', () => {
    const copy = landingCopy(DEFAULT_LANDING_VARIANT);
    expect(copy.trust(518)).toContain('518');
  });

  it('omits the count entirely when the query failed — never invents one', () => {
    // A landing page that claims a scholarship total it could not read would
    // be fabricating a number shown to students.
    const line = landingCopy(DEFAULT_LANDING_VARIANT).trust(null);
    expect(line).not.toMatch(/\d/);
    expect(line.length).toBeGreaterThan(0);
  });
});
