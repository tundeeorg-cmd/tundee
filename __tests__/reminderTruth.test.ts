/**
 * Reminders on /tracker say what will really happen, and an address the
 * sign-in already proved is not sent a verification email (15 Nov 2026).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionProvedEmail } from '@/lib/auth/provedEmail';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('sessionProvedEmail', () => {
  it('an emailed code or link proves the inbox', () => {
    expect(sessionProvedEmail([{ method: 'otp', timestamp: 1 }])).toBe(true);
    expect(sessionProvedEmail([{ method: 'magiclink', timestamp: 1 }])).toBe(true);
    expect(sessionProvedEmail(['otp'])).toBe(true);
  });

  it('password, OAuth (Google, LINE) and refreshes do not', () => {
    for (const m of ['password', 'oauth', 'token_refresh', 'sso/saml']) {
      expect(sessionProvedEmail([{ method: m, timestamp: 1 }]), m).toBe(false);
    }
  });

  it('anything malformed is "not proven"', () => {
    for (const bad of [undefined, null, 'otp', {}, [null], [{}], [{ method: 7 }]]) {
      expect(sessionProvedEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('POST /api/auth/verify-email', () => {
  const ROUTE = read('app/api/auth/verify-email/route.ts');
  const post = ROUTE.slice(ROUTE.indexOf('export async function POST'), ROUTE.indexOf('const CLAIM_MAX'));

  it('reads amr from verified claims, not from an unverified session', () => {
    expect(post).toContain('supabase.auth.getClaims()');
    expect(post).toContain('sessionProvedEmail(claimsData?.claims?.amr)');
  });

  it('marks the address verified and sends nothing, before any link is built', () => {
    const proved = post.indexOf('sessionProvedEmail(');
    expect(proved).toBeGreaterThan(-1);
    expect(proved).toBeLessThan(post.indexOf('createVerificationToken('));
    const branch = post.slice(proved, post.indexOf('createVerificationToken('));
    expect(branch).toContain('email_verified_at: now');
    expect(branch).toMatch(/verificationSent: false, verified: true/);
  });

  it('LINE accounts (no real address) never reach the shortcut', () => {
    expect(post.indexOf('return claimAddress(')).toBeLessThan(post.indexOf('sessionProvedEmail('));
  });
});

describe('/tracker reminder lines', () => {
  const TRACKER = read('app/tracker/page.tsx');

  it('the per-card LINE checkbox appears only when LINE is connected', () => {
    expect(TRACKER).toMatch(/\{reminders\.lineLinked && \(\s*<label[\s\S]*?แจ้งเตือน LINE ก่อนหมดเขต/);
  });

  it('otherwise the card says what email will do: on, pending, or off', () => {
    expect(TRACKER).toContain('จะส่งอีเมลเตือน 7 วันก่อนหมดเขต');
    expect(TRACKER).toContain('ยืนยันอีเมลด้านบนเพื่อรับแจ้งเตือน');
    expect(TRACKER).toContain('ยังไม่ได้เปิดการแจ้งเตือน — เปิดได้ด้านบน');
    expect(TRACKER).toMatch(/email: !profile\?\.email_reminders_opt_in \? 'off' : profile\.email_verified_at \? 'on' : 'pending'/);
    expect(TRACKER).toContain('reminders={reminderChannels}');
  });

  it('a "verified" answer turns reminders on in the page, with no "check your inbox"', () => {
    const handler = TRACKER.slice(TRACKER.indexOf('const handleEmailReminders'), TRACKER.indexOf('const handleClaimEmail'));
    expect(handler.indexOf('body?.verified')).toBeLessThan(handler.indexOf('body?.verificationSent'));
    expect(handler).toContain('เปิดแจ้งเตือนทางอีเมลแล้ว');
  });
});
