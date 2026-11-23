/**
 * v38 — the /start funnel changes around the data: covariates sent at randomization,
 * consent as an explicit two-button choice, clicks kept on the ranked list, the email
 * form opened for the email link, no stale footer date, LINE sign-ups counted, and
 * the migrations shaped like every other one (additive, verify block, rollback).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { START_CONSENT } from '@/lib/research/startConsent';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';
import { emailOpenFor } from '@/lib/auth/authHeading';
import { diagnoseSignups, isLineAccount, buildSignupAlertEmail, type SignupCounts } from '@/lib/auth/signupAlert';

const read = (p: string) => readFileSync(p, 'utf8');

// ── Task 1: the randomize route stores the covariates ───────────────────────

const store = vi.hoisted(() => ({ saved: [] as { assignment: Record<string, unknown>; covariates: Record<string, unknown> | null }[] }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/research/anonStore', async (orig) => {
  const real = await orig<typeof import('@/lib/research/anonStore')>();
  return {
    ...real,
    saveAnonAssignment: async (_a: unknown, assignment: Record<string, unknown>, covariates: Record<string, unknown> | null) => {
      store.saved.push({ assignment, covariates });
      return { row: { ...assignment, claimed_by: null }, created: true, error: null, covariatesStored: true };
    },
  };
});

import { POST as randomize } from '@/app/api/start/randomize/route';

describe('POST /api/start/randomize stores the covariates (task 1)', () => {
  beforeEach(() => {
    process.env.ANON_RANDOMIZATION = 'on';
    process.env.RANDOMIZATION_SALT = 'a-test-salt-that-is-long-enough';
    store.saved = [];
  });

  it('answers + UTMs + landing variant land on the assignment, with region and recruitment source computed server-side', async () => {
    const res = await randomize(new NextRequest('https://www.tundee.org/api/start/randomize', {
      method: 'POST',
      body: JSON.stringify({
        answers: { level: 'uni', province: 'ขอนแก่น', income: 2, gpa: null }, adult: true, consent: true,
        attribution: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'isaan_2026', utm_content: 'ad1', landing_variant: 'default',
          // A page cannot choose these: they are computed, not read.
          recruitment_source: 'bkk_2026', region_group: 'bangkok_metro' },
      }),
    }));
    expect((await res.json()).randomized).toBe(true);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].covariates).toEqual({
      level: 'uni', province: 'ขอนแก่น', region_group: 'northeast', income_bracket: 2, gave_gpa: false,
      utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'isaan_2026', utm_content: 'ad1',
      recruitment_source: 'isaan_2026', landing_variant: 'default',
    });
    expect(store.saved[0].assignment).toMatchObject({ stratum: 'northeast|2', research_consent_version: CURRENT_CONSENT_VERSION });
  });

  it('a decliner still creates nothing', async () => {
    await randomize(new NextRequest('https://www.tundee.org/api/start/randomize', {
      method: 'POST', body: JSON.stringify({ answers: { level: 'uni', province: 'ขอนแก่น', income: 2, gpa: null }, adult: true, consent: false }),
    }));
    expect(store.saved).toHaveLength(0);
  });
});

describe('the page forwards what the route needs (task 1)', () => {
  it('reads utm_content on /start and passes the attribution down to the randomize call', () => {
    expect(read('app/start/page.tsx')).toContain('utm_content: typeof searchParams.utm_content');
    expect(read('app/start/StartLanding.tsx')).toContain('utm_content:     adParams.utm_content');
    expect(read('app/start/StartLanding.tsx')).toContain('landing_variant: landingVariant');
    expect(read('app/start/PreviewMatcher.tsx')).toContain('adult: true, consent: true, attribution: attribution ?? {}');
  });
});

// ── Task 5: consent as an explicit, voluntary choice ─────────────────────────

describe('consent is two equal buttons, neither pre-selected (task 5)', () => {
  const src = read('app/start/PreviewMatcher.tsx');

  it('offers join / decline with the agreed labels, and no tick box', () => {
    expect(START_CONSENT.join).toBe('เข้าร่วมงานวิจัย (ไม่ระบุตัวตน)');
    expect(START_CONSENT.decline).toBe('ไม่เข้าร่วม');
    expect(src).toContain("[['join', START_CONSENT.join], ['decline', START_CONSENT.decline]]");
    expect(src).not.toContain('type="checkbox"');
  });

  it('starts unchosen and blocks submit only for a declared adult who has not chosen', () => {
    expect(src).toContain('useState<ResearchChoice>(null)');
    expect(src).toContain('researchConsentOffered && adult === true && researchChoice === null');
    expect(src).toContain('disabled={choicePending}');
  });

  it('keeps the body text and the details link; the consent version is unchanged', () => {
    expect(src).toContain('{START_CONSENT.body}');
    expect(src).toContain('START_CONSENT.detailsHref');
    expect(CURRENT_CONSENT_VERSION).toBe('2026-07-v1');
    expect(START_CONSENT.body).toContain('การเข้าร่วมวิจัยเป็นความสมัครใจ');
  });

  it('logs research_participation exactly as before, and randomizes only on "join"', () => {
    expect(src).toContain('research_participation: researchParticipation({ offered: researchConsentOffered, signedIn, adult, consented: researchConsent })');
    expect(src).toContain("const researchConsent = researchChoice === 'join';");
    expect(src).toContain('researchConsentOffered && adult === true && researchConsent');
  });
});

// ── Tasks 2 & 6: results keep clicks on the ranked list, and record them ────

describe('the results (tasks 2, 6)', () => {
  const src = read('app/start/PreviewResults.tsx');
  const matcher = read('app/start/PreviewMatcher.tsx');

  it('records every funder click as an outcome, before the new tab, through the keepalive helper', () => {
    expect(matcher).toContain('onApplyClick={recordApplyClick}');
    const handler = src.slice(src.indexOf('function handleApply'), src.indexOf('function handleApply') + 400);
    expect(handler.indexOf('onApplyClick?.(card.scholarship_id)')).toBeLessThan(handler.indexOf('logFunnelEvent'));
    expect(read('lib/analytics/applyClick.ts')).toContain('keepalive: true');
  });

  it('"ดูเพิ่มอีก 10 ทุน" loads the next page of the same list in place', () => {
    expect(src).toContain("LOAD_MORE_LABEL = 'ดูเพิ่มอีก 10 ทุน'");
    expect(matcher).toContain('offset: results.preview.length');
    expect(src).not.toContain('ดูทั้งหมดได้เลย ไม่ต้องสมัคร');
  });

  it('keeps exactly one secondary link to /scholarships, at the very bottom', () => {
    expect(src.split('/scholarships?from=preview')).toHaveLength(2);
    expect(src.indexOf('/scholarships?from=preview')).toBeGreaterThan(src.indexOf('แก้ไขข้อมูลของฉัน'));
  });

  it('the scholarship page and the tracker record clicks through the same helper (anon cookie bound on the server)', () => {
    expect(read('app/scholarships/td/[id]/page.tsx')).toContain('recordApplyClick(');
    expect(read('app/api/apply-click/route.ts')).toContain('anonIdFromRequest(request)');
  });
});

// ── Task 8: trust details ────────────────────────────────────────────────────

describe('trust fixes (task 8)', () => {
  it('no hand-typed "data updated" month in the footer', () => {
    expect(read('lib/translations.ts')).not.toContain('ข้อมูลทุนอัปเดต');
    expect(read('components/Footer.tsx')).not.toContain('f.updated');
  });

  it('/auth?from=signup (the "สมัครด้วยอีเมล" link) opens the email form directly', () => {
    expect(emailOpenFor('signup')).toBe(true);
    expect(emailOpenFor('track')).toBe(false);
    expect(emailOpenFor(null)).toBe(false);
    expect(read('app/auth/AuthForm.tsx')).toContain("useState(() => emailOpenFor(searchParams.get('from')))");
    expect(read('app/auth/AuthShell.tsx')).toContain('emailOpenFor(from)');
  });
});

// ── Task 9: LINE sign-ups count ──────────────────────────────────────────────

describe('signup alert counts LINE sign-ups (task 9)', () => {
  const base: SignupCounts = {
    newAccounts: 0, landingViews: 120, signupStarted: 0, otpSent: 0, otpVerified: 0, sendFailures: 0, verifyFailures: 0,
  };

  it('recognises a LINE account by provider or identity, in either the Supabase or the bridge shape', () => {
    expect(isLineAccount({ app_metadata: { provider: 'custom:line' } })).toBe(true);
    expect(isLineAccount({ app_metadata: { provider: 'email', providers: ['email', 'line'] } })).toBe(true);
    expect(isLineAccount({ identities: [{ provider: 'custom:line' }] })).toBe(true);
    expect(isLineAccount({ app_metadata: { provider: 'google' } })).toBe(false);
    expect(isLineAccount({ app_metadata: { provider: 'email' }, identities: [] })).toBe(false);
  });

  it('a day of LINE-only sign-ups is not "nobody signed up"', () => {
    expect(diagnoseSignups({ ...base, signupCompleted: 3 })).toBe('ok');
  });

  it('the email names the LINE count', () => {
    const e = buildSignupAlertEmail({ ...base, lineAccounts: 0, signupCompleted: 0 }, 'nobody_reached_signup');
    expect(e.text).toContain('of which LINE: 0');
  });

  it('the route counts by provider and takes the larger of accounts and completed sign-ups', () => {
    const src = read('app/api/cron/signup-alert/route.ts');
    expect(src).toContain('isLineAccount(u');
    expect(src).toContain("count('signup_completed')");
    expect(src).toContain('newAccounts: Math.max(accountsListed, signupCompleted)');
  });
});

// ── The migrations ───────────────────────────────────────────────────────────

describe('v38 migrations: additive, idempotent, verify + rollback, service role only', () => {
  const m1 = read('scripts/20261122_v38_1_anon_assignment_covariates.sql');
  const m2 = read('scripts/20261122_v38_2_anon_impressions_and_clicks.sql');

  it('both have a read-only verify block and a rollback, and drop nothing outside the rollback', () => {
    for (const m of [m1, m2]) {
      expect(m).toContain('Verify (read-only)');
      expect(m).toContain('ROLLBACK');
      const body = m.slice(0, m.indexOf('ROLLBACK ('));
      expect(body).not.toMatch(/^\s*DROP (TABLE|COLUMN)/m);
      expect(body).not.toMatch(/^\s*DELETE /m);
    }
  });

  it('v38_1 adds every covariate column nullable and freezes it with the arm', () => {
    for (const col of ['level', 'province', 'region_group', 'income_bracket', 'gave_gpa', 'utm_source', 'utm_medium',
      'utm_campaign', 'utm_content', 'recruitment_source', 'landing_variant']) {
      expect(m1).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`));
      expect(m1).toContain(`NEW.${col}`);
    }
    // The backfill runs BEFORE the trigger is extended, or it would be refused.
    expect(m1.indexOf('UPDATE public.anon_assignments')).toBeLessThan(m1.indexOf('CREATE OR REPLACE FUNCTION public.anon_assignments_freeze'));
  });

  it('v38_2: anon_impressions is service role only; apply_click.anon_id is written by the server only', () => {
    expect(m2).toContain('CREATE TABLE IF NOT EXISTS public.anon_impressions');
    expect(m2).toContain('REVOKE ALL ON public.anon_impressions FROM anon, authenticated;');
    expect(m2).toContain('ALTER TABLE public.anon_impressions ENABLE ROW LEVEL SECURITY;');
    expect(m2).toContain('ADD COLUMN IF NOT EXISTS anon_id TEXT');
    expect(m2).toContain("current_user IN ('anon', 'authenticated')");
  });
});
