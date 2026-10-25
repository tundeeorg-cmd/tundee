/**
 * Sign-in inside an in-app browser: email code first, LINE second, nothing started
 * without a tap, and every new funnel event is one the database accepts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectUserAgent } from '@/lib/browser/inAppBrowser';
import { IN_APP_COPY, emailFirstLogin, inAppNotice, loginEventContext } from '@/lib/auth/inAppLogin';
import { androidLineHelp } from '@/lib/line/launch';

const UA = {
  fbAndroid:  'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]',
  fbIos:      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
  igAndroid:  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android',
  tiktok:     'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 musical_ly_2023',
  lineIos:    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0',
  chrome:     'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  safari:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

describe('who gets email first', () => {
  it.each([['fbAndroid'], ['fbIos'], ['igAndroid'], ['tiktok']] as const)('%s: yes', (k) => {
    expect(emailFirstLogin(inspectUserAgent(UA[k]))).toBe(true);
  });
  it("LINE's own browser, Chrome and Safari: no, LINE stays first", () => {
    for (const k of ['lineIos', 'chrome', 'safari'] as const) {
      expect(emailFirstLogin(inspectUserAgent(UA[k])), k).toBe(false);
    }
  });
  it('an unrecognised or missing user agent fails open: LINE first', () => {
    expect(emailFirstLogin(inspectUserAgent(null))).toBe(false);
    expect(emailFirstLogin(inspectUserAgent('SomethingNew/1.0'))).toBe(false);
  });
});

describe('the Thai the student reads (verbatim from the brief)', () => {
  it('names the app in the notice', () => {
    expect(inAppNotice(inspectUserAgent(UA.fbAndroid))).toBe('คุณกำลังเปิดทุนดีในแอป Facebook ซึ่งเข้าสู่ระบบด้วย LINE แบบกดครั้งเดียวไม่ได้');
    expect(inAppNotice(inspectUserAgent(UA.igAndroid))).toBe('คุณกำลังเปิดทุนดีในแอป Instagram ซึ่งเข้าสู่ระบบด้วย LINE แบบกดครั้งเดียวไม่ได้');
    expect(inAppNotice(inspectUserAgent(UA.tiktok))).toContain('ในแอปนี้');
  });
  it('the buttons, the code messages and the notes', () => {
    expect(IN_APP_COPY.emailButton).toBe('เข้าสู่ระบบด้วยอีเมล (รับรหัส 6 หลัก)');
    expect(IN_APP_COPY.codeSent('a@b.co')).toBe('ส่งรหัส 6 หลักไปที่ a@b.co แล้ว กรอกรหัสด้านล่างเพื่อเข้าสู่ระบบ คำตอบของคุณยังอยู่ครบ');
    expect(IN_APP_COPY.resend).toBe('ส่งรหัสอีกครั้ง');
    expect(IN_APP_COPY.resendWait(42)).toBe('ส่งใหม่ได้ใน 42 วินาที');
    expect(IN_APP_COPY.wrongCode).toBe('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง');
    expect(IN_APP_COPY.androidChromeButton).toBe('เปิดใน Chrome เพื่อเข้าสู่ระบบด้วย LINE');
    expect(IN_APP_COPY.iosInstruction).toBe('หากต้องการใช้ LINE: กดปุ่ม ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์"');
    expect(IN_APP_COPY.lineNote).toContain('แนะนำให้ใช้อีเมลแทน');
  });
  it('the old "could not open Chrome automatically" banner is gone from every screen', () => {
    expect(androidLineHelp(true)).not.toContain('อัตโนมัติ');
    expect(androidLineHelp(false)).not.toMatch(/automatically/i);
    for (const file of ['app/auth/AuthForm.tsx', 'components/start/LineQuickStart.tsx', 'lib/line/launch.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toContain('เปิด Chrome อัตโนมัติไม่สำเร็จ');
      expect(src, file).not.toContain('จะเปิดใน Chrome ให้อัตโนมัติ');
    }
  });
});

describe('funnel events', () => {
  const NEW = ['login_method_shown', 'otp_sent', 'otp_verified', 'otp_failed', 'open_in_chrome_clicked', 'line_login_clicked_in_app'];

  it('every new event is in the TypeScript type and in the v34 migration', () => {
    const ts  = readFileSync('lib/research/funnel.ts', 'utf8');
    const sql = readFileSync('scripts/20261101_v34_login_funnel_events.sql', 'utf8');
    for (const name of NEW) {
      expect(ts, name).toContain(`| '${name}'`);
      expect(sql, name).toContain(`ADD VALUE IF NOT EXISTS '${name}'`);
    }
  });

  it('v34 adds enum values only: no table, view, constraint or data', () => {
    const live = readFileSync('scripts/20261101_v34_login_funnel_events.sql', 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const bad of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bCREATE\b/i, /\bCONSTRAINT\b/i, /\bALTER\s+TABLE\b/i]) {
      expect(live).not.toMatch(bad);
    }
    expect(live.match(/ALTER TYPE public\.funnel_event_type ADD VALUE/g)).toHaveLength(NEW.length);
  });

  it('the context says where and in what browser, and never who', () => {
    const ctx = loginEventContext(inspectUserAgent(UA.fbAndroid), 'start', { step: 'verify', reason: 'code_invalid' });
    expect(ctx).toMatchObject({ surface: 'start', in_app: true, app: 'facebook', platform: 'android', email_first: true, step: 'verify' });
    for (const key of Object.keys(ctx)) expect(key).not.toMatch(/^(email|code|token|user_id|user|phone|name)$/i);
  });

  it('no sign-in event is given the address or the code', () => {
    for (const file of ['components/start/EmailCodeStart.tsx', 'app/auth/AuthForm.tsx']) {
      const calls = readFileSync(file, 'utf8').match(/loginEventContext\([^)]*\)/g) ?? [];
      expect(calls.length, file).toBeGreaterThan(0);
      for (const c of calls) expect(c, file).not.toMatch(/email|token|\bcode\b/i);
    }
  });
});

describe('nothing leaves the page without a tap', () => {
  // The Chrome hand-off needs a user gesture in a webview, and a redirect on load is what
  // used to show the "could not open Chrome" banner before anyone had touched anything.
  it('the mount effects of /start and /auth never start LINE or a Chrome hand-off', () => {
    for (const file of ['app/auth/AuthForm.tsx', 'components/start/LineQuickStart.tsx']) {
      const src = readFileSync(file, 'utf8');
      const effects = [...src.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/g)].map((m) => m[1]);
      expect(effects.length, file).toBeGreaterThan(0);
      for (const body of effects) {
        expect(body, file).not.toMatch(/followLineLaunch|lineLaunch\(|intent:\/\/|location\.(href|assign|replace)\s*=/);
      }
    }
  });

  it('the email code is typed on /start itself: no navigation to /auth to ask for it', () => {
    const src = readFileSync('components/start/EmailCodeStart.tsx', 'utf8');
    expect(src).toContain('signInWithOtp');
    expect(src).toContain("type: 'email'");
    expect(src).toContain('autoComplete="one-time-code"');
    expect(src).toContain('inputMode="numeric"');
  });
});
