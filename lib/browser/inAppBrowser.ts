/**
 * In-app browser (embedded webview) detection.
 *
 * Nearly all of TunDee's paid traffic arrives inside the Facebook, Instagram or
 * TikTok in-app browser. Three separate things break there, and this module is
 * what the whole auth UI reads to decide what to show:
 *
 *   • Google refuses OAuth from embedded webviews with `disallowed_useragent`,
 *     and that refusal happens on Google's own domain — the user never comes
 *     back, so the app cannot show them an error.
 *   • LINE's app-to-app auto login needs a Universal Link / App Link to fire,
 *     which third-party webviews block. LINE then falls back to its email +
 *     password form, which most Thai users cannot complete because they signed
 *     up for LINE with a phone number.
 *   • Cookies do not cross from a webview into the real browser, so anything
 *     that survives the jump has to travel in the URL. See buildEscapeUrl.
 *
 * This is user-agent sniffing, which is normally a smell. It is the right tool
 * here because the constraint being detected IS a user-agent policy: Google
 * decides by UA string, so matching that string is matching the actual rule.
 *
 * Fails OPEN: an unrecognised UA is treated as a normal browser. A false
 * positive hides a working Google button; a false negative shows a broken one.
 */

export type InAppBrowserApp =
  | 'facebook'
  | 'messenger'
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
  /**
   * True when LINE's app-to-app auto login cannot fire, so tapping LINE would
   * land the user on the email + password form this whole change exists to
   * avoid. False inside LINE's OWN webview: LINE documents auto login as
   * working from there, and it is the one embedded browser where it does.
   */
  lineAppToAppBlocked: boolean;
  /** iOS cannot be escaped programmatically; Android can. */
  platform: 'ios' | 'android' | 'other';
}

const NOT_IN_APP: InAppBrowserInfo = {
  isInApp:             false,
  app:                 null,
  googleBlocked:       false,
  lineAppToAppBlocked: false,
  platform:            'other',
};

/**
 * Markers, in the order Google's own policy treats them:
 *   Messenger*           — Messenger. Checked BEFORE Facebook: Messenger's UA
 *                          also carries FBAN/FBAV, so the generic Facebook test
 *                          would otherwise swallow it. Same webview engine and
 *                          the same breakage — it is split out because the
 *                          conversion data needs to tell the two apps apart.
 *   FBAN / FBAV / FB_IAB — the rest of the Facebook app family
 *   Instagram            — Instagram in-app browser
 *   Line/                — LINE. The trailing slash matters: "Line" alone
 *                          appears in unrelated UAs (e.g. "Streamline").
 *   musical_ly / BytedanceWebview — TikTok
 */
function detectApp(ua: string): InAppBrowserApp | null {
  if (/MessengerForiOS|MessengerLiteForiOS|Orca-Android|MESSENGER/i.test(ua)) return 'messenger';
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
  if (!ua) return NOT_IN_APP;

  const app = detectApp(ua);
  return {
    isInApp:       app !== null,
    app,
    // Every embedded webview is rejected by Google's policy, not just Facebook's.
    googleBlocked: app !== null,
    // LINE's own browser is the exception: auto login works there.
    lineAppToAppBlocked: app !== null && app !== 'line',
    platform:      detectPlatform(ua),
  };
}

/** Browser-side convenience. Returns the safe default during SSR. */
export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof navigator === 'undefined') return NOT_IN_APP;
  return inspectUserAgent(navigator.userAgent);
}

/**
 * A URL that escapes the webview into the real browser, where one exists.
 *
 * Android: an intent:// URL hands the page to Chrome. This genuinely works.
 * iOS:     nothing does. Safari cannot be launched from inside a webview, so
 *          the caller must show instructions instead. Returning null rather
 *          than a link that silently does nothing is the honest answer.
 *
 * `extraParams` is the load-bearing part. Chrome and the Facebook webview have
 * SEPARATE COOKIE JARS, so the visitor's `tundee_preview` cookie — their /start
 * answers — does not survive the jump. Anything that must survive has to travel
 * in the query string. Escaping the webview has to cost the student nothing, or
 * they land on a form that re-asks their grade, GPA and province, which is the
 * drop-off this whole change exists to remove.
 *
 * `S.browser_fallback_url` matters too: on a device with no Chrome the intent
 * would otherwise dead-end, and Android instead reopens the plain https URL.
 */
export function buildEscapeUrl(
  currentUrl: string,
  platform: 'ios' | 'android' | 'other',
  extraParams: Record<string, string | null | undefined> = {},
): string | null {
  if (platform !== 'android') return null;

  try {
    const url = new URL(currentUrl);
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) url.searchParams.set(key, value);
    }

    const https = url.toString();
    const withoutScheme = `${url.host}${url.pathname}${url.search}`;
    return (
      `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(https)};end`
    );
  } catch {
    return null;
  }
}

/**
 * Kept as the old name so existing call sites and tests keep working. New code
 * should call buildEscapeUrl, which can carry the guest session across.
 */
export function escapeToRealBrowserUrl(
  currentUrl: string,
  platform: 'ios' | 'android' | 'other',
): string | null {
  return buildEscapeUrl(currentUrl, platform);
}
