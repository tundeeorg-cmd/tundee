/**
 * How sign-in is laid out inside a third-party in-app browser (Facebook,
 * Instagram, Messenger, TikTok, …), and the Thai the student reads there. Pure.
 *
 * Why email comes first there: LINE's one-tap login needs a hand-off to the LINE app
 * that these webviews block, so LINE falls back to its web form, which asks for an
 * email and password most Thai LINE users do not have (they registered with a phone
 * number). The Chrome hand-off on Android (lib/line/launch) was confirmed on a real
 * phone to do nothing from the Facebook browser. A six-digit email code is typed into
 * the page the student is already on, so nothing leaves the webview and their /start
 * answers stay where they are.
 *
 * Outside an in-app browser nothing here applies: LINE stays first.
 * LINE's own browser is not "blocked" (inspectUserAgent), so it is left alone too.
 */

import type { InAppBrowserInfo } from '@/lib/browser/inAppBrowser';

/** Email first when LINE's app hand-off cannot fire inside a webview. */
export function emailFirstLogin(iab: InAppBrowserInfo): boolean {
  return iab.isInApp && iab.lineAppToAppBlocked;
}

/** "Facebook", "Instagram", or null when the host app has no name worth printing. */
function appName(iab: InAppBrowserInfo): 'Facebook' | 'Instagram' | null {
  if (iab.app === 'facebook' || iab.app === 'messenger') return 'Facebook';
  if (iab.app === 'instagram') return 'Instagram';
  return null;
}

/** The notice above the email form. */
export function inAppNotice(iab: InAppBrowserInfo): string {
  const name = appName(iab);
  return name
    ? `คุณกำลังเปิดทุนดีในแอป ${name} ซึ่งเข้าสู่ระบบด้วย LINE แบบกดครั้งเดียวไม่ได้`
    : 'คุณกำลังเปิดทุนดีในแอปนี้ ซึ่งเข้าสู่ระบบด้วย LINE แบบกดครั้งเดียวไม่ได้';
}

/** Thai copy for the in-app sign-in, verbatim from the product brief. */
export const IN_APP_COPY = {
  emailButton: 'เข้าสู่ระบบด้วยอีเมล (รับรหัส 6 หลัก)',
  codeSent: (email: string) =>
    `ส่งรหัส 6 หลักไปที่ ${email} แล้ว กรอกรหัสด้านล่างเพื่อเข้าสู่ระบบ คำตอบของคุณยังอยู่ครบ`,
  resend: 'ส่งรหัสอีกครั้ง',
  resendWait: (seconds: number) => `ส่งใหม่ได้ใน ${seconds} วินาที`,
  wrongCode: 'รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง',
  androidChromeButton: 'เปิดใน Chrome เพื่อเข้าสู่ระบบด้วย LINE',
  iosInstruction: 'หากต้องการใช้ LINE: กดปุ่ม ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์"',
  lineNote:
    'ในแอปนี้ LINE จะขอให้กรอกอีเมลและรหัสผ่าน LINE หากคุณสมัคร LINE ด้วยเบอร์โทร แนะนำให้ใช้อีเมลแทน',
} as const;

/**
 * What every sign-in funnel event says about the browser, and nothing about the
 * person: no email, no code, no id. `surface` is where on the site it happened.
 */
export function loginEventContext(
  iab: InAppBrowserInfo,
  surface: 'start' | 'auth',
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    surface,
    in_app: iab.isInApp,
    app: iab.app,
    platform: iab.platform,
    email_first: emailFirstLogin(iab),
    ...extra,
  };
}
