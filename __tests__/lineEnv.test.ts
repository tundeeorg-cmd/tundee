/**
 * The guards that stop a LINE value sitting in the wrong slot.
 *
 * On 3 Sep 2026 the Messaging API channel secret was pasted into
 * LINE_LOGIN_CHANNEL_SECRET and several hours went into finding it. Nothing in
 * the app noticed: both variables were set, both held a plausible secret, and
 * the only symptom was an error from LINE's servers, much later, naming neither
 * one. These tests are the thing that would have said so immediately.
 *
 * Every case below is a real way to get it wrong — a value pasted into both
 * boxes, or the two redirect URIs swapped — not a hypothetical.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const LINK_URI = 'https://www.tundee.org/api/line/callback';
const AUTH_URI = 'https://www.tundee.org/api/auth/line/callback';

/** Imported fresh each time: the module reads process.env when called, but
 *  vi.stubEnv plus a reset keeps cases from leaking into one another. */
async function env() {
  return import('@/lib/line/env');
}

function setAll(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    LINE_CHANNEL_ACCESS_TOKEN: 'access-token',
    LINE_CHANNEL_SECRET:       'messaging-secret',
    LINE_LOGIN_CHANNEL_ID:     '2010767759',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_REDIRECT_URI:         LINK_URI,
    LINE_AUTH_REDIRECT_URI:    AUTH_URI,
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); });

// ─── The mistake that cost the afternoon ─────────────────────────────────────

describe('two secrets holding one value', () => {
  it('is refused, and the message names both variables', async () => {
    setAll({ LINE_LOGIN_CHANNEL_SECRET: 'messaging-secret' });
    const { assertLineEnvCoherent } = await env();

    expect(() => assertLineEnvCoherent()).toThrow(/LINE_CHANNEL_SECRET/);
    expect(() => assertLineEnvCoherent()).toThrow(/LINE_LOGIN_CHANNEL_SECRET/);
    // The message has to say what to do, not just that something is wrong.
    expect(() => assertLineEnvCoherent()).toThrow(/two different LINE channels/);
  });

  it('accepts them when they differ, which is the only correct state', async () => {
    setAll();
    const { assertLineEnvCoherent } = await env();
    expect(() => assertLineEnvCoherent()).not.toThrow();
  });

  it('says nothing when only one of the two is set', async () => {
    // A partly-configured machine is not a misconfigured one. Comparing an
    // absent value against a present one must not read as equality.
    setAll({ LINE_LOGIN_CHANNEL_SECRET: undefined });
    const { assertLineEnvCoherent } = await env();
    expect(() => assertLineEnvCoherent()).not.toThrow();
  });
});

// ─── The redirect URIs ───────────────────────────────────────────────────────

describe('the two redirect URIs', () => {
  it('are refused when identical', async () => {
    setAll({ LINE_REDIRECT_URI: AUTH_URI });
    const { assertLineEnvCoherent } = await env();
    expect(() => assertLineEnvCoherent()).toThrow(/SAME value/);
  });

  it('are refused when swapped', async () => {
    setAll({ LINE_REDIRECT_URI: AUTH_URI, LINE_AUTH_REDIRECT_URI: LINK_URI });
    const { assertLineEnvCoherent } = await env();
    // Both are wrong, and the message must point at the other variable rather
    // than just declaring the path unexpected.
    expect(() => assertLineEnvCoherent()).toThrow(/LINE_AUTH_REDIRECT_URI/);
  });

  it('does not mistake the sign-in path for the linking path', async () => {
    // '/api/auth/line/callback' must not satisfy a check for
    // '/api/line/callback' — a naive endsWith on the shorter string would let
    // a swapped pair through.
    expect(AUTH_URI.endsWith('/api/line/callback')).toBe(false);
    setAll();
    const { assertLineEnvCoherent, getLineRedirectUri, getLineAuthRedirectUri } = await env();
    expect(() => assertLineEnvCoherent()).not.toThrow();
    expect(getLineRedirectUri()).toBe(LINK_URI);
    expect(getLineAuthRedirectUri()).toBe(AUTH_URI);
  });
});

