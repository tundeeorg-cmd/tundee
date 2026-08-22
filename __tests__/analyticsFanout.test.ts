/**
 * The shared analytics surface (lib/analytics) must fire every logical event to
 * ALL configured platforms. The bug this guards against is a call site reaching
 * one platform and silently missing the others — which is exactly what happened
 * to apply-link clicks before this module existed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setConsent } from '@/lib/analytics/consent';
import * as analytics from '@/lib/analytics';

const fbq = vi.fn();
const ttqTrack = vi.fn();
const ttqPage = vi.fn();
const gtag = vi.fn();

/** Names each platform received, so assertions read like the mapping table. */
const fbqEvents = () => fbq.mock.calls.filter(c => c[0] === 'track').map(c => c[1]);
const ttqEvents = () => ttqTrack.mock.calls.map(c => c[0]);
const gaEvents  = () => gtag.mock.calls.filter(c => c[0] === 'event').map(c => c[1]);

beforeEach(() => {
  // vitest runs in the node environment, so the whole window — including each
  // platform's global — has to be stubbed, exactly as metaAnalytics.test.ts does.
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'https://www.tundee.org/start', pathname: '/start', search: '' },
    fbq,
    ttq:  { track: ttqTrack, page: ttqPage },
    gtag,
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'test-event-id' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  setConsent('accepted');
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('every event reaches every platform', () => {
  it('pageView', () => {
    analytics.pageView();
    expect(fbqEvents()).toEqual(['PageView']);
    expect(ttqPage).toHaveBeenCalledTimes(1);   // TikTok's pageview is page(), not track()
    expect(gaEvents()).toEqual(['page_view']);
  });

  it('search', () => {
    analytics.search({ educationLevel: 'm6', gpa: 3.2, province: 'สุรินทร์' });
    expect(fbqEvents()).toEqual(['Search']);
    expect(ttqEvents()).toEqual(['Search']);
    expect(gaEvents()).toEqual(['search']);
  });

  it('viewContent', () => {
    analytics.viewContent({ contentIds: ['TD-0001'], numItems: 3 });
    expect(fbqEvents()).toEqual(['ViewContent']);
    expect(ttqEvents()).toEqual(['ViewContent']);
    expect(gaEvents()).toEqual(['view_search_results']);
  });

  it('lead maps to TikTok SubmitForm', () => {
    analytics.lead({ location: 'start_hero' });
    expect(fbqEvents()).toEqual(['Lead']);
    expect(ttqEvents()).toEqual(['SubmitForm']);
    expect(gaEvents()).toEqual(['generate_lead']);
  });

  it('completeRegistration', () => {
    analytics.completeRegistration('google');
    expect(fbqEvents()).toEqual(['CompleteRegistration']);
    expect(ttqEvents()).toEqual(['CompleteRegistration']);
    expect(gaEvents()).toEqual(['sign_up']);
  });

  it('submitApplication maps to TikTok SubmitForm — the event that used to be Meta-only', () => {
    analytics.submitApplication({ scholarshipId: 'TD-0001' });
    expect(fbqEvents()).toEqual(['SubmitApplication']);
    expect(ttqEvents()).toEqual(['SubmitForm']);
    expect(gaEvents()).toEqual(['submit_application']);
  });

  it('fires each event exactly once per platform — no double counting', () => {
    analytics.viewContent({ contentIds: ['TD-0001'] });
    expect(fbqEvents()).toHaveLength(1);
    expect(ttqEvents()).toHaveLength(1);
    expect(gaEvents()).toHaveLength(1);
  });
});

describe('consent gate', () => {
  it('fires nothing on any platform when the visitor rejected', () => {
    setConsent('rejected');
    analytics.pageView();
    analytics.search({ educationLevel: 'm6', gpa: 3.2, province: 'สุรินทร์' });
    analytics.viewContent({ contentIds: ['TD-0001'] });
    analytics.lead({ location: 'gate' });
    analytics.completeRegistration('line');
    analytics.submitApplication({ scholarshipId: 'TD-0001' });

    expect(fbq).not.toHaveBeenCalled();
    expect(ttqTrack).not.toHaveBeenCalled();
    expect(ttqPage).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('GPA is bucketed before it leaves the browser', () => {
  it('sends a band to every platform, never the raw value', () => {
    analytics.search({ educationLevel: 'm6', gpa: 3.27, province: 'สุรินทร์' });

    const payloads = [
      fbq.mock.calls.find(c => c[1] === 'Search')?.[2],
      ttqTrack.mock.calls[0]?.[1],
      gtag.mock.calls[0]?.[2],
    ] as Record<string, unknown>[];

    for (const p of payloads) {
      expect(p.gpa_band).toBe('3.00_3.49');
      expect(JSON.stringify(p)).not.toContain('3.27');
    }
  });
});
