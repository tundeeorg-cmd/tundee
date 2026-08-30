/**
 * The two Thai auth emails.
 *
 * There are exactly two, and NEITHER is sent at signup: email + password
 * creates a live, signed-in account with no email round trip. That is the point
 * of the whole change — every send is a step where a student in a Facebook
 * webview leaves the browser and does not come back.
 *
 *   setPasswordEmail  — recovery, and the only way back in for the accounts the
 *                       magic-link flow created without a password
 *   verifyEmailEmail  — sent ONLY on opting into email deadline reminders
 *
 * These assert the constraints that cannot be checked by looking at them: that
 * no English-only path exists, that the markup survives Gmail on Android, and
 * that Thai never renders at a line-height which clips its tone marks.
 */

import { describe, it, expect } from 'vitest';
import { setPasswordEmail, verifyEmailEmail, AUTH_EMAIL_FROM } from '@/lib/email/authEmails';

const URL = 'https://www.tundee.org/auth/callback?next=%2Fscholarships&type=recovery';
const mail = setPasswordEmail(URL, 'th');
const verify = verifyEmailEmail(URL, 'th');

describe('the retired magic link stays retired', () => {
  it('exports no magic-link builder', async () => {
    // Signup sending mail at all is the regression this guards against: it is
    // what turned 79 Lead events into 10 accounts.
    const mod = await import('@/lib/email/authEmails');
    expect('magicLinkEmail' in mod).toBe(false);
  });

  it('never tells anyone an email is their way in', () => {
    for (const m of [mail, verify]) {
      expect(m.subject).not.toContain('ลิงก์เข้าสู่ระบบ');
      expect(m.html).not.toContain('Tap the button above to sign in');
    }
  });
});

describe('Thai-first copy', () => {
  it('uses a Thai subject verbatim, with no emoji', () => {
    expect(mail.subject).toBe('ตั้งรหัสผ่านสำหรับบัญชีทุนดี');
    expect(verify.subject).toBe('ยืนยันอีเมลเพื่อรับการแจ้งเตือนกำหนดส่งทุน');
    for (const m of [mail, verify]) {
      expect(m.subject).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('contains every supplied Thai string verbatim', () => {
    for (const s of [
      'ตั้งรหัสผ่านของคุณ',
      'ตั้งรหัสผ่าน',
      'หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์ของคุณ',
      'ทุนดี (TunDee) — ค้นหาทุนการศึกษาที่ตรงกับคุณ',
      'อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ',
    ]) {
      expect(mail.html, s).toContain(s);
    }
  });

  it('tells the student that declining verification costs them nothing else', () => {
    // The claim the product has to keep: an unverified account signs in,
    // matches, tracks and applies exactly like any other.
    expect(verify.html).toContain('หากไม่ยืนยัน บัญชีของคุณยังใช้งานได้ตามปกติทุกอย่าง');
  });

  it('never renders English-only, in either language', () => {
    // Thai must be present even when the user prefers English — the secondary
    // line is additive, never a replacement.
    for (const lang of ['th', 'en'] as const) {
      const m = setPasswordEmail(URL, lang);
      expect(m.html, lang).toContain('ตั้งรหัสผ่านของคุณ');
      expect(m.text, lang).toContain('ตั้งรหัสผ่านของคุณ');
      expect(m.subject).toBe('ตั้งรหัสผ่านสำหรับบัญชีทุนดี');
    }
  });

  it('carries the English secondary line', () => {
    expect(mail.html).toContain('Tap the button above to set your password. This link works once only.');
    expect(verify.html).toContain('Tap the button above to confirm your address');
  });

  it('never reintroduces the stock Supabase English', () => {
    for (const s of ['Your sign-in link', 'Follow the link below', 'Reset Password']) {
      expect(mail.html, s).not.toContain(s);
      expect(mail.text, s).not.toContain(s);
    }
  });
});

describe('renders in Gmail on Android', () => {
  it('uses no layout technique Gmail strips', () => {
    for (const m of [mail, verify]) {
      for (const bad of ['display:flex', 'display:grid', '<link', '@media', 'class=', '<style']) {
        expect(m.html, bad).not.toContain(bad);
      }
    }
  });

  it('is table-based and capped at 600px', () => {
    for (const m of [mail, verify]) {
      expect(m.html).toContain('max-width:600px');
      expect(m.html).toContain('role="presentation"');
    }
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
    for (const build of [setPasswordEmail, verifyEmailEmail]) {
      const hostile = build('https://x.test/a?b=1&c="><script>alert(1)</script>', 'th');
      expect(hostile.html).not.toContain('<script>');
      expect(hostile.html).toContain('&amp;');
    }
  });
});

describe('sender', () => {
  it('is the Thai display name, matching the reminder sender', () => {
    expect(AUTH_EMAIL_FROM).toContain('ทุนดี TunDee');
    expect(AUTH_EMAIL_FROM).toContain('@tundee.org');
  });
});
