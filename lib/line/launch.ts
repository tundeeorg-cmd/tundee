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
  // HUAWEI Browser ignores intent:// outright, so it gets Chrome's own URL
  // scheme instead — an experiment (2026-10-05). If that is ignored as well,
  // followLineLaunch notices and the copy-link help appears as before.
  if (iab.platform === 'android' && iab.huaweiBrowser) {
    return { kind: 'navigate', url: `googlechrome://navigate?url=${encodeURIComponent(startUrl)}` };
  }
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

/** How long a Chrome hand-off gets before the page assumes it went nowhere. */
export const CHROME_HANDOFF_WAIT_MS = 2500;

/**
 * Follow a LineLaunch `navigate` URL.
 *
 * An https URL is an ordinary navigation: the page goes away, nothing more to do.
 *
 * An app hand-off — Android `intent://`, or `googlechrome://` for HUAWEI
 * Browser (see lineLaunch) — is followed by clicking a
 * real link rather than assigning window.location. Some browsers only honour an
 * app-switching link when it is an actual link activation inside the tap — and
 * some ignore intents altogether: HUAWEI Browser 17 on 2026-10-05 left the
 * spinner turning with nothing happening. So the outcome is checked: if the
 * page is still in front after CHROME_HANDOFF_WAIT_MS, Chrome did not take
 * over, and `onSettled(true)` lets the caller stop the spinner and show
 * androidLineHelp. `onSettled(false)` means the hand-off happened (the page
 * was hidden) — the spinner should stop too, for when the student comes back.
 */
export function followLineLaunch(url: string, onSettled: (stuck: boolean) => void): void {
  // Anything but http(s) hands off to another app (intent://, googlechrome://).
  if (/^https?:/i.test(url)) {
    window.location.href = url;
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => onSettled(document.visibilityState === 'visible'), CHROME_HANDOFF_WAIT_MS);
}

/** Shown on Android when the hand-off to Chrome did not happen. */
export function androidLineHelp(th: boolean): string {
  return th
    ? 'เปิด Chrome อัตโนมัติไม่สำเร็จ ให้กด "คัดลอกลิงก์" แล้ววางในแอป Chrome เพื่อเข้าสู่ระบบด้วย LINE'
    : "Couldn't open Chrome automatically. Tap \"Copy link\", then paste it into Chrome to sign in with LINE.";
}
