/**
 * In-app browser detection.
 *
 * The UA strings below are real ones captured from the apps in question. They
 * are the contract: if Google's policy or an app's UA changes, this file is
 * where that shows up.
 */

import { describe, it, expect } from 'vitest';
import {
  inspectUserAgent,
  escapeToRealBrowserUrl,
  buildEscapeUrl,
} from '@/lib/browser/inAppBrowser';

const UA = {
  facebookIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0.29.109;FBBV/510301747]',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 10; SM-A105F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.30.113;]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113',
  line:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.14.0',
  tiktok:
    'Mozilla/5.0 (Linux; Android 11; SM-A125F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.0.0 Mobile Safari/537.36 musical_ly_2022905040 JsSdk/1.0 BytedanceWebview/d8a21c6',
  messengerIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/430.0.0.29.109;FBBV/510301747]',
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 11; SM-A125F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/430.0.0.29.109;]',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 9; ANE-LX1 Build/HUAWEIANE-L21; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 Mobile Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
};

describe('detects the apps that carry TunDee traffic', () => {
  it('recognises the Facebook in-app browser on both platforms', () => {
    const ios = inspectUserAgent(UA.facebookIOS);
    expect(ios.isInApp).toBe(true);
    expect(ios.app).toBe('facebook');
    expect(ios.platform).toBe('ios');

    const android = inspectUserAgent(UA.facebookAndroid);
    expect(android.app).toBe('facebook');
    expect(android.platform).toBe('android');
  });

  it('recognises Instagram, LINE and TikTok', () => {
    expect(inspectUserAgent(UA.instagram).app).toBe('instagram');
    expect(inspectUserAgent(UA.line).app).toBe('line');
    expect(inspectUserAgent(UA.tiktok).app).toBe('tiktok');
  });

  it('tells Messenger apart from the rest of the Facebook app family', () => {
    // Both Messenger UAs also carry FBAN/FB_IAB, so the generic Facebook test
    // would swallow them if it ran first. The distinction is not cosmetic: the
    // conversion breakdown is read per app, and Messenger silently folded into
    // "facebook" would hide whichever of the two actually converts.
    expect(inspectUserAgent(UA.messengerIOS).app).toBe('messenger');
    expect(inspectUserAgent(UA.messengerAndroid).app).toBe('messenger');
    expect(inspectUserAgent(UA.messengerIOS).googleBlocked).toBe(true);
    expect(inspectUserAgent(UA.messengerIOS).lineAppToAppBlocked).toBe(true);
  });

  it('falls back to a generic webview marker', () => {
    const info = inspectUserAgent(UA.androidWebView);
    expect(info.isInApp).toBe(true);
    expect(info.app).toBe('unknown');
  });

  it('prefers the named app over the generic webview marker', () => {
    // The Facebook Android UA contains "; wv)" too — the named app must win.
    expect(inspectUserAgent(UA.facebookAndroid).app).toBe('facebook');
    expect(inspectUserAgent(UA.tiktok).app).toBe('tiktok');
  });
});

describe('does NOT misfire on real browsers', () => {
  it('treats Chrome, Safari and desktop as normal browsers', () => {
    for (const ua of [UA.chromeAndroid, UA.safariIOS, UA.desktopChrome]) {
      const info = inspectUserAgent(ua);
      expect(info.isInApp, ua).toBe(false);
      expect(info.googleBlocked, ua).toBe(false);
      expect(info.app, ua).toBeNull();
    }
  });

  it('does not match "Line" inside an unrelated word', () => {
    // The trailing slash is load-bearing: without it, "Streamline" matches.
    const ua = 'Mozilla/5.0 (Linux; Android 13) Streamline/2.0 Chrome/119.0.0.0 Mobile Safari/537.36';
    expect(inspectUserAgent(ua).app).toBeNull();
  });

  it('fails open on a missing or empty user agent', () => {
    for (const ua of [null, undefined, '']) {
      const info = inspectUserAgent(ua);
      expect(info.isInApp).toBe(false);
      expect(info.googleBlocked).toBe(false);
    }
  });
});

describe('googleBlocked marks every embedded webview', () => {
  it('is true for all in-app browsers, not only Facebook', () => {
    for (const ua of [UA.facebookIOS, UA.instagram, UA.line, UA.tiktok, UA.androidWebView]) {
      expect(inspectUserAgent(ua).googleBlocked, ua).toBe(true);
    }
  });
});

