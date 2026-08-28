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

describe('escapeToRealBrowserUrl', () => {
  it('builds a Chrome intent URL on Android', () => {
    const url = escapeToRealBrowserUrl('https://www.tundee.org/auth?from=signup', 'android');
    expect(url).toBe(
      'intent://www.tundee.org/auth?from=signup#Intent;scheme=https;package=com.android.chrome;end',
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
