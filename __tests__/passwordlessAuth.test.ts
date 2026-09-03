/**
 * The passwordless sign-in: the code, the LINE path, and the answers that must
 * survive a browser switch.
 *
 * The failure this guards against is not a crash. It is a student who signs up
 * successfully and arrives with nothing — no profile row, or a profile with
 * their /start answers missing, so the matching engine has nothing to serve
 * them. That has happened twice now, both times silently, so the assertions
 * here are mostly about carriers staying wired end to end rather than about
 * any single function's return value.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  isPlausibleEmail, normalizeEmail, normalizeOtpCode,
  classifyOtpError, likelyExpired, otpMessage,
  OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS, OTP_VALID_SECONDS,
} from '@/lib/auth/otp';
import { isIntakeId, intakeIdFrom, INTAKE_PARAM, INTAKE_TTL_DAYS } from '@/lib/intake/pendingIntake';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FORM      = read('app/auth/AuthForm.tsx');
const SHELL     = read('app/auth/AuthShell.tsx');
const PAGE      = read('app/auth/page.tsx');
const CALLBACK  = read('app/auth/callback/route.ts');
const RESOLVE   = read('lib/auth/resolveRedirect.ts');
const LINE_START= read('app/api/auth/line/start/route.ts');
const LINE_CB   = read('app/api/auth/line/callback/route.ts');
const INTAKE_API= read('app/api/intake/route.ts');
const PREVIEW   = read('app/start/PreviewMatcher.tsx');
const MIGRATION = read('scripts/20260901_v20_pending_intake.sql');

// ─── The code ────────────────────────────────────────────────────────────────

describe('the six-digit code', () => {
  it('accepts real addresses and rejects obvious typos', () => {
    for (const good of ['a@b.co', 'somchai.j@gmail.com', 'x+tag@sub.domain.ac.th']) {
      expect(isPlausibleEmail(good), good).toBe(true);
    }
    for (const bad of ['', 'somchai', 'somchai@', '@gmail.com', 'a b@c.com', 'a@b']) {
      expect(isPlausibleEmail(bad), bad).toBe(false);
    }
  });

  it('is permissive rather than clever — a real address must never be refused', () => {
    // Rejecting a student's actual email is far worse than accepting one that
    // bounces: one is recoverable, the other ends the signup.
    expect(isPlausibleEmail('very.unusual+but.real@student.chula.ac.th')).toBe(true);
  });

  it('normalises what a student actually types or pastes', () => {
    expect(normalizeEmail('  Somchai@Gmail.COM ')).toBe('somchai@gmail.com');
    expect(normalizeOtpCode('123 456')).toBe('123456');
    expect(normalizeOtpCode('12-34-56')).toBe('123456');
    expect(normalizeOtpCode('1234567890')).toHaveLength(OTP_LENGTH);
    expect(normalizeOtpCode('abc123')).toBe('123');
  });

  it('turns every Supabase failure into Thai, never the raw message', () => {
    expect(classifyOtpError({ status: 429 })).toBe('rate_limited');
    expect(classifyOtpError({ message: 'For security purposes, you can only request this after 44 seconds' }))
      .toBe('rate_limited');
    expect(classifyOtpError({ message: 'Token has expired or is invalid' })).toBe('code_expired');
    expect(classifyOtpError({ message: 'Invalid login credentials' })).toBe('code_invalid');
    expect(classifyOtpError(null)).toBe('verify_failed');

    // Every code must have Thai copy, or a student sees `undefined`.
    for (const code of ['invalid_email', 'code_invalid', 'code_expired', 'rate_limited',
                        'consent_required', 'network', 'send_failed', 'verify_failed'] as const) {
      const th = otpMessage(code, 'th');
      expect(th, code).toBeTruthy();
      expect(th, `${code} is not Thai`).toMatch(/[฀-๿]/);
    }
  });

  it('tells an expired code apart from a wrong one by elapsed time', () => {
    // Supabase returns the same string for both, and only the expiry copy names
    // the button that fixes it.
    const now = 1_800_000_000_000;
    expect(likelyExpired(now - 5_000, now)).toBe(false);
    expect(likelyExpired(now - (OTP_VALID_SECONDS + 60) * 1000, now)).toBe(true);
    expect(otpMessage('code_expired', 'th')).toContain('ส่งใหม่');
  });

  it('holds resend for a minute, matching Supabase\'s own interval', () => {
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(FORM).toContain('setCooldown(OTP_RESEND_COOLDOWN_SECONDS)');
    expect(FORM).toMatch(/cooldown > 0/);
  });

  it('submits by itself when the sixth digit lands, including iOS autofill', () => {
    expect(FORM).toMatch(/v\.length === OTP_LENGTH\) void verifyCode\(v\)/);
  });
});

// ─── The order on screen ─────────────────────────────────────────────────────

describe('the screen is in the order the brief specifies', () => {
  const order = [
    'เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ',  // 1 heading
    'เข้าสู่ระบบด้วย LINE',                // 2 LINE
    'เร็วที่สุด ไม่ต้องจำรหัสผ่าน',        // 2 sub-line
    'หรือ',                                 // 3 divider
    'ส่งรหัสเข้าอีเมล',                    // 4 email
    'ฉันยอมรับ',                            // 5 consent
  ];

  for (const src of [['AuthForm', FORM], ['AuthShell', SHELL]] as const) {
    it(`${src[0]} renders them top to bottom`, () => {
      let cursor = -1;
      for (const needle of order) {
        const at = src[1].indexOf(needle, cursor + 1);
        expect(at, `${needle} missing or out of order in ${src[0]}`).toBeGreaterThan(cursor);
        cursor = at;
      }
    });
  }

  it('uses LINE green, filled, on the primary button', () => {
    expect(FORM).toContain('bg-[#06C755]');
    expect(SHELL).toContain('bg-[#06C755]');
  });

  it('drops the password affordances entirely', () => {
    for (const [name, src] of [['form', FORM], ['shell', SHELL]] as const) {
      expect(src, name).not.toContain('ลืมรหัสผ่าน');
      expect(src, name).not.toContain('อย่างน้อย 8 ตัวอักษร');
      expect(src, name).not.toContain('ไม่ต้องยืนยันอีเมล เข้าใช้งานได้ทันที');
    }
  });

  it('gates both methods on consent, and says so rather than going dead', () => {
    // A disabled button with no explanation reads as a broken page. The brief
    // asks for disabled; the standing hint is what makes that safe.
    expect(FORM).toContain('const blocked = !consent');
    expect(FORM).toContain('disabled={blocked || busy}');
    expect(FORM).toContain('กรุณายอมรับเงื่อนไขก่อน');
  });
});

// ─── Webview ─────────────────────────────────────────────────────────────────

describe('inside the Facebook webview', () => {
  it('escapes to Chrome on Android and never opens a popup', () => {
    expect(FORM).toContain(`buildEscapeUrl(start, 'android')`);
    expect(FORM).toContain('window.location.href');
    // The call, not the word — the file explains in prose why it never opens one.
    expect(FORM, 'popups are blocked in webviews').not.toMatch(/window\.open\s*\(/);
  });

  it('offers copy-link on iOS, where nothing can be launched', () => {
    expect(FORM).toContain('คัดลอกลิงก์');
    expect(FORM).toContain('เปิดใน Safari');
    expect(FORM).toContain('navigator.clipboard.writeText');
  });

  it('keeps the email path working without leaving the webview', () => {
    // This is the only method that completes in place, so nothing may gate it
    // on the browser being escapable.
    expect(FORM).not.toMatch(/lineAppToAppBlocked[\s\S]{0,200}sendCode/);
    expect(SHELL).toContain('/api/auth/otp/send');
  });
});

// ─── LINE ────────────────────────────────────────────────────────────────────

describe('the LINE authorize URL', () => {
  it('asks for the scopes we actually use', () => {
    // email stays: without it every LINE account gets a synthetic
    // @line.tundee.invalid address and can never be sent a deadline reminder.
    expect(LINE_START).toContain("'scope', 'openid profile email'");
  });

  it('invites the OA friendship by default, which is what reminders need', () => {
    expect(read('lib/line/env.ts')).toContain("'normal' : 'aggressive'");
    expect(LINE_START).toContain("'bot_prompt', getLineBotPrompt()");
  });

  it('never forces re-consent or disables auto login on a first attempt', () => {
    expect(LINE_START).not.toContain("'prompt', 'consent'");
    expect(LINE_START).toMatch(/if \(isRetry\) .*disable_auto_login/);
  });

  it('randomises state per attempt and checks it on return', () => {
    expect(LINE_START).toContain('randomBytes(24)');
    expect(LINE_CB).toContain('line_state_mismatch');
  });
});

// ─── The answers must survive ────────────────────────────────────────────────

describe('the /start answers survive a browser switch', () => {
  it('are parked on the server the moment they are given', () => {
    expect(PREVIEW).toContain("fetch('/api/intake'");
    expect(PREVIEW).toContain('storeIntakeId');
    // Never blocking: a failed park must not cost the student their results.
    expect(PREVIEW).toContain(`void fetch('/api/intake'`);
  });

  it('validates before storing, so a row can only hold usable answers', () => {
    expect(INTAKE_API).toContain('parsePreviewInput');
    expect(INTAKE_API).toContain("error: 'invalid_answers'");
  });

  it('parks with the anon key, not the service role', () => {
    // A public unauthenticated endpoint must not hold a key that could read the
    // whole table if this route ever grew a select.
    expect(INTAKE_API).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(INTAKE_API).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('threads the id through every hop that crosses a boundary', () => {
    expect(FORM).toContain(`qs.set(INTAKE_PARAM, intake)`);       // email redirect
    expect(FORM).toContain('url.searchParams.set(INTAKE_PARAM, intake)'); // LINE start
    expect(LINE_START).toContain('LINE_AUTH_INTAKE_COOKIE');      // across LINE
    expect(LINE_CB).toContain('INTAKE_PARAM, savedIntake');       // back from LINE
    expect(CALLBACK).toContain('intakeParam:  searchParams.get(INTAKE_PARAM)');
    expect(RESOLVE).toContain('claimIntake');
  });

  it('claims once — a replayed URL cannot attach answers to a second account', () => {
    const claim = read('lib/intake/pendingIntake.ts');
    expect(claim).toContain(".is('claimed_by', null)");
  });

  it('never throws on a missing or malformed row', () => {
    const claim = read('lib/intake/pendingIntake.ts');
    expect(claim).toContain('return null');
    expect(claim).toMatch(/catch \(err\)[\s\S]*console\.error/);
  });

  it('recognises only real uuids before touching the database', () => {
    expect(isIntakeId('3f1a5b7c-9d2e-4f60-8a1b-2c3d4e5f6a7b')).toBe(true);
    for (const bad of ['', 'nope', '../../etc/passwd', "1' OR '1'='1", null, undefined]) {
      expect(isIntakeId(bad as unknown), String(bad)).toBe(false);
    }
    expect(intakeIdFrom(null, 'bad', '3f1a5b7c-9d2e-4f60-8a1b-2c3d4e5f6a7b'))
      .toBe('3f1a5b7c-9d2e-4f60-8a1b-2c3d4e5f6a7b');
    expect(intakeIdFrom(null, undefined)).toBeNull();
  });
});

describe('pending_intake is write-only to the public', () => {
  it('grants INSERT and nothing else', () => {
    expect(MIGRATION).toMatch(/FOR INSERT\s+TO anon, authenticated/);
    expect(MIGRATION).toContain('REVOKE SELECT, UPDATE, DELETE');
    // A SELECT policy would make every parked answer readable by anyone with
    // the anon key, which ships in the browser.
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*FOR SELECT/);
  });

  it('enables RLS, or the policies above mean nothing', () => {
    expect(MIGRATION).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('is swept after seven days, and only while unclaimed', () => {
    expect(INTAKE_TTL_DAYS).toBe(7);
    const cron = read('app/api/cron/intake-cleanup/route.ts');
    expect(cron).toContain(".is('claimed_by', null)");
    expect(cron).toContain('CRON_SECRET');
    expect(read('vercel.json')).toContain('/api/cron/intake-cleanup');
  });
});

// ─── No more orphans ─────────────────────────────────────────────────────────

describe('every signed-in user gets a profiles row', () => {
  it('is created at the callback, unconditionally', () => {
    // 39 of 79 accounts had none, so the matching engine could serve them
    // nothing. An empty row makes every later write an update to something
    // that exists.
    expect(RESOLVE).toContain("upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })");
  });

  it('accepts a session that arrives with no token to exchange', () => {
    // The email code is verified in the page, so the callback is reached with
    // neither a code nor a token_hash. Without this branch a successful
    // sign-in would land on ?error=no_credentials.
    expect(CALLBACK).toContain('Already signed in');
    expect(CALLBACK).toMatch(/const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\)[\s\S]{0,120}merge\(\)/);
  });

  it('never writes a grade it could not map, and never does so silently', () => {
    expect(RESOLVE).toContain('canonicalizeGradeLevel');
    expect(RESOLVE).toMatch(/if \(!previewGrade\)[\s\S]{0,400}console\.error/);
  });

  it('keeps the rest of the answers when the grade CHECK rejects them', () => {
    // Until v19 is applied the live constraint still refuses M4-M6. Losing the
    // whole merge over that would recreate the orphan it exists to prevent.
    expect(RESOLVE).toContain("error.code === '23514'");
    expect(RESOLVE).toContain('Retrying without the grade');
  });
});

describe('the no-JavaScript page is a real page', () => {
  it('is handed the stage, or a shell student loops forever', () => {
    expect(PAGE).toContain("one('stage') === 'code'");
    expect(PAGE).toContain('stage={stage}');
    expect(SHELL).toContain("stage === 'code'");
  });

  it('enforces consent without JavaScript', () => {
    expect(SHELL).toMatch(/name=\{CONSENT_PARAM\}[\s\S]{0,200}required/);
    expect(read('app/api/auth/otp/send/route.ts')).toContain('isValidConsent');
  });

  it('exists at all', () => {
    expect(existsSync(join(ROOT, 'app/api/auth/otp/send/route.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'app/api/auth/otp/verify/route.ts'))).toBe(true);
  });
});

describe('the funnel can tell the two methods apart', () => {
  it('labels the completion event by method', () => {
    const conv = read('components/SignupConversion.tsx');
    expect(conv).toContain("eventType: 'signup_completed'");
    expect(conv).toContain("'email_otp'");
    expect(FORM).toContain("method: 'email_otp'");
  });

  it('keeps the ad pixels firing exactly as before', () => {
    const conv = read('components/SignupConversion.tsx');
    expect(conv).toContain('trackSignupComplete(conversion)');
    // Deleted before the event, so a failure loses a conversion rather than
    // double-counting one.
    expect(conv.indexOf('expireSignupConversionCookie'))
      .toBeLessThan(conv.indexOf('trackSignupComplete(conversion)'));
  });
});

// ─── Is any of this actually live? ───────────────────────────────────────────

/**
 * Everything above reads source files, which proves the code is right and
 * proves nothing about production. pending_intake has a deliberately silent
 * failure mode — /api/intake is called with `void fetch`, claimIntake swallows
 * every error — so if the v20 migration was never run, the cross-browser rescue
 * is simply dead and no student, log line or test ever says so. That is the
 * exact shape of the last two outages, so it gets a live probe.
 *
 * Runs only when Supabase credentials are present (locally, from .env.local);
 * skipped in CI, where the offline assertions still run.
 *
 * READ-ONLY. A GET with the anon key writes nothing, and the anon key is the
 * right one to ask with: it is the key that ships in the browser, so what it
 * can see is what the public can see.
 */
