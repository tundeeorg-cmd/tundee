/**
 * The email OTP sign-in screen.
 *
 * Reads the real source, because the properties that matter here are ones a
 * rendering test would not catch: that the code length matches what Supabase
 * actually issues, that the countdown is derived from the project's real rate
 * limit rather than guessed, and that no code is ever logged.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page  = readFileSync(join(process.cwd(), 'app/auth/page.tsx'), 'utf8');
const shell = readFileSync(join(process.cwd(), 'app/auth/AuthShell.tsx'), 'utf8');
const api   = readFileSync(join(process.cwd(), 'app/api/auth/email-link/route.ts'), 'utf8');

describe('code length matches what Supabase issues', () => {
  it('is 6, verified against the live project', () => {
    // Was 8 until the dashboard was changed. Shipping 6 against an 8-digit code
    // truncates every entry and makes sign-in impossible — worse than broken.
    expect(page).toContain('const OTP_LENGTH = 6');
  });

  it('drives maxLength and auto-submit from that one constant', () => {
    expect(page).toContain('maxLength={OTP_LENGTH}');
    expect(page).toContain('digits.length === OTP_LENGTH');
    expect(page).not.toMatch(/maxLength=\{6\}/);
  });
});

describe('resend countdown is derived, not guessed', () => {
  it('uses 120s — 3600/30 at the project rate limit', () => {
    expect(page).toContain('RESEND_COOLDOWN_SECONDS = 120');
  });

  it('no longer hardcodes 60', () => {
    expect(page).not.toContain('setCooldown(60)');
  });

  it('prefers the remaining seconds Supabase reports over the constant', () => {
    expect(page).toMatch(/after \(\\d\+\) seconds/);
  });
});

describe('the input suits a phone', () => {
  it('is numeric, one-time-code, and paste-friendly', () => {
    expect(page).toContain('inputMode="numeric"');
    expect(page).toContain('autoComplete="one-time-code"');
    // Stripping non-digits is what makes a pasted code work.
    expect(page).toContain("replace(/\\D/g, '')");
  });

  it('verifies with the type proven against the live project', () => {
    expect(page).toContain("type: 'email'");
    expect(page).toContain('verifyOtp');
  });
});

describe('nothing secret is logged', () => {
  it('never logs the code, a token, or a hash', () => {
    const logs = [...page.matchAll(/console\.(log|error|warn)\(([^\n]*)/g)].map(m => m[2]);
    for (const line of logs) {
      expect(line, line).not.toMatch(/\bcode\b|\btoken\b|token_hash|access_token/);
    }
  });
});

describe('failures keep the user moving', () => {
  it('has Thai copy for wrong, expired and rate-limited codes', () => {
    expect(page).toContain('รหัสไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง');
    expect(page).toContain('รหัสหมดอายุแล้ว กรุณากดส่งรหัสใหม่');
    expect(page).toContain('ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
  });

  it('has Thai copy for offline and timeout', () => {
    expect(page).toContain('ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่');
    expect(page).toContain('การเชื่อมต่อช้าเกินไป');
  });

  it('gives every network call a deadline', () => {
    expect(page).toContain('NETWORK_TIMEOUT_MS');
    expect(page).toContain('AbortController');
  });

  it('disables submit while in flight so rapid taps cannot send twice', () => {
    expect(page).toContain('disabled={verifying || code.length !== OTP_LENGTH}');
    expect(page).toContain('if (cooldown > 0 || loading) return;');
  });
});

describe('the page works before JavaScript arrives', () => {
  it('serves LINE as a plain anchor', () => {
    expect(shell).toContain('href={`/api/auth/line/start');
    expect(shell).not.toContain('window.location');
  });

  it('serves email as a real form POST', () => {
    expect(shell).toContain('method="POST"');
    expect(shell).toContain('action="/api/auth/email-link"');
  });

  it('the route answers form posts with redirects, never JSON', () => {
    expect(api).toContain('isFormPost');
    expect(api).toContain('formRedirect');
    // RESEND_API_KEY is unset in production, so every form post takes this
    // branch; returning JSON would show a wall of it to a no-JS user.
    expect(api).toContain('formFallbackSend');
  });

  it('echoes the email back so a failed send does not clear the field', () => {
    expect(api).toContain('...params, email');
  });
});
