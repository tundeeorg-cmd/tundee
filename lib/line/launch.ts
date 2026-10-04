/**
 * Where a tap on a "sign in with LINE" button goes.
 *
 * Shared by /auth (app/auth/AuthForm.tsx) and /start
 * (components/start/LineQuickStart.tsx), so the two buttons cannot drift: the
 * same URL, carrying the same guest session and campaign, escaping the same
 * webviews the same way.
 *
 * LINE's one-tap, app-to-app login needs a Universal Link (iOS) or App Link
 * (Android), and third-party webviews — Facebook, Instagram, TikTok, Messenger —
 * block both, leaving LINE's email + password form, which most Thai students
 * cannot complete. So inside one of those:
 *   • Android: hand the whole flow to Chrome with an intent URL. One tap.
 *   • iOS: Safari cannot be opened programmatically, so show how to get there
 *     instead of starting a flow that is guaranteed to dead-end.
 * LINE's own in-app browser is not blocked; auto login works there.
 */

import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import { PREVIEW_PARAM } from '@/lib/preview/types';
import { INTAKE_PARAM } from '@/lib/intake/pendingIntake';
import { buildEscapeUrl, type InAppBrowserInfo } from '@/lib/browser/inAppBrowser';

export interface LineStartContext {
  /** Same-origin path to land on after sign-in. */
  next: string;
  /** The encoded /start answers, when the visitor has them. */
  preview?: string | null;
  /** The parked-answers id, for a browser switch that loses the cookie. */
  intake?: string | null;
  utmCampaign?: string | null;
}

/** The absolute /api/auth/line/start URL for this visitor. */
export function lineStartUrl(origin: string, ctx: LineStartContext): string {
  const url = new URL('/api/auth/line/start', origin);
  url.searchParams.set('next', ctx.next);
  // The caller has just recorded consent; the param carries it across a
  // browser switch, where the cookie does not exist.
  url.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
  if (ctx.preview) url.searchParams.set(PREVIEW_PARAM, ctx.preview);
  if (ctx.intake) url.searchParams.set(INTAKE_PARAM, ctx.intake);
  if (ctx.utmCampaign) url.searchParams.set('utm_campaign', ctx.utmCampaign);
  return url.toString();
}

export type LineLaunch =
  | { kind: 'navigate'; url: string }
  | { kind: 'ios_webview_help' };

/**
 * What to do with a tap. Always a same-tab navigation, never window.open:
 * popups are blocked on mobile and inside every webview, and a blocked popup
 * looks like a dead button.
 */
export function lineLaunch(startUrl: string, iab: InAppBrowserInfo): LineLaunch {
  if (!iab.lineAppToAppBlocked) return { kind: 'navigate', url: startUrl };
  if (iab.platform === 'android') {
    const escape = buildEscapeUrl(startUrl, 'android');
    if (escape) return { kind: 'navigate', url: escape };
  }
  return { kind: 'ios_webview_help' };
}

/**
 * The instruction shown instead of starting LINE on iOS, where the hand-off
 * cannot fire from the current browser.
 *
 * Facebook, Instagram and TikTok's in-app browsers have an "Open in Safari"
 * (or "Open in browser") item behind their ••• menu. Chrome, Firefox and the
 * other iPhone browsers do not, so for those the way out is the copy-link
 * button the help box always carries.
 */
export function iosLineHelp(iab: InAppBrowserInfo, th: boolean): string {
  if (iab.iosOtherBrowser) {
    return th
      ? 'LINE เปิดแอปจากเบราว์เซอร์นี้ไม่ได้ ให้กด "คัดลอกลิงก์" แล้ววางในแอป Safari เพื่อเข้าสู่ระบบด้วย LINE'
      : 'LINE cannot open its app from this browser. Tap "Copy link", then paste it into Safari to sign in with LINE.';
  }
  return th
    ? 'เพื่อใช้ LINE ให้กดจุด 3 จุดมุมขวาบน แล้วเลือก "เปิดใน Safari"'
    : 'To use LINE, tap the ••• at the top right and choose "Open in Safari".';
}