function loadAnonEnv(): { url: string; anon: string } | null {
  const fromProcess = {
    url:  process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  if (fromProcess.url && fromProcess.anon) return fromProcess as { url: string; anon: string };
  try {
    const env = Object.fromEntries(
      read('.env.local').split('\n')
        .filter(l => l.includes('=') && !l.trim().startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
    ) as Record<string, string>;
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return { url: env.NEXT_PUBLIC_SUPABASE_URL, anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
    }
  } catch { /* no .env.local — offline run */ }
  return null;
}

const liveAnon = loadAnonEnv();

describe.skipIf(!liveAnon)('pending_intake exists in the live database (read-only probe)', () => {
  it('has been migrated, and leaks nothing to the anon key', async () => {
    const res = await fetch(`${liveAnon!.url}/rest/v1/pending_intake?select=id&limit=1`, {
      headers: { apikey: liveAnon!.anon, Authorization: `Bearer ${liveAnon!.anon}` },
    });
    const body = await res.text();

    // PGRST205 / 42P01 both mean "no such table": v20 was never applied, and
    // every student who signs in from a different browser than they answered
    // in is losing their /start answers right now, silently.
    expect(
      body,
      'scripts/20260901_v20_pending_intake.sql has not been applied — '
      + 'run it in the Supabase SQL Editor. Until then the cross-browser '
      + 'rescue of the /start answers is dead and fails silently.',
    ).not.toMatch(/PGRST205|42P01|Could not find the table/);

    // The table is there. Whether the block is the REVOKE (a permission error)
    // or RLS with no SELECT policy (an empty array), the observable result the
    // migration promises is the same: nothing comes back.
    const rows: unknown = res.status === 200 ? JSON.parse(body) : [];
    expect(rows, 'the anon key can read parked /start answers').toEqual([]);
  }, 20_000);
});
