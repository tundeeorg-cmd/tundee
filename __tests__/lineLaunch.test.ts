/**
 * Where a "sign in with LINE" tap goes — lib/line/launch, shared by /auth and
 * /start so the two buttons cannot drift.
 */

import { describe, it, expect } from 'vitest';
import { lineStartUrl, lineLaunch } from '@/lib/line/launch';
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
