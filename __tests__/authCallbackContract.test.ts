/**
 * The contract between the sign-in email and /auth/callback.
 *
 * A broken magic link cost real signups and nothing caught it, because the two
 * halves live in different places: the link is built in an email template, and
 * the code that consumes it is a route handler. Neither had a test that said
 * what shape the other must produce.
 *
 * These read the actual template files and the actual route source, so a change
 * to either that breaks the pairing fails here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const magic    = read('emails/supabase/magic-link.paste.html');
const confirm  = read('emails/supabase/confirm-signup.paste.html');
const callback = read('app/auth/callback/route.ts');
const emailApi = read('app/api/auth/email-link/route.ts');
const authPage = read('app/auth/page.tsx');

describe('the email must link to OUR callback, not Supabase /auth/v1/verify', () => {
  it('templates carry token_hash and type, which the callback reads', () => {
    for (const [name, tpl] of [['magic-link', magic], ['confirm-signup', confirm]] as const) {
      expect(tpl, name).toContain('token_hash={{ .TokenHash }}');
      expect(tpl, name).toContain('type=');
    }
  });

  it('templates no longer use ConfirmationURL', () => {
    // .ConfirmationURL points at /auth/v1/verify, which returns the session in
    // the URL fragment. Fragments are never sent to a server route handler, so
    // the callback receives nothing and cannot sign the user in.
    for (const [name, tpl] of [['magic-link', magic], ['confirm-signup', confirm]] as const) {
      expect(tpl, name).not.toContain('ConfirmationURL');
      expect(tpl, name).not.toContain('/auth/v1/verify');
    }
  });

  it('uses the right verification type per template', () => {
    expect(magic).toContain('type=magiclink');
    expect(confirm).toContain('type=signup');
  });

  it('the code path builds the same shape, not action_link', () => {
    expect(emailApi).toContain('hashed_token');
    expect(emailApi).toContain('token_hash=');
    // action_link is the same /auth/v1/verify trap in API form.
    expect(emailApi).not.toContain('properties?.action_link');
  });
});

describe('the callback reads what the email sends', () => {
  it('accepts token_hash + type', () => {
    expect(callback).toContain("searchParams.get('token_hash')");
    expect(callback).toContain('verifyOtp');
  });

  it("declares 'magiclink' as an accepted verification type", () => {
    // The cast previously omitted it, so the one type our links actually use
    // was not in the list a reader would check against.
    expect(callback).toContain("'magiclink'");
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

describe('user-facing copy tells the truth', () => {
  it('does not claim expiry as the catch-all', () => {
    // Users hit "your link expired", requested another, and hit it again.
    expect(authPage).not.toContain('ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
  });

  it('uses the supplied Thai copy for each state', () => {
    expect(authPage).toContain('ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง');
    expect(authPage).toContain('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  });

  it('handles both new error codes', () => {
    expect(authPage).toContain("case 'no_credentials'");
    expect(authPage).toContain("case 'link_invalid'");
  });
});
