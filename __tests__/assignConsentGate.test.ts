/**
 * /api/experiment/assign only randomizes students who have agreed to take part.
 *
 * Before this gate every new student was randomized and the research export
 * dropped the non-consenting ones afterwards, so a student who declined was
 * still handed a treatment arm. A student who declines now keeps the whole
 * product with the baseline ranking and stays out of the trial
 * (ranking_variant = null).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

const SALT = 'a-test-salt-that-is-long-enough-to-pass';

interface Fixture {
  profile:  Record<string, unknown> | null;
  consent:  Record<string, unknown> | null;
  consentError?: { message: string };
}
let fx: Fixture;
const update = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = async () => ({ error: null });
      chain.maybeSingle = async () =>
        table === 'profiles'
          ? { data: fx.profile, error: null }
          : { data: fx.consent, error: fx.consentError ?? null };
      chain.update = (row: unknown) => { update(row); return chain; };
      return chain;
    },
  }),
}));

import { POST } from '@/app/api/experiment/assign/route';

const call = () =>
  POST(new NextRequest('http://localhost/api/experiment/assign', {
    method: 'POST',
    body: JSON.stringify({ utm_campaign: 'isaan_2026' }),
  }));

const completeProfile = {
  id: 'u-1', province: 'ขอนแก่น', income_bracket: 2, cohort: 'main',
  ranking_variant: null, recruitment_source: null,
};

beforeEach(() => {
  process.env.RANDOMIZATION_SALT = SALT;
  update.mockReset();
  fx = { profile: completeProfile, consent: null };
});

describe('assign — research consent gate', () => {
  it('leaves a student with no student_profile row unrandomized', async () => {
    const body = await (await call()).json();
    expect(body).toEqual({ ranking_variant: null, reason: 'research_consent_not_given' });
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a student who declined unrandomized', async () => {
    fx.consent = { consent_research: false, consent_version: CURRENT_CONSENT_VERSION };
    const body = await (await call()).json();
    expect(body.reason).toBe('research_consent_not_given');
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a student whose consent is for an older text unrandomized', async () => {
    fx.consent = { consent_research: true, consent_version: '2026-01-v1' };
    expect((await (await call()).json()).reason).toBe('research_consent_not_given');
    expect(update).not.toHaveBeenCalled();
  });

  it('turns a failed consent read into an error, never into "no consent"', async () => {
    fx.consentError = { message: 'boom' };
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('consent_read_failed');
    expect(update).not.toHaveBeenCalled();
  });

  it('randomizes a consenting student and writes all three assignment fields together', async () => {
    fx.consent = { consent_research: true, consent_version: CURRENT_CONSENT_VERSION };
    const body = await (await call()).json();
    expect(['baseline', 'fairness_adjusted']).toContain(body.ranking_variant);
    expect(update).toHaveBeenCalledTimes(1);
    const row = update.mock.calls[0][0];
    expect(row.ranking_variant).toBe(body.ranking_variant);
    expect(row.ranking_assigned_at).toEqual(expect.any(String));
    expect(row.assignment_algorithm_version).toEqual(expect.any(String));
  });

  it('still never randomizes the pilot cohort, consent or not', async () => {
    fx.profile = { ...completeProfile, cohort: 'pilot' };
    fx.consent = { consent_research: true, consent_version: CURRENT_CONSENT_VERSION };
    expect((await (await call()).json()).reason).toBe('pilot_cohort_not_randomized');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('wizard — consent is recorded before randomization and failures are counted', () => {
  it('sends the consent decision before it asks for an arm, and records failures', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/profile/setup/page.tsx', 'utf8');
    const consent = src.indexOf("fetch('/api/profile/student'");
    const assign  = src.indexOf("fetch('/api/experiment/assign'");
    expect(consent).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(consent);
    expect(src).toContain("reason: 'research_consent_not_recorded'");
    expect(src).toContain('assign_failed:');
  });
});
