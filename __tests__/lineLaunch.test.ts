/**
 * Where a "sign in with LINE" tap goes — lib/line/launch, shared by /auth and
 * /start so the two buttons cannot drift.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  lineStartUrl, lineLaunch, iosLineHelp, androidLineHelp, followLineLaunch, CHROME_HANDOFF_WAIT_MS,
} from '@/lib/line/launch';
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

// ─── Android browsers other than Chrome ──────────────────────────────────────
// Confirmed on 2026-10-05: HUAWEI Browser 17 on an Android phone with LINE and
// Chrome installed got LINE's Google Play banner and email + password form;
// Chrome on the same phone opened the LINE app.

const ANDROID_OTHER = {
  huawei:  'Mozilla/5.0 (Linux; Android 12; NOH-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/17.0.7.302 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  xiaomi:  'Mozilla/5.0 (Linux; U; Android 13; 2201117TY Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.10.1-gn',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
};

describe('Android browsers other than Chrome', () => {
  const start = lineStartUrl(ORIGIN, { next: '/scholarships', preview: 'ENC' });

  it.each(Object.entries(ANDROID_OTHER))('%s: LINE is handed to Chrome, Google still works', (_name, ua) => {
    const iab = inspectUserAgent(ua);
    expect(iab.androidOtherBrowser).toBe(true);
    expect(iab.lineAppToAppBlocked).toBe(true);
    expect(iab.isInApp).toBe(false);
    expect(iab.googleBlocked).toBe(false);
    const launch = lineLaunch(start, iab);
    expect(launch.kind).toBe('navigate');
    const url = (launch as { url: string }).url;
    expect(url.startsWith('intent://www.tundee.org/api/auth/line/start')).toBe(true);
    expect(url).toContain('package=com.android.chrome');
    // The /start answers travel into Chrome, which has none of this browser's cookies.
    expect(url).toContain(`${PREVIEW_PARAM}=ENC`);
  });

  it('Chrome itself still goes straight to LINE', () => {
    const chrome = inspectUserAgent(CHROME_ANDROID);
    expect(chrome.androidOtherBrowser).toBe(false);
    expect(lineLaunch(start, chrome)).toEqual({ kind: 'navigate', url: start });
  });
});

// ─── Following the hand-off ──────────────────────────────────────────────────
// HUAWEI Browser 17 (2026-10-05) ignored the intent and left the spinner
// turning forever. The hand-off is now a real link click, and its outcome is
// checked: still in front after the wait means Chrome never took over.

describe('followLineLaunch', () => {
  let clicked: string[];
  let visibility: 'visible' | 'hidden';
  let location: { href: string };

  beforeEach(() => {
    vi.useFakeTimers();
    clicked = [];
    visibility = 'visible';
    location = { href: 'https://www.tundee.org/auth' };
    const body = { appendChild: () => {}, };
    vi.stubGlobal('document', {
      body,
      get visibilityState() { return visibility; },
      createElement: () => {
        const el = { href: '', style: {} as Record<string, string>, click() { clicked.push(el.href); }, remove() {} };
        return el;
      },
    });
    vi.stubGlobal('window', { location, setTimeout: globalThis.setTimeout });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('an ordinary https URL is a plain navigation', () => {
    const settled = vi.fn();
    followLineLaunch('https://www.tundee.org/api/auth/line/start?next=%2F', settled);
    expect(location.href).toBe('https://www.tundee.org/api/auth/line/start?next=%2F');
    expect(clicked).toEqual([]);
    vi.advanceTimersByTime(CHROME_HANDOFF_WAIT_MS * 2);
    expect(settled).not.toHaveBeenCalled();
  });

  it('the Chrome intent is a real link click, not a location assignment', () => {
    followLineLaunch('intent://www.tundee.org/x#Intent;scheme=https;package=com.android.chrome;end', () => {});
    expect(clicked).toEqual(['intent://www.tundee.org/x#Intent;scheme=https;package=com.android.chrome;end']);
    expect(location.href).toBe('https://www.tundee.org/auth');
  });

  it('reports stuck when the page is still in front after the wait — the HUAWEI case', () => {
    const settled = vi.fn();
    followLineLaunch('intent://www.tundee.org/x#Intent;end', settled);
    vi.advanceTimersByTime(CHROME_HANDOFF_WAIT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(settled).toHaveBeenCalledWith(true);
  });

  it('reports a hand-off when Chrome took over and the page went to the background', () => {
    const settled = vi.fn();
    followLineLaunch('intent://www.tundee.org/x#Intent;end', settled);
    visibility = 'hidden';
    vi.advanceTimersByTime(CHROME_HANDOFF_WAIT_MS);
    expect(settled).toHaveBeenCalledWith(false);
  });

  it('the help it leads to says to copy the link into Chrome', () => {
    expect(androidLineHelp(true)).toContain('คัดลอกลิงก์');
    expect(androidLineHelp(true)).toContain('Chrome');
  });

  it('both LINE buttons use it, and stop the spinner either way', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['app/auth/AuthForm.tsx', 'components/start/LineQuickStart.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toContain('followLineLaunch(launch.url');
      expect(src, file).not.toMatch(/window\.location\.href = launch\.url/);
      expect(src, file).toContain('androidLineHelp(');
    }
  });
});
