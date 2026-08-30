/**
 * The contract between the auth routes and the pages that consume them.
 *
 * A broken sign-in cost real signups and nothing caught it, because the halves
 * live in different places: a link is built in one file and consumed by a route
 * handler in another, and neither had a test saying what shape the other must
 * produce.
 *
 * These read the actual source files, so a change to either side that breaks
 * the pairing fails here.
 *
 * The magic link is gone. Email accounts now sign in with a password at
 * /api/auth/password with no email round trip at all — the round trip is what
 * turned 79 Lead events into 10 accounts. What survives is the token_hash
 * machinery, because two flows still need it: the LINE bridge mints one
 * internally, and password recovery sends one by email.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const confirm      = read('emails/supabase/confirm-signup.paste.html');
const callback     = read('app/auth/callback/route.ts');
const passwordApi  = read('app/api/auth/password/route.ts');
const recovery     = read('lib/auth/recovery.ts');
const authForm     = read('app/auth/AuthForm.tsx');
const authShell    = read('app/auth/AuthShell.tsx');
const lineCallback = read('app/api/auth/line/callback/route.ts');

describe('the magic-link flow is actually gone, not merely unused', () => {
  it('has no email-link route left to fall back to', () => {
    expect(existsSync(join(ROOT, 'app/api/auth/email-link/route.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'emails/supabase/magic-link.paste.html'))).toBe(false);
  });

  it('the form never calls signInWithOtp', () => {
    // signInWithOtp is the call that emails a link. Its return would put a
    // student in a mail app, which is the drop-off being removed.
    expect(authForm).not.toContain('signInWithOtp');
    expect(authShell).not.toContain('email-link');
  });

  it('signup itself sends no mail — the form posts to the password route', () => {
    expect(authForm).toContain("fetch('/api/auth/password'");
    expect(authShell).toContain('action="/api/auth/password"');
  });
});

describe('the recovery link points at OUR callback, not Supabase /auth/v1/verify', () => {
  it('builds a token_hash URL rather than using action_link', () => {
    // action_link points at /auth/v1/verify, which returns the session in the
    // URL fragment. Fragments are never sent to a server route handler, so the
    // callback receives nothing and cannot sign the user in.
    expect(recovery).toContain('hashed_token');
    expect(recovery).toContain("set('token_hash'");
    expect(recovery).toContain("set('type', 'recovery')");
    expect(recovery).not.toContain('properties?.action_link');
  });

  it('the surviving Supabase template still carries token_hash + type', () => {
    expect(confirm).toContain('token_hash={{ .TokenHash }}');
    expect(confirm).toContain('type=signup');
    expect(confirm).not.toContain('ConfirmationURL');
    expect(confirm).not.toContain('/auth/v1/verify');
  });
});

describe('the callback reads what the routes send', () => {
  it('accepts token_hash + type', () => {
    expect(callback).toContain("searchParams.get('token_hash')");
    expect(callback).toContain('verifyOtp');
  });

  it("declares 'recovery' and 'magiclink' as accepted verification types", () => {
    // 'magiclink' stays in the cast because the LINE bridge mints exactly that
    // type internally — see app/api/auth/line/callback.
    expect(callback).toContain("'recovery'");
    expect(callback).toContain("'magiclink'");
  });

  it('sends a recovery token to the set-password form, not into the app', () => {
    // Landing them signed in with still no password set, and no prompt to fix
    // it, is how someone ends up locked out again on their next visit.
    expect(callback).toContain("type === 'recovery'");
    expect(callback).toContain('/auth/reset/confirm');
  });

  it('still accepts the LINE bridge handoff', () => {
    expect(lineCallback).toContain('/auth/callback');
    expect(lineCallback).toContain("set('token_hash'");
  });
});

describe('failure modes are distinguished, not all called "expired"', () => {
  it('emits a distinct code when nothing usable arrives', () => {
    expect(callback).toContain('no_credentials');
  });

  it('emits a distinct code when the token itself is rejected', () => {
    expect(callback).toContain('link_invalid');
  });

  it('no longer collapses everything into auth_failed', () => {
    expect(callback).not.toContain('error=auth_failed');
  });

  it('logs the cause when nothing usable arrives', () => {
    // The original returned a generic redirect with nothing in the logs, so a
    // total sign-in outage looked exactly like a user clicking an old link.
    expect(callback).toContain('no token_hash and no code');
  });
});

describe('every code the password route emits has copy in the form', () => {
  it('covers each one, so no student meets a blank or English error', () => {
    for (const code of [
      'consent_required', 'invalid_email', 'weak_password',
      'google_account', 'line_account', 'reset_sent',
      'rate_limited', 'signup_failed',
    ]) {
      expect(passwordApi, code).toContain(`'${code}'`);
      expect(authForm, code).toContain(`case '${code}'`);
    }
  });

  it('renders reset_sent as information, not as a failure', () => {
    // The student typed a password we could not accept and we have already
    // emailed them a way in. Painting that red reads as "you did something
    // wrong" when the message is "check your email, it is handled".
    const branch = authForm.slice(authForm.indexOf("case 'reset_sent'"));
    expect(branch.slice(0, 200)).toContain('info(');
  });
});

describe('user-facing copy tells the truth', () => {
  it('does not claim expiry as the catch-all', () => {
    // Users hit "your link expired", requested another, and hit it again.
    expect(authForm).not.toContain('ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
  });

  it('uses the supplied Thai copy for each state', () => {
    expect(authForm).toContain('ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง');
    expect(authForm).toContain('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });

  it('promises no email at signup, because none is sent', () => {
    expect(authForm).toContain('ไม่ต้องยืนยันอีเมล เข้าใช้งานได้ทันที');
  });

  it('handles both callback error codes', () => {
    expect(authForm).toContain("case 'no_credentials'");
    expect(authForm).toContain("case 'link_invalid'");
  });
});
