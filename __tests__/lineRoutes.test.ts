/**
 * LINE sign-in and LINE linking are two features, and both are wired.
 *
 * On 31 Aug 2026 the two LINE callbacks were mistaken for a duplicate and one
 * was proposed for deletion. They were not duplicates, and the distinction
 * survives the move of sign-in to Supabase:
 *
 *   sign-in   /api/auth/line/start → Supabase custom:line → /auth/callback
 *             creates the account; needs no session
 *   linking   /api/line/connect → /api/line/callback
 *             attaches LINE to an existing account so the reminder bot can
 *             reach it; needs a session
 *
 * Both write profiles.line_user_id, which is what makes them look alike.
 * These tests fail if either flow loses a half, or if the retired bridge
 * callback comes back. They do not test LINE itself.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const has  = (p: string) => existsSync(join(ROOT, p));

const AUTH_START     = 'app/api/auth/line/start/route.ts';
const AUTH_CALLBACK  = 'app/auth/callback/route.ts';
const LINK_CALLBACK  = 'app/api/line/callback/route.ts';
const LINK_CONNECT   = 'app/api/line/connect/route.ts';

describe('LINE sign-in: /api/auth/line/start → Supabase custom:line → /auth/callback', () => {
  it('starts on our route and finishes on the shared auth callback', () => {
    expect(has(AUTH_START), 'the start route is missing').toBe(true);
    const start = read(AUTH_START);
    expect(start).toContain('signInWithOAuth');
    expect(start).toContain('LINE_PROVIDER');
    expect(start).toContain('/auth/callback');
  });

  it('is offered on the sign-in page', () => {
    const form  = read('app/auth/AuthForm.tsx');
    const shell = read('app/auth/AuthShell.tsx');
    expect(form + shell).toContain('/api/auth/line/start');
  });

  it('creates the account, and gives the bot its LINE id', () => {
    // Supabase creates the user; the callback writes line_user_id, which the
    // reminder bot and LINE crons address students by.
    const callback = read(AUTH_CALLBACK);
    expect(callback).toContain('lineSubOf');
    expect(callback).toContain('linkLineProfile');
  });

  it('the retired bridge callback stays retired', () => {
    // It minted sessions through placeholder emails. Returning LINE accounts
    // now sign in through their custom:line identity (v23), so a revived
    // bridge would create duplicates.
    expect(has('app/api/auth/line/callback/route.ts')).toBe(false);
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
  it('only linking has a redirect_uri variable of its own', () => {
    // Sign-in's redirect belongs to Supabase now; the variable it used is gone.
    const helper = read('lib/line/env.ts');
    expect(helper).toMatch(/export function getLineRedirectUri/);
    expect(helper).not.toContain('LINE_AUTH_REDIRECT_URI');
  });

  it('each route says which one it is not', () => {
    // The confusion is the bug. Each of these files points at its counterpart
    // so the next reader does not have to derive it.
    expect(read(LINK_CALLBACK)).toContain('/api/auth/line/start');
    expect(read(LINK_CONNECT)).toContain('/api/auth/line/start');
    expect(read(AUTH_START)).toContain('/api/line/connect');
  });

  it('the linking callback is documented in .env.example, and the retired variable is not', () => {
    const env = read('.env.example');
    expect(env).toContain('/api/line/callback');
    expect(env).not.toMatch(/^LINE_AUTH_REDIRECT_URI=/m);
    expect(env).not.toMatch(/^LINE_AUTH_MODE=/m);
  });
});
