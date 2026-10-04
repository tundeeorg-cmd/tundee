/**
 * The LINE data notice and the privacy policy say the same thing.
 *
 * LINE sign-in, through Supabase's `custom:line` provider, receives the LINE
 * user id, display name and picture — never an email, because LINE's userinfo
 * endpoint has none. The notice under the LINE button says so at the moment of
 * choosing, and /privacy says it at length. If either drifts back to promising
 * or requesting an email, it describes data we no longer receive.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LINE_DATA_NOTICE } from '@/lib/line/dataNotice';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('LINE data notice', () => {
  it('names what LINE gives us and what it does not — in both languages', () => {
    expect(LINE_DATA_NOTICE.th).toContain('รหัสผู้ใช้ LINE');
    expect(LINE_DATA_NOTICE.th).toContain('ไม่ได้รับอีเมลหรือเบอร์โทร');
    expect(LINE_DATA_NOTICE.en).toMatch(/name, profile picture and user ID/);
    expect(LINE_DATA_NOTICE.en).toMatch(/never your email or phone number/);
  });

  it('is rendered by both the hydrated form and the no-JS shell, with a link to /privacy', () => {
    for (const file of ['app/auth/AuthForm.tsx', 'app/auth/AuthShell.tsx']) {
      const src = read(file);
      expect(src, file).toContain('LINE_DATA_NOTICE');
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

  it('says no email comes from LINE, and promises none', () => {
    expect(src).toContain('เราไม่ได้รับอีเมลหรือเบอร์โทรศัพท์จาก LINE');
    expect(src).toContain('we do not receive your email or phone number from LINE');
    expect(src).not.toContain('อีเมลที่ได้จาก LINE');
    expect(src).not.toContain('An email received from LINE');
  });

  it('is at version 1.2 or later', () => {
    expect(src).not.toMatch(/POLICY_VERSION = '1\.[01]'/);
  });
});
