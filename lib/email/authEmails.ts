/**
 * Auth email content, in version control.
 *
 * TunDee sends exactly TWO auth emails, and neither is sent at signup:
 *
 *   setPasswordEmail  — recovery. The only way back in for an account with no
 *                       usable password, including the 27 accounts created by
 *                       the magic-link flow this replaced.
 *   verifyEmailEmail  — sent ONLY when a student opts into email deadline
 *                       reminders. Nothing else in the product depends on a
 *                       verified address, so nothing else may trigger it.
 *
 * Signup itself sends no mail at all: email + password creates an active,
 * signed-in account in one request. That is the entire point — every send is a
 * step where a student in a Facebook webview leaves the browser and does not
 * come back.
 *
 * This module exists because a dashboard template is ONE template for everyone,
 * with no language argument and no profile row to read a preference from. So
 * per-user localisation is impossible there, and possible here.
 *
 * Thai is the default and always renders first. English appears as a smaller
 * secondary line beneath it — never as an alternative template, and never on
 * its own.
 *
 * Markup constraints, same as the dashboard version and for the same reason
 * (Gmail on Android is the dominant client for these users):
 *   • tables + inline CSS only — no flexbox, grid, classes, or media queries
 *   • max-width 600px, single column
 *   • line-height >= 1.7 on every Thai run, because Thai tone marks and vowels
 *     stack above and below the baseline and clip at tighter values
 *   • no emoji in subjects
 */

import type { Language } from '@/lib/types';

/** Matches the reminder sender already in use (app/api/send-reminders). */
export const AUTH_EMAIL_FROM = 'ทุนดี TunDee <noreply@tundee.org>';

const THAI_STACK = "'Sarabun','Noto Sans Thai','Leelawadee UI',Tahoma,Arial,sans-serif";
const LATIN_STACK = 'Arial,Helvetica,sans-serif';

export interface AuthEmail {
  subject: string;
  html: string;
  text: string;
}

/** Retained name — several call sites and tests refer to the old shape. */
export type MagicLinkEmail = AuthEmail;

interface AuthEmailCopy {
  subject: string;
  heading: string;
  body: string;
  button: string;
  /** English secondary line. Always present, never on its own. */
  en: string;
  notYou: string;
}

/**
 * Escapes a URL for safe interpolation into both an href and link text.
 *
 * The URL is minted by Supabase, not user input, but it carries query
 * parameters we forward (next, consent, preview, utm_campaign) — so it is
 * treated as untrusted on the way into HTML regardless of origin.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The shared shell for both emails.
 *
 * Markup constraints, unchanged from the dashboard version and for the same
 * reason (Gmail on Android is the dominant client for these users):
 *   • tables + inline CSS only — no flexbox, grid, classes, or media queries
 *   • max-width 600px, single column
 *   • line-height >= 1.7 on every Thai run, because Thai tone marks and vowels
 *     stack above and below the baseline and clip at tighter values
 *   • no emoji in subjects
 */
