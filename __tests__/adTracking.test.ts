/**
 * lib/adTracking.ts — the /start-funnel-specific wrappers over lib/analytics.
 *
 * trackScholarshipOpened is the one that matters most here: it fires Lead, the
 * event ad delivery optimizes against (opening a scholarship's detail page), and
 * it must fire at most once per session, never on a re-render or a second page.
 * trackPersonalized is the matcher's own custom event and is guarded the same way.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lead = vi.fn();
const personalized = vi.fn();
const initiateCheckout = vi.fn();
const viewContent = vi.fn();
const completeRegistration = vi.fn();

vi.mock('@/lib/analytics', () => ({
  lead: (...args: unknown[]) => lead(...args),
  personalized: (...args: unknown[]) => personalized(...args),
  initiateCheckout: (...args: unknown[]) => initiateCheckout(...args),
  viewContent: (...args: unknown[]) => viewContent(...args),
  completeRegistration: (...args: unknown[]) => completeRegistration(...args),
  search: vi.fn(),
}));

vi.mock('@/lib/research/funnel', () => ({ logFunnelEvent: vi.fn() }));

import {
  trackStartPageView,
  trackScholarshipOpened,
  trackPersonalized,
  trackMatcherCompleted,
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
  personalized.mockClear();
  initiateCheckout.mockClear();
  viewContent.mockClear();
  completeRegistration.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('trackStartPageView', () => {
  it('fires ViewContent with content_name start_browse, no content_ids', () => {
    trackStartPageView();
    expect(viewContent).toHaveBeenCalledWith({ contentName: 'start_browse' });
  });
});

describe('trackScholarshipOpened — Lead', () => {
  it('fires Lead with the scholarship that was opened', () => {
    trackScholarshipOpened('TD-0001');
    expect(lead).toHaveBeenCalledWith({ scholarshipId: 'TD-0001', source: 'scholarship_detail_opened' });
  });

  it('fires only once per session, whichever scholarships are opened next', () => {
    trackScholarshipOpened('TD-0001');
    trackScholarshipOpened('TD-0001');
    trackScholarshipOpened('TD-0002');
    expect(lead).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a scholarship id', () => {
    trackScholarshipOpened('');
    expect(lead).not.toHaveBeenCalled();
  });

  it('still fires once even when sessionStorage throws (private mode, embedded webview)', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      },
    });
    expect(() => trackScholarshipOpened('TD-0003')).not.toThrow();
    expect(lead).toHaveBeenCalledWith({ scholarshipId: 'TD-0003', source: 'scholarship_detail_opened' });
  });
});

describe('trackPersonalized — the matcher finished', () => {
  it('fires the custom Personalized event with the match count, and never Lead', () => {
    trackPersonalized(12);
    expect(personalized).toHaveBeenCalledWith({ matchCount: 12 });
    expect(lead).not.toHaveBeenCalled();
  });

  it('fires only once per session', () => {
    trackPersonalized(12);
    trackPersonalized(5);
    expect(personalized).toHaveBeenCalledTimes(1);
  });

  it('is independent of Lead: one does not use up the other', () => {
    trackScholarshipOpened('TD-0001');
    trackPersonalized(7);
    expect(lead).toHaveBeenCalledTimes(1);
    expect(personalized).toHaveBeenCalledTimes(1);
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


describe('trackMatcherCompleted — Lead for a finished /start matcher', () => {
  it('fires Personalized and one matcher_completed Lead with the top result', () => {
    trackMatcherCompleted(12, ['TD-0100', 'TD-0101']);
    expect(personalized).toHaveBeenCalledTimes(1);
    expect(lead).toHaveBeenCalledTimes(1);
    expect(lead).toHaveBeenCalledWith({ scholarshipId: 'TD-0100', source: 'matcher_completed' });
  });

  it('is once per session, and shares the Lead guard with a detail-page open', () => {
    trackMatcherCompleted(12, ['TD-0100']);
    trackMatcherCompleted(12, ['TD-0100']);
    trackScholarshipOpened('TD-0200');
    expect(lead).toHaveBeenCalledTimes(1);
  });

  it('a detail-page Lead earlier in the session means the matcher adds none', () => {
    trackScholarshipOpened('TD-0200');
    trackMatcherCompleted(3, ['TD-0100']);
    expect(lead).toHaveBeenCalledTimes(1);
    expect(lead).toHaveBeenCalledWith({ scholarshipId: 'TD-0200', source: 'scholarship_detail_opened' });
  });

  it('copes with an empty result list', () => {
    trackMatcherCompleted(0, []);
    expect(lead).toHaveBeenCalledWith({ scholarshipId: 'none', source: 'matcher_completed' });
  });
});