// ─── Whitespace ──────────────────────────────────────────────────────────────

describe('values are trimmed', () => {
  it('strips whitespace from every accessor', async () => {
    // A secret copied out of the LINE console routinely carries a trailing
    // newline, and Vercel stores exactly what it is given. Untrimmed, the HMAC
    // never matches and the OAuth call is rejected as invalid_client — both
    // indistinguishable from holding the WRONG secret.
    setAll({
      LINE_CHANNEL_ACCESS_TOKEN: '  access-token\n',
      LINE_CHANNEL_SECRET:       '\tmessaging-secret  ',
      LINE_LOGIN_CHANNEL_ID:     ' 2010767759 ',
      LINE_LOGIN_CHANNEL_SECRET: 'login-secret\n',
      LINE_REDIRECT_URI:         `  ${LINK_URI}  `,
      LINE_AUTH_REDIRECT_URI:    `\n${AUTH_URI}\t`,
    });
    const e = await env();

    expect(e.getLineChannelAccessToken()).toBe('access-token');
    expect(e.getLineMessagingChannelSecret()).toBe('messaging-secret');
    expect(e.getLineLoginChannelId()).toBe('2010767759');
    expect(e.getLineLoginChannelSecret()).toBe('login-secret');
    expect(e.getLineRedirectUri()).toBe(LINK_URI);
    expect(e.getLineAuthRedirectUri()).toBe(AUTH_URI);
  });

  it('catches a duplicate that differs only by whitespace', async () => {
    // Without the trim these two are unequal and the guard misses the very
    // mistake it exists for.
    setAll({ LINE_LOGIN_CHANNEL_SECRET: ' messaging-secret\n' });
    const { assertLineEnvCoherent } = await env();
    expect(() => assertLineEnvCoherent()).toThrow(/SAME value/);
  });

  it('treats an all-whitespace value as absent, not as a value', async () => {
    setAll({ LINE_LOGIN_CHANNEL_SECRET: '   ' });
    const { getLineLoginChannelSecret } = await env();
    expect(() => getLineLoginChannelSecret()).toThrow(/LINE_LOGIN_CHANNEL_SECRET is not set/);
  });
});

// ─── Missing variables ───────────────────────────────────────────────────────

describe('a missing variable names itself', () => {
  it('says which variable, what it is, and where to get it', async () => {
    setAll({ LINE_LOGIN_CHANNEL_SECRET: undefined });
    const { getLineLoginChannelSecret } = await env();

    let message = '';
    try { getLineLoginChannelSecret(); } catch (e) { message = (e as Error).message; }

    expect(message).toContain('LINE_LOGIN_CHANNEL_SECRET');
    // The console page, because "it is missing" is not actionable at 2am.
    expect(message).toContain('LINE Developers Console');
    expect(message).toContain('Vercel');
    // And it must steer away from the secret that is easy to grab instead.
    expect(message).toMatch(/NOT the Messaging API secret/);
  });
});

// ─── Startup ─────────────────────────────────────────────────────────────────

