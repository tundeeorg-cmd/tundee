/**
 * lib/adTracking.ts — the /start-funnel-specific wrappers over lib/analytics.
 *
 * trackFormResultsSeen is the one that matters most here: it fires Lead, the
 * event ad delivery optimizes against, and the ticket that moved it to this
 * touchpoint was explicit that it must fire exactly once per session, never
 * on a re-render or a resubmitted form.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lead = vi.fn();
const initiateCheckout = vi.fn();
const viewContent = vi.fn();
const completeRegistration = vi.fn();

vi.mock('@/lib/analytics', () => ({
  lead: (...args: unknown[]) => lead(...args),
  initiateCheckout: (...args: unknown[]) => initiateCheckout(...args),
  viewContent: (...args: unknown[]) => viewContent(...args),
  completeRegistration: (...args: unknown[]) => completeRegistration(...args),
  search: vi.fn(),
}));

vi.mock('@/lib/research/funnel', () => ({ logFunnelEvent: vi.fn() }));

import {
  trackStartPageView,
  trackFormResultsSeen,
  trackAuthPageView,
  trackSignupComplete,
} from '@/lib/adTracking';

function installSessionStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  vi.stubGlobal('window', { sessionStorage: mock });
  vi.stubGlobal('sessionStorage', mock);
  return store;
}

beforeEach(() => {
  installSessionStorage();
  lead.mockClear();
  initiateCheckout.mockClear();
  viewContent.mockClear();
  completeRegistration.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('trackStartPageView', () => {
  it('fires ViewContent with content_name start_page, no content_ids', () => {
    trackStartPageView();
    expect(viewContent).toHaveBeenCalledWith({ contentName: 'start_page' });
  });
});

describe('trackFormResultsSeen', () => {
  it('fires Lead with the match count as value', () => {
    trackFormResultsSeen(12);
    expect(lead).toHaveBeenCalledWith({ value: 12 });
  });

  it('fires only once per session — a second call is a no-op', () => {
    trackFormResultsSeen(12);
    trackFormResultsSeen(12);
    trackFormResultsSeen(5); // even with a different value
    expect(lead).toHaveBeenCalledTimes(1);
  });

  it('still fires once even when sessionStorage throws (private mode, embedded webview)', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      },
    });
    expect(() => trackFormResultsSeen(3)).not.toThrow();
    expect(lead).toHaveBeenCalledWith({ value: 3 });
  });
});

describe('trackAuthPageView', () => {
  it('fires InitiateCheckout with no params — content_name is fixed downstream', () => {
    trackAuthPageView();
    expect(initiateCheckout).toHaveBeenCalledWith();
  });
});

describe('trackSignupComplete', () => {
  it('translates the cookie\'s "email" method to "email_otp" for the ad platforms', () => {
    trackSignupComplete({ method: 'email', inWebview: true, app: 'facebook' });
    expect(completeRegistration).toHaveBeenCalledWith('email_otp', { inWebview: true, app: 'facebook' });
  });

  it('passes google/line/password through unchanged', () => {
    trackSignupComplete({ method: 'line', inWebview: false, app: null });
    expect(completeRegistration).toHaveBeenCalledWith('line', { inWebview: false, app: null });
  });
});
