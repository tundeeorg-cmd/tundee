/**
 * Auth email content, in version control.
 *
 * The Supabase dashboard template (emails/supabase/magic-link.html) is the
 * fallback and remains the source of truth until this path is proven in
 * production. This module exists because a dashboard template is ONE template
 * for everyone: `signInWithOtp` takes no language argument, and for a new user
 * there is no profile row yet in which a preference could have been stored. So
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

export interface MagicLinkEmail {
  subject: string;
  html: string;
  text: string;
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
 * The sign-in email.
 *
 * `lang` selects which line leads, but BOTH always appear: an English-preferring
 * user still sees the Thai, and a Thai user still sees the English secondary.
 * Nothing in this flow is ever English-only.
 */
export function magicLinkEmail(url: string, lang: Language = 'th'): MagicLinkEmail {
  const safeUrl = escapeHtml(url);

  const th = {
    heading:  'ลิงก์เข้าสู่ระบบของคุณ',
    body:     'กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ลิงก์นี้ใช้ได้เพียงครั้งเดียว และจะหมดอายุในไม่ช้า',
    button:   'เข้าสู่ระบบ',
    fallback: 'หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์ของคุณ',
    notYou:   'หากคุณไม่ได้ขอลิงก์นี้ คุณสามารถละเว้นอีเมลฉบับนี้ได้',
  };
  const en = 'Tap the button above to sign in. This link works once only.';

  // Subject stays Thai-first in both cases: the inbox list is the first thing
  // a Thai user sees, and an English subject there undoes the whole point.
  const subject = 'ลิงก์เข้าสู่ระบบทุนดี';

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
            ${th.heading}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 0 32px;font-family:${THAI_STACK};font-size:16px;color:#3c4a5a;line-height:1.9;">
            ${th.body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 24px 8px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#1b3a6b" style="border-radius:12px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:16px 40px;font-family:${THAI_STACK};font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;line-height:1.7;">
                    ${th.button}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:12px 32px 0 32px;font-family:${LATIN_STACK};font-size:13px;color:#8a96a8;line-height:1.6;">
            ${en}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 0 32px;font-family:${THAI_STACK};font-size:13px;color:#6e7a8a;line-height:1.9;">
            ${th.fallback}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 32px 0 32px;font-family:${LATIN_STACK};font-size:12px;color:#1b3a6b;line-height:1.6;word-break:break-all;">
            <a href="${safeUrl}" style="color:#1b3a6b;text-decoration:underline;">${safeUrl}</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 0 32px;font-family:${THAI_STACK};font-size:13px;color:#8a96a8;line-height:1.9;">
            ${th.notYou}
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
  // reintroduce exactly the defect this change exists to remove.
  const text = [
    th.heading,
    '',
    th.body,
    '',
    url,
    '',
    en,
    '',
    th.notYou,
    '',
    'ทุนดี (TunDee) — ค้นหาทุนการศึกษาที่ตรงกับคุณ',
    'tundee.org',
  ].join('\n');

  // lang is accepted and reserved: today both languages always render, and Thai
  // always leads. Reordering for an English-preferring user is a deliberate
  // future change, not something to infer from a parameter being present.
  void lang;

  return { subject, html, text };
}
