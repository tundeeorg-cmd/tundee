/**
 * In-app browser (embedded webview) detection.
 *
 * 100% of TunDee's paid traffic arrives inside the Facebook in-app browser.
 * Google refuses OAuth from embedded webviews with `disallowed_useragent`, and
 * that refusal happens on Google's own domain — the user never comes back, so
 * the app cannot show them an error. Offering a Google button that cannot work
 * is the single most expensive thing on the signup screen.
 *
 * This is user-agent sniffing, which is normally a smell. It is the right tool
 * here because the constraint being detected IS a user-agent policy: Google
 * decides by UA string, so matching that string is matching the actual rule.
 *
 * Fails OPEN: an unrecognised UA is treated as a normal browser. A false
 * positive hides a working Google button; a false negative shows a broken one.
 * Neither is good, but the second is what we have today.
 */

export type InAppBrowserApp =
  | 'facebook'
  | 'instagram'
  | 'line'
  | 'tiktok'
  | 'twitter'
  | 'unknown';

export interface InAppBrowserInfo {
  /** True when the page is running inside an embedded webview. */
  isInApp: boolean;
  /** Which host app, when identifiable. */
  app: InAppBrowserApp | null;
  /** True when Google OAuth will be rejected as disallowed_useragent. */
  googleBlocked: boolean;
  /** iOS cannot be escaped programmatically; Android can. */
  platform: 'ios' | 'android' | 'other';
}

/**
 * Markers, in the order Google's own policy treats them:
 *   FBAN / FBAV / FB_IAB — Facebook app family
 *   Instagram            — Instagram in-app browser
 *   Line/                — LINE. The trailing slash matters: "Line" alone
 *                          appears in unrelated UAs (e.g. "Streamline").
 *   musical_ly / BytedanceWebview — TikTok
 */
function detectApp(ua: string): InAppBrowserApp | null {
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i.test(ua)) return 'facebook';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/Twitter/i.test(ua)) return 'twitter';

  // Generic Android WebView: "; wv)" is the marker Chrome sets for embedded
  // webviews. Caught last so a named app above always wins.
  if (/;\s*wv\)/i.test(ua)) return 'unknown';

  return null;
}

function detectPlatform(ua: string): 'ios' | 'android' | 'other' {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** Inspect a user-agent string. Pure, so it can be tested and used server-side. */
export function inspectUserAgent(ua: string | null | undefined): InAppBrowserInfo {
  if (!ua) {
    return { isInApp: false, app: null, googleBlocked: false, platform: 'other' };
  }

  const app = detectApp(ua);
  return {
    isInApp:       app !== null,
    app,
    // Every embedded webview is rejected by Google's policy, not just Facebook's.
    googleBlocked: app !== null,
    platform:      detectPlatform(ua),
  };
}

/** Browser-side convenience. Returns the safe default during SSR. */
export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof navigator === 'undefined') {
    return { isInApp: false, app: null, googleBlocked: false, platform: 'other' };
  }
  return inspectUserAgent(navigator.userAgent);
}

/**
 * A URL that escapes the webview into the real browser, where one exists.
 *
 * Android: an intent:// URL hands the page to Chrome. This genuinely works.
 * iOS:     nothing does. Safari cannot be launched from inside a webview, so
 *          the caller must show instructions instead. Returning null rather
 *          than a link that silently does nothing is the honest answer.
 */
export function escapeToRealBrowserUrl(
  currentUrl: string,
  platform: 'ios' | 'android' | 'other',
): string | null {
  if (platform !== 'android') return null;

  try {
    const url = new URL(currentUrl);
    const withoutScheme = `${url.host}${url.pathname}${url.search}`;
    return `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}
