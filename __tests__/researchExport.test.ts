/**
 * The research export only carries students whose consent covers it.
 *
 * Until this change it checked `consent_research = TRUE` alone, so a student who
 * agreed to superseded wording (2026-01-v1) was exported although
 * isResearchConsented() said their consent had lapsed, and a minor without a
 * guardian's consent was exported too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { CURRENT_CONSENT_VERSION, exportExclusion } from '@/lib/research/consentGate';

const THIS_YEAR = new Date().getFullYear();
const sp = (over: Record<string, unknown> = {}) => ({
  region: 'Northeast', consent_research: true, consent_version: CURRENT_CONSENT_VERSION,
  guardian_consent: false, birth_year: THIS_YEAR - 25, gpa: 3.2, ...over,
});

describe('exportExclusion — the one test every export applies', () => {
  it('lets through an adult who agreed to the current wording', () => {
    expect(exportExclusion(sp())).toBeNull();
  });

  it('refuses no record, no consent, and consent to the OLD wording, each for its own reason', () => {
    expect(exportExclusion(null)).toBe('no_student_profile');
    expect(exportExclusion(undefined)).toBe('no_student_profile');
    expect(exportExclusion(sp({ consent_research: false }))).toBe('no_research_consent');
    expect(exportExclusion(sp({ consent_research: null }))).toBe('no_research_consent');
    expect(exportExclusion(sp({ consent_version: '2026-01-v1' }))).toBe('stale_consent_version');
    expect(exportExclusion(sp({ consent_version: null }))).toBe('stale_consent_version');
  });

  it('a minor needs a guardian as well; with the guardian they are exportable', () => {
    const minor = { birth_year: THIS_YEAR - 16 };
    expect(exportExclusion(sp({ ...minor, guardian_consent: false }))).toBe('minor_without_guardian');
    expect(exportExclusion(sp({ ...minor, guardian_consent: null }))).toBe('minor_without_guardian');
    expect(exportExclusion(sp({ ...minor, guardian_consent: true }))).toBeNull();
  });

  it('with no birth year the minor rule cannot fire (a known limit, stated rather than hidden)', () => {
    expect(exportExclusion(sp({ birth_year: null, guardian_consent: false }))).toBeNull();
  });

  it('checks the consent before the version before the guardian', () => {
    expect(exportExclusion(sp({ consent_research: false, consent_version: 'x', birth_year: THIS_YEAR - 10 }))).toBe('no_research_consent');
  });
});

// ── The route ────────────────────────────────────────────────────────────────

const world = vi.hoisted(() => ({
  user: { email: 'admin@example.com' } as { email: string } | null,
  rows: [] as Record<string, unknown>[],
  error: null as null | { message: string },
  profiles: [] as Record<string, unknown>[],
  profilesError: null as null | { message: string },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: world.user } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'not', 'order', 'limit', 'gte', 'in']) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(
        table === 'profiles'
          ? { data: world.profiles, error: world.profilesError }
          : { data: world.rows, error: world.error },
      ).then(res);
      return q;
    },
  }),
}));

const event = (userId: string, student: Record<string, unknown> | null) => ({
  user_id: userId, session_id: 'mvo-session-random', scholarship_id: 'TD-1', event_type: 'view_detail',
  context: {}, occurred_at: '2026-10-20T10:00:00Z', student_profile: student,
  // The legacy table. It must never reach the output, whatever it says.
  experiment_assignment: [{ experiment_key: 'ranking', variant: 'treatment' }],
});

const prof = (id: string, over: Record<string, unknown> = {}) => ({
  id, cohort: 'main', ranking_variant: 'fairness_adjusted', ranking_assigned_at: '2026-10-01T00:00:00Z',
  assignment_algorithm_version: 'v2-hmac-stratified-2026-08', fairness_eligible: true,
  region_group: 'northeast', income_bracket: 2, ...over,
});

async function callExport() {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  vi.resetModules();
  const { GET } = await import('@/app/api/research/export/route');
  return GET(new NextRequest('http://localhost/api/research/export'));
}

beforeEach(() => {
  world.user = { email: 'admin@example.com' }; world.error = null; world.rows = [];
  world.profiles = []; world.profilesError = null;
});

describe('GET /api/research/export', () => {
  it('refuses anyone who is not an admin', async () => {
    world.user = { email: 'student@example.com' };
    expect((await callExport()).status).toBe(403);
    world.user = null;
    expect((await callExport()).status).toBe(403);
  });

  it('exports only students covered by the current consent, and counts every exclusion by reason', async () => {
    world.rows = [
      event('adult-current', sp()),
      event('adult-current-2', sp()),
      event('old-wording',   sp({ consent_version: '2026-01-v1' })),
      event('declined',      sp({ consent_research: false })),
      event('no-record',     null),
      event('minor-alone',   sp({ birth_year: THIS_YEAR - 15, guardian_consent: false })),
      event('minor-guarded', sp({ birth_year: THIS_YEAR - 15, guardian_consent: true })),
    ];
    const res = await callExport();
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split('\n');
    expect(lines).toHaveLength(3);                       // two adults + the guarded minor
    expect(res.headers.get('X-Record-Count')).toBe('3');
    expect(res.headers.get('X-Excluded-Stale-Consent')).toBe('1');
    expect(res.headers.get('X-Excluded-No-Consent')).toBe('1');
    expect(res.headers.get('X-Excluded-No-Student-Profile')).toBe('1');
    expect(res.headers.get('X-Excluded-Minor-No-Guardian')).toBe('1');
    expect(res.headers.get('X-Consent-Version')).toBe(CURRENT_CONSENT_VERSION);
  });

  it('never lets the old-wording student through, however their other fields look', async () => {
    world.rows = [event('old-wording', sp({ consent_version: '2026-01-v1' }))];
    const body = await (await callExport()).text();
    expect(body.trim()).toBe('');
  });

  it('pseudonymises: no raw user id leaves the system', async () => {
    world.rows = [event('raw-user-id-123', sp())];
    const body = await (await callExport()).text();
    expect(body).not.toContain('raw-user-id-123');
    expect(JSON.parse(body.trim()).pseudo_user_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a query error is an error, not an empty export', async () => {
    world.error = { message: 'boom' };
    expect((await callExport()).status).toBe(500);
  });
});

// ── The arm label ────────────────────────────────────────────────────────────
describe('the arm in the export is the real one', () => {
  const rows = async () => (await (await callExport()).text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

  it('comes from profiles.ranking_variant, not the legacy table — whatever the legacy table says', async () => {
    world.rows = [event('u1', sp())];                         // legacy table says 'treatment'
    world.profiles = [prof('u1', { ranking_variant: 'baseline' })];
    const [r] = await rows();
    expect(r.ranking_variant).toBe('baseline');
    expect(JSON.stringify(r)).not.toContain('treatment');
    expect('experiment_variant' in r).toBe(false);
  });

  it('carries when and how they were assigned, and who they are for the stratum', async () => {
    world.rows = [event('u1', sp())];
    world.profiles = [prof('u1')];
    const [r] = await rows();
    expect(r).toMatchObject({
      ranking_variant: 'fairness_adjusted', ranking_assigned_at: '2026-10-01T00:00:00Z', excluded_from_primary: false,
      cohort: 'main', assignment_algorithm_version: 'v2-hmac-stratified-2026-08', fairness_eligible: true,
      region_group: 'northeast', income_bracket: 2,
    });
  });

  it('an event BEFORE the assignment has no arm and is excluded from the primary, but is kept', async () => {
    world.rows = [event('u1', sp())];                         // occurred 2026-10-20
    world.profiles = [prof('u1', { ranking_assigned_at: '2026-10-25T00:00:00Z' })];
    const out = await rows();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ranking_variant: null, excluded_from_primary: true, ranking_assigned_at: '2026-10-25T00:00:00Z' });
  });

  it.each([
    ['never randomized', { ranking_variant: null, ranking_assigned_at: null }],
    ['the pilot cohort', { cohort: 'pilot' }],
  ])('%s: no arm, excluded, kept', async (_n, over) => {
    world.rows = [event('u1', sp())];
    world.profiles = [prof('u1', over)];
    const [r] = await rows();
    expect(r.ranking_variant).toBeNull();
    expect(r.excluded_from_primary).toBe(true);
  });

  it('a student with no profile row is excluded, not labelled with a guess', async () => {
    world.rows = [event('u1', sp())];
    world.profiles = [];
    const [r] = await rows();
    expect(r.ranking_variant).toBeNull();
    expect(r.excluded_from_primary).toBe(true);
  });

  it('if the arm cannot be read the export fails; it never ships with the column quietly empty', async () => {
    world.rows = [event('u1', sp())];
    world.profilesError = { message: 'boom' };
    const res = await callExport();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('profiles_read_failed');
  });

  it('names its arm source and no longer reads the legacy table', () => {
    const src = readFileSync('app/api/research/export/route.ts', 'utf8');
    expect(src).toContain("'X-Arm-Source'");
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toContain('experiment_assignment');
    expect(code).not.toContain('experiment_variant');
  });
});

describe('the route asks for what the gate needs', () => {
  it('selects consent_version and guardian_consent from student_profile', () => {
    const src = readFileSync('app/api/research/export/route.ts', 'utf8');
    expect(src).toContain('consent_version, guardian_consent');
    expect(src).toContain('exportExclusion(');
    expect(src).not.toMatch(/consent_research === true/);
  });
});
