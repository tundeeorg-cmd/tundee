/**
 * The two LINE callbacks are two features, and both are wired.
 *
 * On 31 Aug 2026 they were mistaken for a duplicate and one was proposed for
 * deletion. They are not duplicates:
 *
 *   /api/auth/line/callback   sign-in     creates an account from a LINE sub
 *   /api/line/callback        linking     attaches LINE to an existing account
 *
 * They look alike because both write profiles.line_user_id, both are LINE OAuth
 * callbacks, and both live under app/api. What tells them apart is the entry
 * point, the session requirement and the env var — and none of that was asserted
 * anywhere, so nothing would have failed if one had been removed.
 *
 * These tests fail if either flow loses a half. They do not test LINE itself;
 * they test that both routes remain reachable from the UI that offers them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const has  = (p: string) => existsSync(join(ROOT, p));

const AUTH_CALLBACK  = 'app/api/auth/line/callback/route.ts';
const AUTH_START     = 'app/api/auth/line/start/route.ts';
const LINK_CALLBACK  = 'app/api/line/callback/route.ts';
const LINK_CONNECT   = 'app/api/line/connect/route.ts';

describe('LINE sign-in: /api/auth/line/start → /api/auth/line/callback', () => {
  it('both halves exist', () => {
    expect(has(AUTH_START), 'the authorize half is missing').toBe(true);
    expect(has(AUTH_CALLBACK), 'the token-exchange half is missing').toBe(true);
  });

  it('is offered on the sign-in page', () => {
    const form  = read('app/auth/AuthForm.tsx');
    const shell = read('app/auth/AuthShell.tsx');
    expect(form + shell).toContain('/api/auth/line/start');
  });

  it('uses the login redirect_uri, not the linking one', () => {
    const src = read(AUTH_CALLBACK);
    expect(src).toContain('getLineAuthRedirectUri');
    expect(src).not.toContain('getLineRedirectUri(');
  });

  it('creates the account rather than requiring one', () => {
    // The synthetic address is the signature of account creation: LINE often
    // withholds the real email, so this route mints one that is never mailed.
    expect(read(AUTH_CALLBACK)).toContain('syntheticEmail');
  });
});

describe('LINE linking: /api/line/connect → /api/line/callback', () => {
  it('both halves exist', () => {
    expect(has(LINK_CONNECT), 'the authorize half is missing').toBe(true);
    expect(has(LINK_CALLBACK), 'the token-exchange half is missing').toBe(true);
  });

  it('is offered on the tracker, which is the only way in', () => {
    // Delete this button and the route becomes genuinely unreachable — at which
    // point it IS dead code. Until then it is a feature nobody has clicked.
    expect(read('app/tracker/page.tsx')).toContain('/api/line/connect');
  });

  it('uses the linking redirect_uri, not the login one', () => {
    for (const f of [LINK_CONNECT, LINK_CALLBACK]) {
      const src = read(f);
      expect(src, `${f} uses the wrong redirect_uri helper`).toContain('getLineRedirectUri');
      expect(src, `${f} uses the login redirect_uri`).not.toContain('getLineAuthRedirectUri');
    }
  });

  it('requires an existing session, unlike the sign-in flow', () => {
    expect(read(LINK_CONNECT)).toContain('/auth?from=line-connect');
    expect(read(LINK_CALLBACK)).toContain('/auth?from=line-connect');
  });

  it('is what lets deadline reminders reach non-LINE-login users', () => {
    // 12 of 79 accounts came from LINE login; the cron pushes to line_user_id,
    // so without this route the other 67 can never receive a reminder.
    expect(read('app/api/cron/line-reminders/route.ts')).toContain('line_user_id');
  });
});

describe('the two flows stay distinct', () => {
  it('use different redirect_uri env vars', () => {
    const helper = read('lib/line/env.ts');
    expect(helper).toContain('LINE_REDIRECT_URI');
    expect(helper).toContain('LINE_AUTH_REDIRECT_URI');
    // Two callback URLs, registered separately in the LINE console. Collapsing
    // them to one variable breaks whichever flow loses its registration.
    expect(helper).toMatch(/export function getLineRedirectUri/);
    expect(helper).toMatch(/export function getLineAuthRedirectUri/);
  });

  it('each route says which one it is not', () => {
    // The confusion is the bug. Every one of these files carries a pointer to
    // its counterpart so the next reader does not have to derive it.
    expect(read(AUTH_CALLBACK)).toContain('/api/line/callback');
    expect(read(LINK_CALLBACK)).toContain('/api/auth/line/callback');
    expect(read(LINK_CONNECT)).toContain('/api/auth/line/start');
    expect(read(AUTH_START)).toContain('/api/line/connect');
  });

  it('both callback URLs are documented in .env.example', () => {
    const env = read('.env.example');
    expect(env).toContain('/api/line/callback');
    expect(env).toContain('/api/auth/line/callback');
  });
});
