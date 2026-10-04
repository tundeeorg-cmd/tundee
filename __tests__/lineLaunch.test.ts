/**
 * Where a "sign in with LINE" tap goes — lib/line/launch, shared by /auth and
 * /start so the two buttons cannot drift.
 */

import { describe, it, expect } from 'vitest';
import { lineStartUrl, lineLaunch, iosLineHelp } from '@/lib/line/launch';
import { inspectUserAgent } from '@/lib/browser/inAppBrowser';
import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_PARAM } from '@/lib/preview/types';
import { INTAKE_PARAM } from '@/lib/intake/pendingIntake';

const ORIGIN = 'https://www.tundee.org';
const UA = {
  safari:      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  fbIos:       'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
  fbAndroid:   'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]',
  lineIos:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0',
};

describe('lineStartUrl', () => {
  it('carries next, consent, the guest session, the parked answers and the campaign', () => {
    const url = new URL(lineStartUrl(ORIGIN, {
      next: '/scholarships', preview: 'ENC', intake: 'abc', utmCampaign: 'fb_sept',
    }));
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/api/auth/line/start`);
    expect(url.searchParams.get('next')).toBe('/scholarships');
    expect(url.searchParams.get(CONSENT_PARAM)).toBe(CONSENT_VERSION);
    expect(url.searchParams.get(PREVIEW_PARAM)).toBe('ENC');
    expect(url.searchParams.get(INTAKE_PARAM)).toBe('abc');
    expect(url.searchParams.get('utm_campaign')).toBe('fb_sept');
  });

  it('leaves out what the visitor does not have', () => {
    const url = new URL(lineStartUrl(ORIGIN, { next: '/' }));
    expect(url.searchParams.has(PREVIEW_PARAM)).toBe(false);
    expect(url.searchParams.has(INTAKE_PARAM)).toBe(false);
    expect(url.searchParams.has('utm_campaign')).toBe(false);
  });
});

describe('lineLaunch', () => {
  const start = lineStartUrl(ORIGIN, { next: '/scholarships', preview: 'ENC' });

  it('goes straight to LINE from a real browser', () => {
    expect(lineLaunch(start, inspectUserAgent(UA.safari))).toEqual({ kind: 'navigate', url: start });
  });

  it("goes straight to LINE from LINE's own browser, where auto login works", () => {
    expect(lineLaunch(start, inspectUserAgent(UA.lineIos))).toEqual({ kind: 'navigate', url: start });
  });

  it('hands the whole flow to Chrome from the Facebook webview on Android, guest session included', () => {
    const launch = lineLaunch(start, inspectUserAgent(UA.fbAndroid));
    expect(launch.kind).toBe('navigate');
    const url = (launch as { url: string }).url;
    expect(url.startsWith('intent://www.tundee.org/api/auth/line/start')).toBe(true);
    expect(url).toContain('package=com.android.chrome');
    expect(url).toContain(`${PREVIEW_PARAM}=ENC`);
  });

  it('shows the way to Safari from the Facebook webview on iOS, rather than a dead-end flow', () => {
    expect(lineLaunch(start, inspectUserAgent(UA.fbIos))).toEqual({ kind: 'ios_webview_help' });
  });
});

// ─── iPhone browsers other than Safari ───────────────────────────────────────
// Confirmed on 2026-10-04: in Chrome for iPhone LINE showed its App Store
// banner and email + password form, then a QR page; Safari on the same phone
// opened the LINE app. LINE cannot see its app from these browsers.

const IOS_OTHER = {
  chrome:  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  edge:    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15',
  google:  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/337.0.674875411 Mobile/15E148 Safari/604.1',
};
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

describe('iPhone browsers other than Safari', () => {
  const start = lineStartUrl(ORIGIN, { next: '/scholarships' });

  it.each(Object.entries(IOS_OTHER))('%s: LINE is sent to Safari, Google still works', (_name, ua) => {
    const iab = inspectUserAgent(ua);
    expect(iab.iosOtherBrowser).toBe(true);
    expect(iab.lineAppToAppBlocked).toBe(true);
    // Not a webview: Google sign-in is allowed here and must stay visible.
    expect(iab.isInApp).toBe(false);
    expect(iab.googleBlocked).toBe(false);
    expect(lineLaunch(start, iab)).toEqual({ kind: 'ios_webview_help' });
  });

  it('leaves Safari, Chrome on Android, and the webviews as they were', () => {
    expect(inspectUserAgent(UA.safari).iosOtherBrowser).toBe(false);
    expect(lineLaunch(start, inspectUserAgent(UA.safari)).kind).toBe('navigate');

    const android = inspectUserAgent(CHROME_ANDROID);
    expect(android.iosOtherBrowser).toBe(false);
    expect(lineLaunch(start, android)).toEqual({ kind: 'navigate', url: start });

    // An in-app webview is still identified as its app, not as "other browser".
    const fb = inspectUserAgent(UA.fbIos);
    expect(fb.app).toBe('facebook');
    expect(fb.iosOtherBrowser).toBe(false);
  });

  it('tells Chrome users to copy the link, because Chrome has no "Open in Safari"', () => {
    const chromeHelp = iosLineHelp(inspectUserAgent(IOS_OTHER.chrome), true);
    expect(chromeHelp).toContain('คัดลอกลิงก์');
    expect(chromeHelp).toContain('Safari');
    expect(chromeHelp).not.toContain('จุด 3 จุด');
    // The Facebook webview keeps its menu-based instruction.
    expect(iosLineHelp(inspectUserAgent(UA.fbIos), true)).toContain('จุด 3 จุด');
  });
});
