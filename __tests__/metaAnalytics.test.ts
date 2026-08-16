/**
 * Meta Pixel helper — consent gating, environment gating, and the derived
 * values that leave the browser.
 *
 * The gating tests are the ones that matter legally: under PDPA nothing may
 * fire before an explicit accept, and a bug here is invisible in QA because a
 * developer who accepted once never sees the un-consented path again.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { gpaBand, signupMethodFrom } from '@/lib/analytics/meta';
import {
  getConsent,
  setConsent,
  hasAnalyticsConsent,
  subscribeConsent,
  CONSENT_VERSION,
} from '@/lib/analytics/consent';

// ─── localStorage stub ────────────────────────────────────────────────────────

function installLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  vi.stubGlobal('window', {
    localStorage: mock,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return store;
}

describe('cookie consent', () => {
  let store: Map<string, string>;

  beforeEach(() => { store = installLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('treats an undecided visitor as no consent', () => {
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('treats an explicit rejection as no consent', () => {
    setConsent('rejected');
    expect(getConsent()).toBe('rejected');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('only reports consent after an explicit accept', () => {
    setConsent('accepted');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('re-asks when the stored consent predates the current version', () => {
    store.set('tundee_cookie_consent', JSON.stringify({ choice: 'accepted', version: 'old-version', at: '2026-01-01' }));
    expect(getConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('stamps the current version when recording a choice', () => {
    setConsent('accepted');
    const stored = JSON.parse(store.get('tundee_cookie_consent')!);
    expect(stored.version).toBe(CONSENT_VERSION);
    expect(stored.choice).toBe('accepted');
  });

  it('falls back to no consent on corrupt storage', () => {
    store.set('tundee_cookie_consent', 'not json');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('notifies subscribers so tags can load without a reload', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeConsent(c => seen.push(c));
    setConsent('accepted');
    setConsent('rejected');
    unsubscribe();
    setConsent('accepted');
    expect(seen).toEqual(['accepted', 'rejected']);
  });
});

// ─── Derived values ───────────────────────────────────────────────────────────

describe('gpaBand', () => {
  it('buckets rather than sending a precise academic record to Meta', () => {
    expect(gpaBand(1.5)).toBe('below_2.00');
    expect(gpaBand(2.0)).toBe('2.00_2.49');
    expect(gpaBand(2.49)).toBe('2.00_2.49');
    expect(gpaBand(2.5)).toBe('2.50_2.99');
    expect(gpaBand(3.25)).toBe('3.00_3.49');
    expect(gpaBand(3.5)).toBe('3.50_4.00');
    expect(gpaBand(4.0)).toBe('3.50_4.00');
  });

  it('only ever emits one of the fixed labels, never a precise value', () => {
    const ALLOWED = new Set([
      'below_2.00', '2.00_2.49', '2.50_2.99', '3.00_3.49', '3.50_4.00', 'unknown',
    ]);
    for (const g of [0, 1.234, 2.777, 3.141, 3.999, 4]) {
      expect(ALLOWED.has(gpaBand(g))).toBe(true);
    }
  });

  it('handles junk input', () => {
    expect(gpaBand(NaN)).toBe('unknown');
    expect(gpaBand(Infinity)).toBe('unknown');
  });
});

describe('signupMethodFrom', () => {
  it('identifies Google accounts', () => {
    expect(signupMethodFrom('google', undefined)).toBe('google');
  });

  it('identifies LINE accounts by the bridge marker', () => {
    // Supabase reports LINE users as email-provider — only user_metadata,
    // written by app/api/auth/line/callback, distinguishes them.
    expect(signupMethodFrom('email', 'line')).toBe('line');
  });

  it('falls back to email', () => {
    expect(signupMethodFrom('email', undefined)).toBe('email');
    expect(signupMethodFrom(null, null)).toBe('email');
    expect(signupMethodFrom(undefined, undefined)).toBe('email');
  });
});
