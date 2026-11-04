/**
 * /auth is Thai unless the visitor chose English, and can always switch back.
 *
 * Thai is the default (lib/LanguageContext.tsx); English appears only when
 * localStorage holds an explicit 'en'. These tests pin the two things that
 * keep that true on the sign-in page: every message it can show has Thai, and
 * the card carries its own TH / EN switch (the navbar's is hidden in the phone
 * menu).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { otpMessage, type OtpErrorCode } from '@/lib/auth/otp';
import { iosLineHelp, androidLineHelp } from '@/lib/line/launch';
import { LINE_DATA_NOTICE } from '@/lib/line/dataNotice';
import { IN_APP_COPY } from '@/lib/auth/inAppLogin';
import type { InAppBrowserInfo } from '@/lib/browser/inAppBrowser';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const THAI = /[฀-๿]/;

const IAB = (over: Partial<InAppBrowserInfo>): InAppBrowserInfo => ({
  isInApp: true, app: 'facebook', googleBlocked: true, lineAppToAppBlocked: true,
  iosOtherBrowser: false, androidOtherBrowser: false, huaweiBrowser: false, platform: 'ios', ...over,
});

describe('every /auth message has Thai', () => {
  const codes: OtpErrorCode[] = [
    'invalid_email', 'code_invalid', 'code_expired', 'rate_limited',
    'consent_required', 'network', 'send_failed', 'verify_failed',
  ];
  for (const code of codes) {
    it(`otpMessage(${code}, 'th')`, () => expect(otpMessage(code, 'th')).toMatch(THAI));
  }

  it('LINE help on iPhone and Android', () => {
    expect(iosLineHelp(IAB({}), true)).toMatch(THAI);
    expect(iosLineHelp(IAB({ isInApp: false, iosOtherBrowser: true }), true)).toMatch(THAI);
    expect(androidLineHelp(true)).toMatch(THAI);
  });

  it('LINE data notice and in-app copy', () => {
    expect(LINE_DATA_NOTICE.th).toMatch(THAI);
    expect(LINE_DATA_NOTICE.privacyLabel.th).toMatch(THAI);
    for (const v of Object.values(IN_APP_COPY)) {
      expect(typeof v === 'function' ? v(1 as never) : v).toMatch(THAI);
    }
  });
});

describe('the language default', () => {
  it('is Thai, and only an explicit stored choice switches it', () => {
    const ctx = read('lib/LanguageContext.tsx');
    expect(ctx).toContain("useState<Language>('th')");
    expect(ctx).toContain(": 'th'");
    // No guessing from the device: Thai students on English-language phones are common.
    expect(ctx).not.toMatch(/navigator\.language|accept-language/i);
  });

  it('the /auth card carries its own TH / EN switch, and the shell reserves its row', () => {
    const form = read('app/auth/AuthForm.tsx');
    const shell = read('app/auth/AuthShell.tsx');
    expect(form).toContain("import LanguageToggle from '@/components/LanguageToggle'");
    expect(form).toContain('<LanguageToggle />');
    // Same row height in both, so the heading does not jump when the form hydrates.
    expect(form).toContain('flex justify-end h-6 mb-1');
    expect(shell).toContain('h-6 mb-1');
  });
});