describe('the startup check', () => {
  it('passes on a correctly configured production deployment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    setAll();
    const { validateLineEnvAtStartup } = await env();
    expect(() => validateLineEnvAtStartup()).not.toThrow();
  });

  it('refuses to boot production when LINE sign-in cannot work', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    setAll({ LINE_LOGIN_CHANNEL_SECRET: undefined });
    const { validateLineEnvAtStartup } = await env();
    expect(() => validateLineEnvAtStartup()).toThrow(/LINE_LOGIN_CHANNEL_SECRET/);
  });

  it('does NOT refuse a Preview deployment that lacks the LINE secrets', async () => {
    /*
     * The first version of this check tested NODE_ENV, which Vercel sets to
     * 'production' on Preview builds as well. LINE's secrets are commonly
     * scoped to the Production environment alone, so every Preview 500'd — and
     * that broke the one workflow that makes a startup throw safe: opening the
     * Preview to confirm the configuration BEFORE merging to production.
     */
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    setAll({
      LINE_LOGIN_CHANNEL_ID:     undefined,
      LINE_LOGIN_CHANNEL_SECRET: undefined,
      LINE_AUTH_REDIRECT_URI:    undefined,
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateLineEnvAtStartup } = await env();

    expect(() => validateLineEnvAtStartup()).not.toThrow();
    // Reported, so a Preview whose LINE button does nothing is explainable.
    expect(spy.mock.calls.flat().join(' ')).toContain('LINE_LOGIN_CHANNEL_SECRET');
    spy.mockRestore();
  });

  it('still refuses a Preview whose secrets are duplicated', async () => {
    // A value in the wrong slot is wrong in every environment, and catching it
    // in Preview is the entire point of having one. This is also what makes a
    // redeployed Preview a diagnostic: if it boots, the fault was missing
    // variables; if it still 500s, two values are the same.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    setAll({ LINE_LOGIN_CHANNEL_SECRET: 'messaging-secret' });
    const { validateLineEnvAtStartup } = await env();
    expect(() => validateLineEnvAtStartup()).toThrow(/SAME value/);
  });

  it('does not take the site down over the bot-only variables', async () => {
    // Reminders and account linking degrade; sign-in does not. Refusing to boot
    // over a linking flow that may never have been registered would be a worse
    // outage than the one being prevented.
    vi.stubEnv('NODE_ENV', 'production');
    setAll({ LINE_REDIRECT_URI: undefined, LINE_CHANNEL_SECRET: undefined });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateLineEnvAtStartup } = await env();

    expect(() => validateLineEnvAtStartup()).not.toThrow();
    // Silence would defeat the point: it has to be visible in the boot log.
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.flat().join(' ')).toContain('LINE_REDIRECT_URI');
    spy.mockRestore();
  });

  it('lets development run without LINE configured at all', async () => {
    // Requiring every contributor to hold production secrets to run `next dev`
    // is its own problem, and the flow cannot complete against localhost anyway.
    vi.stubEnv('NODE_ENV', 'development');
    for (const k of [
      'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'LINE_LOGIN_CHANNEL_ID',
      'LINE_LOGIN_CHANNEL_SECRET', 'LINE_REDIRECT_URI', 'LINE_AUTH_REDIRECT_URI',
    ]) vi.stubEnv(k, '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateLineEnvAtStartup } = await env();

    expect(() => validateLineEnvAtStartup()).not.toThrow();
    spy.mockRestore();
  });

  it('still refuses a wrong value in development', async () => {
    // Absent is tolerable locally; definitely-wrong never is.
    vi.stubEnv('NODE_ENV', 'development');
    setAll({ LINE_LOGIN_CHANNEL_SECRET: 'messaging-secret' });
    const { validateLineEnvAtStartup } = await env();
    expect(() => validateLineEnvAtStartup()).toThrow(/SAME value/);
  });
});

// ─── Wiring ──────────────────────────────────────────────────────────────────

describe('nothing reads a LINE variable behind this module\'s back', () => {
  const SITES = [
    'app/api/auth/line/start/route.ts',
    'app/api/auth/line/callback/route.ts',
    'app/api/line/callback/route.ts',
    'app/api/line/connect/route.ts',
    'app/api/line/webhook/route.ts',
    'lib/line/push.ts',
  ];

  it('routes every read through lib/line/env', () => {
    for (const site of SITES) {
      // A direct process.env.LINE_* read is a read that skips the trim and the
      // coherence guards — which is how this class of bug got in.
      expect(read(site), site).not.toMatch(/process\.env\.LINE_/);
      expect(read(site), site).toContain("@/lib/line/env");
    }
  });

  it('is actually wired to server startup', () => {
    // The hook is inert on Next 14 without the experimental flag, and its
    // absence is silent — exactly the failure mode being designed out.
    expect(read('instrumentation.ts')).toContain('validateLineEnvAtStartup');
    expect(read('next.config.mjs')).toContain('instrumentationHook: true');
  });
});
