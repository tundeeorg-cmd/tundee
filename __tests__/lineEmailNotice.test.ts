/**
 * The LINE email notice and the privacy policy say the same thing.
 *
 * LINE approves the Email address permission only for an app that tells users,
 * before they consent, that the email is collected and why — the application
 * asks for a screenshot of that screen. That screen is the notice under the LINE
 * button. If it disappears from either sign-in render, or /privacy stops
 * disclosing what LINE sign-in collects, the approval rests on something that
 * is no longer true.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LINE_EMAIL_NOTICE } from '@/lib/line/emailNotice';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('LINE email notice', () => {
  it('says what is asked, what it is for, and that refusing is fine — in both languages', () => {
    expect(LINE_EMAIL_NOTICE.th).toContain('อีเมล');
    expect(LINE_EMAIL_NOTICE.th).toContain('แจ้งเตือน');
    expect(LINE_EMAIL_NOTICE.th).toContain('ไม่อนุญาตก็ใช้ทุนดีได้ตามปกติ');
    expect(LINE_EMAIL_NOTICE.en).toMatch(/email/i);
    expect(LINE_EMAIL_NOTICE.en).toMatch(/reminders/);
    expect(LINE_EMAIL_NOTICE.en).toMatch(/Saying no doesn't stop you/);
  });

  it('is rendered by both the hydrated form and the no-JS shell, with a link to /privacy', () => {
    for (const file of ['app/auth/AuthForm.tsx', 'app/auth/AuthShell.tsx']) {
      const src = read(file);
      expect(src, file).toContain('LINE_EMAIL_NOTICE');
      expect(src, file).toContain('href="/privacy"');
    }
  });
});

describe('/privacy discloses LINE sign-in', () => {
  const src = read('app/privacy/page.tsx');

  it('lists the LINE data collected, in Thai and English', () => {
    expect(src).toContain('รหัสผู้ใช้ LINE (LINE user ID)');
    expect(src).toContain('your LINE user ID, LINE display name and profile picture');
  });

  it('says the email arrives only with consent on LINE’s screen', () => {
    expect(src).toContain('เฉพาะเมื่อคุณกดอนุญาตในหน้ายินยอมของ LINE');
    expect(src).toContain("the email only if you allow it on LINE's consent screen");
  });

  it('moved past version 1.0', () => {
    expect(src).not.toContain("POLICY_VERSION = '1.0'");
  });
});
