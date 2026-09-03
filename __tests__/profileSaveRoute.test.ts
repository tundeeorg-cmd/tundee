/**
 * Saving from /profile, and the two ways it used to fail invisibly.
 *
 * 3 Sep 2026: a student reported that saving their profile did nothing. The
 * Vercel log held GET /profile 200 and no write of any kind — indistinguishable
 * from them never having pressed the button. Two separate causes, both of which
 * made the failure unobservable rather than merely broken:
 *
 *   1. /profile wrote to PostgREST from the browser. That request goes to
 *      supabase.co and never reaches us, so the entire record of a failure was
 *      a Thai toast on a phone we cannot see.
 *
 *   2. The wizard's handleSave awaited supabase.auth.getUser() before its
 *      fetch. getUser() is a network call with no timeout; in the Facebook
 *      webview a stalled connection left the button spinning and
 *      /api/profile/setup was never called at all.
 *
 * These tests are about observability as much as correctness: a save that fails
 * has to leave a trace on a server we control.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Source with comments removed.
 *
 * The comments explaining these fixes quote the code they replaced, so a naive
 * search finds the old shape in the very prose saying it is gone. Twice now.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PROFILE_PAGE = read('app/profile/page.tsx');
const SETUP_PAGE   = read('app/profile/setup/page.tsx');
const SAVE_ROUTE   = read('app/api/profile/save/route.ts');
const SETUP_ROUTE  = read('app/api/profile/setup/route.ts');

// ─── Nothing writes profiles from the browser ────────────────────────────────

describe('every profile write goes through a route we can see', () => {
  it('leaves no client-side write to profiles anywhere in the browser bundle', () => {
    // Checking the page alone was not enough: uploadAvatar lives in
    // lib/profile.ts and wrote to profiles from the browser, so the first
    // version of this test passed while a client write was still shipping.
    // Every module the browser can load is checked instead.
    const clientModules = [
      'app/profile/page.tsx',
      'app/profile/setup/page.tsx',
      'lib/profile.ts',
      'components/Nav.tsx',
      'components/StudentProfileForm.tsx',
    ];
    for (const mod of clientModules) {
      expect(code(mod), mod).not.toMatch(/from\('profiles'\)[\s\S]{0,120}\.(upsert|update|insert)\(/);
    }
  });

  it('checks the result of the avatar row write', () => {
    // It used to be awaited and discarded, so a rejected write still returned a
    // URL and the student saw a picture that was never saved.
    const lib = read('lib/profile.ts');
    expect(lib).toContain("fetch('/api/profile/save'");
    expect(lib).toMatch(/if \(!res\.ok\)[\s\S]{0,220}throw new Error/);
  });

  it('posts to /api/profile/save instead', () => {
    expect(PROFILE_PAGE).toContain("fetch('/api/profile/save'");
  });

  it('still reads through the client, which was never the problem', () => {
    // Only writes moved. A failed read shows as an empty form, which is
    // self-evident to the student; a failed write silently loses their answers.
    expect(PROFILE_PAGE).toMatch(/from\('profiles'\)[\s\S]{0,80}\.select\(/);
  });
});

// ─── The hang ────────────────────────────────────────────────────────────────

describe('nothing blocks the wizard between the tap and the request', () => {
  it('does not call getUser() inside handleSave', () => {
    const handleSave = SETUP_PAGE.slice(
      SETUP_PAGE.indexOf('async function handleSave()'),
      SETUP_PAGE.indexOf('// ── Randomize into a ranking arm'),
    );
    expect(handleSave.length).toBeGreaterThan(0);

    // Comments stripped first. The block that explains why the call is gone
    // names it, and matching that would make this test pass or fail on prose.
    const code = handleSave
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    // A network call with no timeout, sitting in front of the only request
    // that matters. In a webview it left the button spinning forever.
    expect(code).not.toContain('supabase.auth.getUser()');
    // And the explanation stays, so nobody reinstates it.
    expect(handleSave).toContain('deliberately no supabase.auth.getUser()');
  });

  it("relies on the route's own 401 instead", () => {
    expect(SETUP_ROUTE).toContain("error: 'unauthorized' }, { status: 401 }");
    expect(SETUP_PAGE).toContain('res.status === 401');
  });
});

// ─── The route ───────────────────────────────────────────────────────────────

describe('/api/profile/save', () => {
  it('takes the row id from the session, never the request body', () => {
    // Otherwise anyone could patch another student's profile by posting an id.
    expect(SAVE_ROUTE).toContain('const { data: { user }, error: authError } = await supabase.auth.getUser()');
    expect(SAVE_ROUTE).toContain('id: user.id');
    expect(SAVE_ROUTE).not.toMatch(/id:\s*body\./);
  });

  it('runs as the user so RLS still applies', () => {
    // The service role would bypass RLS on a route that accepts a request body.
    expect(SAVE_ROUTE).toContain('createServerSupabaseClient');
    expect(SAVE_ROUTE).not.toContain('SERVICE_ROLE');
  });

  it('logs the real Postgres error server-side', () => {
    expect(SAVE_ROUTE).toContain('console.error');
    for (const field of ['pgCode', 'message', 'details', 'hint', 'userId']) {
      expect(SAVE_ROUTE, field).toContain(field);
    }
  });

  it('never returns the Postgres message to the browser', () => {
    // An English constraint name on a Thai page, naming our schema, is how the
    // 31 Aug outage presented itself to students.
    expect(SAVE_ROUTE).toMatch(/error: 'save_failed'/);
    expect(SAVE_ROUTE).not.toMatch(/json\([^)]*error\.message/);
  });

  it('redacts the display name from the log', () => {
    // The only value in this payload that identifies a person.
    expect(SAVE_ROUTE).toMatch(/display_name: _redacted/);
  });

  it('validates with the same module as the wizard', () => {
    // Two validators would drift, and the drift shows up as a save that the
    // wizard accepts and this page refuses.
    expect(SAVE_ROUTE).toContain("from '@/lib/profile/setupAnswers'");
    expect(SAVE_ROUTE).toContain('validateField');
  });

  it('writes only the keys that were sent', () => {
    // /profile has two independent save buttons; a whole-row write from either
    // would blank what the other owns.
    expect(SAVE_ROUTE).toContain('hasOwnProperty.call(body, k)');
  });

  it('turns a cleared grade level into NULL, not an empty string', () => {
    // profiles_grade_level_check rejects '' explicitly, so passing it through
    // would answer save_failed to a student who simply cleared the field.
    // canonicalizeGradeLevel is what performs the '' → null conversion now
    // (see 'never writes a grade_level the canonicalizer would not' below);
    // this asserts the surrounding code still routes through it.
    expect(SAVE_ROUTE).toMatch(/patch\.grade_level\s*=\s*canonical/);
  });

  it('never writes a grade_level the canonicalizer would not', () => {
    // grade_level moved from a raw pass-through to canonicalizeGradeLevel, the
    // same function buildProfilePayload uses, so a stale value from the
    // retired 'M4'/'M5'/'M6' vocabulary upgrades here too rather than only in
    // the wizard.
    expect(SAVE_ROUTE).toContain('canonicalizeGradeLevel(grade)');
  });

  it('writes grade_year in the same patch as grade_level, coupled to it', () => {
    // /profile sends both from one component's state on one save, which is
    // what lets this correct a stale year rather than merely ignore it — see
    // scripts/20260903_v21_grade_year.sql for why that correction has to
    // happen in code and not a database CHECK.
    const block = SAVE_ROUTE.slice(
      SAVE_ROUTE.indexOf("if (has('gradeLevel')) {"),
      SAVE_ROUTE.indexOf("if (has('gpa')) {"),
    );
    expect(block).toContain('coherentGradeYear(canonical, body.gradeYear)');
  });

  it('reports a CHECK violation as a field problem, not "try again"', () => {
    // Telling someone to retry a write that will fail identically is the loop
    // the wizard spent August in.
    expect(SAVE_ROUTE).toContain("error.code === '23514'");
    expect(SAVE_ROUTE).toMatch(/grade_level_invalid/);
  });
});

// ─── What the student sees ───────────────────────────────────────────────────

describe('the page distinguishes the failures that need different actions', () => {
  it('separates offline, expired session, invalid input and server failure', () => {
    for (const marker of [
      'เชื่อมต่อไม่ได้',       // the request never left the device
      'เซสชันหมดอายุ',        // 401 — retrying cannot work
      'ไม่ถูกต้อง',            // 422 — a value needs fixing
      'บันทึกไม่สำเร็จ',        // 500 — retrying might work
    ]) {
      expect(PROFILE_PAGE, marker).toContain(marker);
    }
  });

  it('clears the spinner even if something throws', () => {
    // Both handlers previously reset their flag as a trailing statement, so an
    // unexpected throw left the button spinning with no way to try again.
    const handlers = PROFILE_PAGE.match(/finally \{\s*\n\s*(\/\/[^\n]*\n\s*)*set(SavingName|SavingProfile)\(false\)/g) ?? [];
    expect(handlers.length).toBe(2);
  });
});
