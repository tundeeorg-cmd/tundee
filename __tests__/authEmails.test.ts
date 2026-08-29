/**
 * The Thai sign-in email.
 *
 * These assert the constraints that cannot be checked by looking at it: that
 * no English-only path exists, that the markup survives Gmail on Android, and
 * that Thai never renders at a line-height which clips its tone marks.
 */

import { describe, it, expect } from 'vitest';
import { magicLinkEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';

const URL = 'https://www.tundee.org/auth/callback?next=%2Fscholarships&consent=1.0';
const mail = magicLinkEmail(URL, 'th');

describe('Thai-first copy', () => {
  it('uses the supplied Thai subject verbatim, with no emoji', () => {
    expect(mail.subject).toBe('ลิงก์เข้าสู่ระบบทุนดี');
    expect(mail.subject).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('contains every supplied Thai string verbatim', () => {
    for (const s of [
      'ลิงก์เข้าสู่ระบบของคุณ',
      'กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ลิงก์นี้ใช้ได้เพียงครั้งเดียว และจะหมดอายุในไม่ช้า',
      'เข้าสู่ระบบ',
      'หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์ของคุณ',
      'หากคุณไม่ได้ขอลิงก์นี้ คุณสามารถละเว้นอีเมลฉบับนี้ได้',
      'ทุนดี (TunDee) — ค้นหาทุนการศึกษาที่ตรงกับคุณ',
      'อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ',
    ]) {
      expect(mail.html, s).toContain(s);
    }
  });

  it('never renders English-only, in either language', () => {
    // Thai must be present even when the user prefers English — the secondary
    // line is additive, never a replacement.
    for (const lang of ['th', 'en'] as const) {
      const m = magicLinkEmail(URL, lang);
      expect(m.html, lang).toContain('ลิงก์เข้าสู่ระบบของคุณ');
      expect(m.text, lang).toContain('ลิงก์เข้าสู่ระบบของคุณ');
      expect(m.subject).toBe('ลิงก์เข้าสู่ระบบทุนดี');
    }
  });

  it('carries the English secondary line', () => {
    expect(mail.html).toContain('Tap the button above to sign in. This link works once only.');
  });

  it('never reintroduces the stock Supabase English', () => {
    for (const s of ['Your sign-in link', 'Follow the link below']) {
      expect(mail.html, s).not.toContain(s);
      expect(mail.text, s).not.toContain(s);
    }
  });
});

describe('renders in Gmail on Android', () => {
  it('uses no layout technique Gmail strips', () => {
    for (const bad of ['display:flex', 'display:grid', '<link', '@media', 'class=', '<style']) {
      expect(mail.html, bad).not.toContain(bad);
    }
  });

  it('is table-based and capped at 600px', () => {
    expect(mail.html).toContain('max-width:600px');
    expect(mail.html).toContain('role="presentation"');
  });

  it('gives every Thai run line-height >= 1.7', () => {
    // Thai tone marks and vowels stack above and below the baseline; tighter
    // leading clips them. Latin-only runs may be tighter.
    const thaiRuns = mail.html.match(/font-family:'Sarabun'[^"]*/g) ?? [];
    expect(thaiRuns.length).toBeGreaterThan(0);
    for (const run of thaiRuns) {
      const m = run.match(/line-height:(\d+(?:\.\d+)?)/);
      if (!m) continue;
      expect(Number(m[1]), run.slice(0, 60)).toBeGreaterThanOrEqual(1.7);
    }
  });
});

describe('the link', () => {
  it('appears as both the button href and copyable text', () => {
    expect(mail.html).toContain(`href="${URL.replace(/&/g, '&amp;')}"`);
    expect(mail.text).toContain(URL);
  });

  it('escapes the URL into HTML rather than trusting it', () => {
    const hostile = magicLinkEmail('https://x.test/a?b=1&c="><script>alert(1)</script>', 'th');
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&amp;');
  });
});

describe('sender', () => {
  it('is the Thai display name, matching the reminder sender', () => {
    expect(AUTH_EMAIL_FROM).toContain('ทุนดี TunDee');
    expect(AUTH_EMAIL_FROM).toContain('@tundee.org');
  });
});
