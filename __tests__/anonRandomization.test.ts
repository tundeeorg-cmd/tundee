/**
 * Randomization before sign-in (PART 2 step 2, PART 3 step 2) — switched OFF by
 * default, and correct when switched on.
 *
 * Three things matter and each is pinned here: nothing happens unless the switch is
 * on; nobody is randomized without consent; and when an anonymous arm meets an
 * account, the account's arm wins and a disagreement is recorded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import {
  ANON_COOKIE, anonFairnessMode, anonRandomizationEnabled, buildAnonAssignment, decideMerge, isAnonId,
} from '@/lib/research/anonAssignment';
import { computeRankingVariant, stratumKey } from '@/lib/research/assignment';

const SALT = 'a-test-salt-that-is-long-enough-to-pass';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-30T10:00:00Z');

beforeEach(() => { process.env.RANDOMIZATION_SALT = SALT; });
afterEach(() => { delete process.env.ANON_RANDOMIZATION; });

// ── The switch ───────────────────────────────────────────────────────────────
describe('the switch', () => {
  it('is off unless set to exactly "on"', () => {
    for (const v of [undefined, '', 'off', 'true', '1', 'ON', 'yes']) {
      if (v === undefined) delete process.env.ANON_RANDOMIZATION; else process.env.ANON_RANDOMIZATION = v;
      expect(anonRandomizationEnabled(), String(v)).toBe(false);
    }
    process.env.ANON_RANDOMIZATION = 'on';
    expect(anonRandomizationEnabled()).toBe(true);
  });

  it('is not mentioned in .env.example as enabled', () => {
    const env = readFileSync('.env.example', 'utf8');
    expect(env).toMatch(/^ANON_RANDOMIZATION=\s*$|^# ANON_RANDOMIZATION=/m);
  });
});

// ── The assignment ───────────────────────────────────────────────────────────
describe('buildAnonAssignment', () => {
  const build = (anonId = ID_A, province = 'ขอนแก่น', income = 2) =>
    buildAnonAssignment({ anonId, province, incomeBracket: income, consentVersion: 'cv', now: NOW });

  it('is the same HMAC as for accounts, over the same stratum, keyed by the anon id', () => {
    const a = build();
    expect(a.stratum).toBe(stratumKey('ขอนแก่น', 2));
    expect(a.ranking_variant).toBe(computeRankingVariant(ID_A, stratumKey('ขอนแก่น', 2), SALT));
  });

  it('is deterministic, and balanced within a stratum', () => {
    expect(build().ranking_variant).toBe(build().ranking_variant);
    let adjusted = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const id = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
      if (build(id).ranking_variant === 'fairness_adjusted') adjusted++;
    }
    expect(adjusted / n).toBeGreaterThan(0.45);
    expect(adjusted / n).toBeLessThan(0.55);
  });

  it('records the consent version and the time, and eligibility as a property of the person', () => {
    const a = build();
    expect(a).toMatchObject({ research_consent_version: 'cv', research_consented_at: NOW.toISOString(), fairness_eligible: true });
    expect(build(ID_A, 'กรุงเทพมหานคร', 6).fairness_eligible).toBe(false);
  });

  it('refuses to assign with no salt rather than assigning arbitrarily', () => {
    delete process.env.RANDOMIZATION_SALT;
    expect(() => build()).toThrow(/RANDOMIZATION_SALT/);
  });
});

describe('who gets the adjusted ranking', () => {
  it('only an eligible visitor in the adjusted arm', () => {
    expect(anonFairnessMode({ ranking_variant: 'fairness_adjusted', fairness_eligible: true })).toBe('on');
    expect(anonFairnessMode({ ranking_variant: 'fairness_adjusted', fairness_eligible: false })).toBe('off');
    expect(anonFairnessMode({ ranking_variant: 'baseline', fairness_eligible: true })).toBe('off');
    expect(anonFairnessMode(null)).toBe('off');
  });
  it('accepts only a UUID as an anonymous id', () => {
    expect(isAnonId(ID_A)).toBe(true);
    for (const v of ['', 'abc', 'DROP TABLE', null, undefined, 42]) expect(isAnonId(v)).toBe(false);
  });
});

// ── The merge rule ───────────────────────────────────────────────────────────
describe('decideMerge — the profile always wins', () => {
  const anon = (arm: 'baseline' | 'fairness_adjusted', claimed_by: string | null = null) => ({ ranking_variant: arm, claimed_by });
  const base = { userId: 'u1', consent: { hasRow: false, consent_research: null } as const };

  it('lifts an anonymous arm onto a profile that has none', () => {
    expect(decideMerge({ ...base, anon: anon('baseline'), profile: { cohort: 'main', ranking_variant: null } })).toEqual({ action: 'lift' });
    expect(decideMerge({ ...base, anon: anon('baseline'), profile: null })).toEqual({ action: 'lift' });
  });

  it('keeps the profile\'s arm when they disagree, and says so', () => {
    expect(decideMerge({ ...base, anon: anon('baseline'), profile: { cohort: 'main', ranking_variant: 'fairness_adjusted' } }))
      .toEqual({ action: 'conflict', anonArm: 'baseline', profileArm: 'fairness_adjusted' });
  });

  it('records nothing when they agree', () => {
    expect(decideMerge({ ...base, anon: anon('baseline'), profile: { cohort: 'main', ranking_variant: 'baseline' } })).toEqual({ action: 'same_arm' });
  });

  it('never randomizes the pilot cohort', () => {
    expect(decideMerge({ ...base, anon: anon('baseline'), profile: { cohort: 'pilot', ranking_variant: null } }))
      .toEqual({ action: 'none', reason: 'pilot_cohort' });
  });

  it('respects a "no" already recorded on the account', () => {
    expect(decideMerge({ userId: 'u1', anon: anon('baseline'), profile: { cohort: 'main', ranking_variant: null },
      consent: { hasRow: true, consent_research: false } })).toEqual({ action: 'none', reason: 'declined_on_account' });
    // A row with consent NULL is not a refusal.
    expect(decideMerge({ userId: 'u1', anon: anon('baseline'), profile: { cohort: 'main', ranking_variant: null },
      consent: { hasRow: true, consent_research: null } }).action).toBe('lift');
  });

  it('is single-use: a claimed assignment is not merged again, by anyone', () => {
    expect(decideMerge({ ...base, anon: anon('baseline', 'u1'), profile: null })).toEqual({ action: 'none', reason: 'already_claimed' });
    expect(decideMerge({ ...base, anon: anon('baseline', 'someone-else'), profile: null })).toEqual({ action: 'none', reason: 'claimed_by_other' });
  });

  it('does nothing when the visitor never randomized', () => {
    expect(decideMerge({ ...base, anon: null, profile: { cohort: 'main', ranking_variant: null } }))
      .toEqual({ action: 'none', reason: 'no_anon_assignment' });
  });
});

// ── The routes ───────────────────────────────────────────────────────────────
const store = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  saveError: null as string | null,
  existing: null as Record<string, unknown> | null,
  admin: true,
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => (store.admin ? { fake: true } : null) }));
vi.mock('@/lib/research/anonStore', async (orig) => {
  const real = await orig<typeof import('@/lib/research/anonStore')>();
  return {
    ...real,
    saveAnonAssignment: async (_a: unknown, assignment: Record<string, unknown>) => {
      if (store.saveError) return { row: null, created: false, error: store.saveError };
      if (store.existing) return { row: store.existing, created: false, error: null };
      store.saved.push(assignment);
      return { row: { ...assignment, claimed_by: null }, created: true, error: null };
    },
    loadAnonAssignment: async () => ({ row: store.existing, error: null }),
  };
});

import { POST as randomize } from '@/app/api/start/randomize/route';

const ANSWERS = { level: 'M4-M6', province: 'ขอนแก่น', income: 2, gpa: null };
const call = (body: unknown, cookie?: string) =>
  randomize(new NextRequest('https://www.tundee.org/api/start/randomize', {
    method: 'POST', body: JSON.stringify(body), headers: cookie ? { cookie } : {},
  }));

describe('POST /api/start/randomize', () => {
  beforeEach(() => { store.saved = []; store.saveError = null; store.existing = null; store.admin = true; });

  it('does nothing at all while the switch is off', async () => {
    const res = await call({ answers: ANSWERS, adult: true, consent: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ enabled: false });
    expect(store.saved).toHaveLength(0);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  describe('with the switch on', () => {
    beforeEach(() => { process.env.ANON_RANDOMIZATION = 'on'; });

    it('without consent: no assignment, no row, no cookie', async () => {
      for (const consent of [false, undefined, 'true', 1, null]) {
        const res = await call({ answers: ANSWERS, adult: true, consent });
        expect(await res.json()).toEqual({ randomized: false, reason: 'no_consent' });
      }
      expect(store.saved).toHaveLength(0);
    });

    it('age first: a visitor who is not a declared adult is never randomized, even with consent ticked', async () => {
      for (const adult of [false, undefined, null, 'true', 1]) {
        const res = await call({ answers: ANSWERS, adult, consent: true });
        expect(await res.json()).toEqual({ randomized: false, reason: 'ineligible_minor' });
        expect(res.headers.get('set-cookie')).toBeNull();
      }
      expect(store.saved).toHaveLength(0);
    });

    it('an adult who does not consent is a decline, not an ineligible visitor', async () => {
      expect(await (await call({ answers: ANSWERS, adult: true, consent: false })).json())
        .toEqual({ randomized: false, reason: 'no_consent' });
    });

    it('rejects answers that are not a valid quiz', async () => {
      expect((await call({ answers: { level: 'x' }, adult: true, consent: true })).status).toBe(400);
    });

    it('with consent: stores the assignment with the consent version, sets an httpOnly cookie, and never reveals the arm', async () => {
      const res = await call({ answers: ANSWERS, adult: true, consent: true });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ randomized: true });
      expect(text).not.toMatch(/baseline|fairness/);

      expect(store.saved).toHaveLength(1);
      expect(store.saved[0]).toMatchObject({ stratum: stratumKey('ขอนแก่น', 2), research_consent_version: expect.any(String) });
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toContain(`${ANON_COOKIE}=`);
      expect(cookie.toLowerCase()).toContain('httponly');
      expect(cookie.toLowerCase()).toContain('domain=.tundee.org');
      expect(cookie).toContain('Max-Age=7776000');
    });

    it('reuses the visitor\'s existing anonymous id, so a re-submitted quiz keeps its arm', async () => {
      await call({ answers: ANSWERS, adult: true, consent: true }, `${ANON_COOKIE}=${ID_A}`);
      await call({ answers: { ...ANSWERS, province: 'กรุงเทพมหานคร', income: 6 }, adult: true, consent: true }, `${ANON_COOKIE}=${ID_A}`);
      expect(store.saved.map((s) => s.anon_id)).toEqual([ID_A, ID_A]);
      // Same id, same deterministic arm at any given stratum; the stored row (first write) is what stays.
    });

    it('ignores a cookie that is not a UUID and mints its own', async () => {
      await call({ answers: ANSWERS, adult: true, consent: true }, `${ANON_COOKIE}=not-a-uuid`);
      expect(isAnonId(store.saved[0].anon_id)).toBe(true);
      expect(store.saved[0].anon_id).not.toBe('not-a-uuid');
    });

    it('fails loudly, not quietly: no salt → 503, no service role → 503, a failed write → 500', async () => {
      delete process.env.RANDOMIZATION_SALT;
      expect((await call({ answers: ANSWERS, adult: true, consent: true })).status).toBe(503);
      process.env.RANDOMIZATION_SALT = SALT;
      store.admin = false;
      expect((await call({ answers: ANSWERS, adult: true, consent: true })).status).toBe(503);
      store.admin = true;
      store.saveError = '42P01 relation does not exist';
      const res = await call({ answers: ANSWERS, adult: true, consent: true });
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('42P01');
    });
  });
});

// ── Source-level guarantees ──────────────────────────────────────────────────
describe('everything is inert with the switch off', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('the sign-in hook returns before reading anything', () => {
    const src = read('lib/research/anonMerge.ts');
    expect(src.indexOf('if (!anonRandomizationEnabled()) return;'))
      .toBeLessThan(src.indexOf('createAdminClient()'));
  });

  it('the auth callback calls the merge only through the switch, and never lets it block a sign-in', () => {
    const src = read('app/auth/callback/route.ts');
    expect(src).toContain('if (!anonRandomizationEnabled()) return');
    expect(src).toMatch(/await mergeAnon\(\)/);
    expect(read('lib/research/anonMerge.ts')).toContain('catch (err)');
  });

  it('the preview ranking touches the database for the arm only behind the switch', () => {
    const src = read('app/api/preview-match/route.ts');
    expect(src.indexOf('if (anonRandomizationEnabled()) {')).toBeGreaterThan(-1);
    expect(src.indexOf("let fairnessMode: 'on' | 'off' = 'off';")).toBeLessThan(src.indexOf('if (anonRandomizationEnabled()) {'));
  });

  it('the parked intake carries an anon id only behind the switch', () => {
    expect(read('app/api/intake/route.ts')).toContain('if (!anonRandomizationEnabled()) return answers;');
  });

  it('the matcher shows the consent block only when offered, never pre-ticked', () => {
    const src = read('app/start/PreviewMatcher.tsx');
    expect(src).toContain('useState(false)');                    // researchConsent default
    expect(src).toMatch(/researchConsentOffered && \(/);
    expect(src).toContain('researchConsentOffered && adult === true && researchConsent');   // age first (startAgeGate.test.ts)
    expect(read('app/start/page.tsx')).toContain('researchConsentOffered={anonRandomizationEnabled()}');
  });

  it('the consent wording is in one reviewable file and marked as a draft', () => {
    const src = read('lib/research/startConsent.ts');
    expect(src).toContain('DRAFT — NOT APPROVED');
    expect(src).toContain('/privacy');
  });
});
