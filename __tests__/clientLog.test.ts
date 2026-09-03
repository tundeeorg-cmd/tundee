/**
 * The pipe that lets us see what a phone saw, and the guards that stop the
 * button hanging when it does not.
 *
 * The save button works on desktop Chrome and spins forever on Android Chrome —
 * same user, same profile, same deployment. Every fact that would explain the
 * difference lives in a browser we cannot reach, so the first fix is not a fix
 * at all: it is a way to find out.
 *
 * These tests exercise lib/clientLog directly and assert the wiring in
 * /profile/setup by reading the source, since the page itself needs a DOM and a
 * Supabase session to run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withTimeout, TimeoutError } from '@/lib/clientLog';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Comments quote the code they replaced, so searches must ignore them. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const SETUP_PAGE = read('app/profile/setup/page.tsx');
const SETUP_CODE = code('app/profile/setup/page.tsx');
const LOG_ROUTE  = read('app/api/client-log/route.ts');

// ─── withTimeout ─────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves normally when the promise settles in time', async () => {
    const p = withTimeout(Promise.resolve('ok'), 1000, 'test');
    await expect(p).resolves.toBe('ok');
  });

  it('propagates a rejection rather than masking it as a timeout', async () => {
    // A real network error must stay a network error; reporting it as a
    // timeout would send us looking at latency instead of at the failure.
    const p = withTimeout(Promise.reject(new Error('offline')), 1000, 'test');
    await expect(p).rejects.toThrow('offline');
  });

  it('rejects with a TimeoutError when the promise never settles', async () => {
    // The whole point: supabase-js and fetch both wait forever by default, and
    // forever is what the student experiences as a spinner that never stops.
    const p = withTimeout(new Promise(() => {}), 15_000, 'POST /api/profile/setup');
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });

  it('names what timed out, so a log line is actionable', async () => {
    const p = withTimeout(new Promise(() => {}), 100, 'getSession on mount');
    const assertion = expect(p).rejects.toThrow(/getSession on mount timed out after 100ms/);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });

  it('does not fire the timer after the promise settles', async () => {
    // An un-cleared timer would reject a promise nobody is listening to, which
    // surfaces as an unhandled rejection — noise in the very log we are trying
    // to make readable.
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await withTimeout(Promise.resolve(1), 1000, 'test');
    await vi.advanceTimersByTimeAsync(2000);
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

// ─── The route ───────────────────────────────────────────────────────────────

describe('/api/client-log', () => {
  it('is rate limited per IP', () => {
    // A public, unauthenticated endpoint that writes to our logs is a way to
    // fill them; without this it is also a way to hide a real incident.
    expect(LOG_ROUTE).toContain('rateLimited');
    expect(LOG_ROUTE).toContain('x-forwarded-for');
  });

  it('caps the body before parsing it, not after', () => {
    // Reading an unbounded body into memory to discover it is too big is not a
    // limit.
    const declaredIdx = LOG_ROUTE.indexOf("content-length");
    const parseIdx    = LOG_ROUTE.indexOf('JSON.parse');
    expect(declaredIdx).toBeGreaterThan(-1);
    expect(declaredIdx).toBeLessThan(parseIdx);
  });

  it('truncates each field separately', () => {
    for (const cap of ['MAX_MESSAGE', 'MAX_URL', 'MAX_UA', 'MAX_CONTEXT_CHARS']) {
      expect(LOG_ROUTE, cap).toContain(cap);
    }
  });

  it('strips control characters so a payload cannot forge log lines', () => {
    // Without this, a newline in `message` lets a stranger write what looks
    // like one of our own log lines.
    expect(LOG_ROUTE).toContain('\\u0000-\\u001F');
  });

  it('answers 204 even when it refuses, so a client cannot loop on failure', () => {
    // These are sent from error handlers. An error response invites a retry
    // that reports the failure to report.
    expect(LOG_ROUTE).not.toContain('status: 429');
    expect(LOG_ROUTE).toContain('status: 204');
  });

  it('logs under a single searchable prefix', () => {
    expect(LOG_ROUTE).toContain("console.error('[client]'");
  });

  it('never touches the database', () => {
    expect(LOG_ROUTE).not.toContain('supabase');
  });
});

// ─── Wiring on /profile/setup ────────────────────────────────────────────────

describe('the wizard reports where it got to', () => {
  it('logs the tap itself, before anything can fail', () => {
    // Distinguishes "the handler never ran" from "the handler hung", which look
    // identical on a phone.
    expect(SETUP_CODE).toContain('[setup] save tapped');
  });

  it('logs the payload before sending, the success, and the failure', () => {
    for (const marker of ['[setup] posting answers', '[setup] saved', '[setup] save failed']) {
      expect(SETUP_CODE, marker).toContain(marker);
    }
  });

  it('distinguishes a timeout from a transport failure in the log', () => {
    expect(SETUP_CODE).toContain('[setup] save timed out');
    expect(SETUP_CODE).toContain('TimeoutError');
  });

  it('reports a missing session instead of returning silently', () => {
    expect(SETUP_CODE).toContain('[setup] save rejected: no session');
  });

  it('installs global handlers for errors nothing else catches', () => {
    // An unhandled rejection is how a button stops responding with no trace.
    expect(SETUP_CODE).toContain('installGlobalErrorReporting');
  });
});

describe('the button cannot hang', () => {
  it('bounds the save with a timeout', () => {
    expect(SETUP_CODE).toContain('SAVE_TIMEOUT_MS');
    expect(SETUP_CODE).toMatch(/withTimeout\(\s*fetch\(/);
  });

  it('bounds getSession on mount too', () => {
    // It refreshes over the network when the token has expired — the state a
    // phone returning from the LINE app is in.
    expect(SETUP_CODE).toMatch(/withTimeout\(supabase\.auth\.getSession\(\)/);
  });

  it('clears the spinner in finally, not per branch', () => {
    // Every branch clearing it individually means every new branch is a chance
    // to forget, and forgetting looks exactly like the hang being chased.
    expect(SETUP_CODE).toMatch(/\} finally \{[\s\S]{0,80}setSaving\(false\);/);
  });

  it('has no branch that returns while still saving', () => {
    const handleSave = SETUP_CODE.slice(
      SETUP_CODE.indexOf('async function handleSave()'),
      SETUP_CODE.indexOf('async function handleSave()') + 4_000,
    );
    // setSaving(false) before a return is the old per-branch pattern; with the
    // finally in place it should appear nowhere inside the body.
    expect(handleSave).not.toMatch(/setSaving\(false\);\s*\n\s*return;/);
  });
});

describe('coming back from the LINE app', () => {
  it('detects a bfcache restore', () => {
    // Android Chrome serves the return from back/forward cache: nothing
    // re-runs, and the Supabase client still holds the token it had before the
    // trip. pageshow+persisted is the only signal that this happened.
    expect(SETUP_CODE).toContain("addEventListener('pageshow'");
    expect(SETUP_CODE).toContain('event.persisted');
  });

  it('refreshes the session when it happens, with a bound', () => {
    expect(SETUP_CODE).toMatch(/withTimeout\(supabase\.auth\.refreshSession\(\)/);
  });

  it('does not redirect on a failed refresh', () => {
    // The save path already reports 401 honestly and keeps the draft.
    // Redirecting mid-wizard on a guess would throw away the answers.
    const idx = SETUP_CODE.indexOf('bfcache');
    const region = SETUP_CODE.slice(idx, idx + 1_500);
    expect(region).not.toContain("router.replace('/auth')");
  });
});

describe('an expired session offers the one action that works', () => {
  it('shows a sign-in link, not a retry button', () => {
    // Retrying a request that 401'd fails identically; a retry button there is
    // a lie the student pays for in confidence.
    expect(SETUP_PAGE).toContain("href=\"/auth?next=/profile/setup\"");
    expect(SETUP_PAGE).toMatch(/error === 'unauthorized'/);
  });

  it('tells them their answers are safe', () => {
    // The reason students abandon this screen is assuming eight minutes of
    // typing is gone.
    expect(SETUP_PAGE).toContain('คำตอบของคุณถูกเก็บไว้แล้ว');
  });

  it('persists the draft on the 401 path', () => {
    const idx = SETUP_CODE.indexOf('[setup] save rejected: no session');
    expect(SETUP_CODE.slice(idx, idx + 300)).toContain('persistStep');
  });
});