function render(url: string, copy: AuthEmailCopy): AuthEmail {
  const safeUrl = escapeHtml(url);

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;background-color:#f5f7fa;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e0e0e0;border-radius:12px;">
        <tr>
          <td style="background-color:#1b3a6b;height:4px;line-height:4px;font-size:0;border-radius:12px 12px 0 0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 24px 8px 24px;font-family:${THAI_STACK};font-size:20px;font-weight:bold;color:#0a2342;line-height:1.7;">
            ทุนดี TunDee
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 24px 0 24px;font-family:${THAI_STACK};font-size:22px;font-weight:bold;color:#0a2342;line-height:1.8;">
            ${copy.heading}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 0 32px;font-family:${THAI_STACK};font-size:16px;color:#3c4a5a;line-height:1.9;">
            ${copy.body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 24px 8px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#1b3a6b" style="border-radius:12px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:16px 40px;font-family:${THAI_STACK};font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;line-height:1.7;">
                    ${copy.button}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 32px 0 32px;font-family:${LATIN_STACK};font-size:13px;color:#8a96a8;line-height:1.6;">
            ${copy.en}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 0 32px;font-family:${THAI_STACK};font-size:13px;color:#6e7a8a;line-height:1.9;">
            หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์ของคุณ
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 32px 0 32px;font-family:${LATIN_STACK};font-size:12px;color:#1b3a6b;line-height:1.6;word-break:break-all;">
            <a href="${safeUrl}" style="color:#1b3a6b;text-decoration:underline;">${safeUrl}</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 0 32px;font-family:${THAI_STACK};font-size:13px;color:#8a96a8;line-height:1.9;">
            ${copy.notYou}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #e8ecf2;height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 32px 28px 32px;font-family:${THAI_STACK};font-size:12px;color:#8a96a8;line-height:1.9;">
            ทุนดี (TunDee) — ค้นหาทุนการศึกษาที่ตรงกับคุณ<br />
            อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br />
            <a href="https://www.tundee.org" style="color:#8a96a8;text-decoration:underline;">tundee.org</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  // Plain-text alternative. Some Android mail clients and most screen readers
  // prefer it, and a Thai-only HTML part with an English text part would
  // reintroduce exactly the defect this module exists to remove.
  const text = [
    copy.heading, '', copy.body, '', url, '', copy.en, '', copy.notYou, '',
    'ทุนดี (TunDee) — ค้นหาทุนการศึกษาที่ตรงกับคุณ',
    'tundee.org',
  ].join('\n');

  return { subject: copy.subject, html, text };
}

/**
 * "Set your password" — the recovery email.
 *
 * Sent automatically the moment someone fails to sign in to an existing
 * non-Google account, rather than making them find and tap a "forgot password"
 * link first. For the 27 accounts created by the retired magic-link flow this
 * is the ONLY way back in, and they have no way of knowing that, so the copy
 * says it plainly instead of assuming they forgot a password they never set.
 *
 * `lang` selects nothing yet: both languages always render and Thai always
 * leads. Reordering for an English-preferring user is a deliberate future
 * change, not something to infer from a parameter being present.
 */
export function setPasswordEmail(url: string, lang: Language = 'th'): AuthEmail {
  void lang;
  return render(url, {
    subject: 'ตั้งรหัสผ่านสำหรับบัญชีทุนดี',
    heading: 'ตั้งรหัสผ่านของคุณ',
    body:    'กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ จากนั้นคุณจะเข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้ทันที ลิงก์นี้ใช้ได้เพียงครั้งเดียว',
    button:  'ตั้งรหัสผ่าน',
    en:      'Tap the button above to set your password. This link works once only.',
    notYou:  'หากคุณไม่ได้ขอตั้งรหัสผ่าน คุณสามารถละเว้นอีเมลฉบับนี้ได้ บัญชีของคุณยังปลอดภัยดี',
  });
}

/**
 * "Confirm your email address" — sent ONLY on opting into email reminders.
 *
 * Never at signup. An account is fully usable with an unverified address; the
 * single thing verification unlocks is our willingness to send deadline mail to
 * it, which protects the sending domain from bouncing at addresses nobody
 * proved they own.
 */
export function verifyEmailEmail(url: string, lang: Language = 'th'): AuthEmail {
  void lang;
  return render(url, {
    subject: 'ยืนยันอีเมลเพื่อรับการแจ้งเตือนกำหนดส่งทุน',
    heading: 'ยืนยันอีเมลของคุณ',
    body:    'กดปุ่มด้านล่างเพื่อยืนยันอีเมล เราจะได้ส่งการแจ้งเตือนก่อนทุนหมดเขตให้คุณได้ หากไม่ยืนยัน บัญชีของคุณยังใช้งานได้ตามปกติทุกอย่าง',
    button:  'ยืนยันอีเมล',
    en:      'Tap the button above to confirm your address and receive deadline reminders.',
    notYou:  'หากคุณไม่ได้ขอรับการแจ้งเตือน คุณสามารถละเว้นอีเมลฉบับนี้ได้',
  });
}