describe('lineAppToAppBlocked exempts LINE\'s own browser', () => {
  it('is true in every third-party webview', () => {
    for (const ua of [UA.facebookIOS, UA.messengerIOS, UA.instagram, UA.tiktok, UA.androidWebView]) {
      expect(inspectUserAgent(ua).lineAppToAppBlocked, ua).toBe(true);
    }
  });

  it('is false inside LINE, where app-to-app login works', () => {
    // LINE documents auto login as working from its own in-app browser. Treating
    // it like Facebook's would demote the LINE button in the one embedded
    // browser where it is genuinely one tap.
    expect(inspectUserAgent(UA.line).lineAppToAppBlocked).toBe(false);
    expect(inspectUserAgent(UA.line).isInApp).toBe(true);
  });

  it('is false in a real browser', () => {
    for (const ua of [UA.chromeAndroid, UA.safariIOS, UA.desktopChrome]) {
      expect(inspectUserAgent(ua).lineAppToAppBlocked, ua).toBe(false);
    }
  });
});

describe('escapeToRealBrowserUrl', () => {
  it('builds a Chrome intent URL on Android', () => {
    const url = escapeToRealBrowserUrl('https://www.tundee.org/auth?from=signup', 'android');
    expect(url).toContain('intent://www.tundee.org/auth?from=signup#Intent;');
    expect(url).toContain('scheme=https');
    expect(url).toContain('package=com.android.chrome');
  });

  it('always carries a browser_fallback_url', () => {
    // Without it, a handset with no Chrome installed follows the intent into
    // nothing at all — a dead tap on the escape hatch, which is the one control
    // on the page a stuck student is most likely to reach for.
    const url = escapeToRealBrowserUrl('https://www.tundee.org/auth?from=signup', 'android');
    expect(url).toContain(
      `S.browser_fallback_url=${encodeURIComponent('https://www.tundee.org/auth?from=signup')}`,
    );
  });

  it('returns null on iOS, where no escape exists', () => {
    // Safari cannot be launched from inside a webview. Returning null forces
    // the caller to show instructions instead of a link that does nothing.
    expect(escapeToRealBrowserUrl('https://www.tundee.org/auth', 'ios')).toBeNull();
    expect(escapeToRealBrowserUrl('https://www.tundee.org/auth', 'other')).toBeNull();
  });

  it('returns null rather than throwing on a malformed URL', () => {
    expect(escapeToRealBrowserUrl('not a url', 'android')).toBeNull();
  });
});

describe('buildEscapeUrl carries the guest session across browsers', () => {
  const CURRENT = 'https://www.tundee.org/auth?from=signup&utm_campaign=fb_isan';

  it('puts the preview answers in the query string', () => {
    // Chrome and the Facebook webview have separate cookie jars, so the
    // tundee_preview cookie does NOT survive the jump. If the answers do not
    // travel in the URL, escaping the webview costs the student their grade,
    // GPA and province — which is the drop-off the escape hatch exists to avoid.
    const url = buildEscapeUrl(CURRENT, 'android', { p: 'ENCODED_PREVIEW' });
    expect(url).toContain('p=ENCODED_PREVIEW');
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(
      'https://www.tundee.org/auth?from=signup&utm_campaign=fb_isan&p=ENCODED_PREVIEW',
    )}`);
  });

  it('keeps parameters already on the page, so attribution is not lost', () => {
    const url = buildEscapeUrl(CURRENT, 'android', { p: 'X' });
    expect(url).toContain('utm_campaign=fb_isan');
  });

  it('skips null and empty extras rather than writing empty params', () => {
    const url = buildEscapeUrl('https://www.tundee.org/auth', 'android', {
      p: null, utm_campaign: undefined, next: '',
    });
    expect(url).toBe(
      'intent://www.tundee.org/auth#Intent;scheme=https;package=com.android.chrome;' +
      `S.browser_fallback_url=${encodeURIComponent('https://www.tundee.org/auth')};end`,
    );
  });

  it('still refuses on iOS even with extras to carry', () => {
    expect(buildEscapeUrl(CURRENT, 'ios', { p: 'X' })).toBeNull();
  });
});
