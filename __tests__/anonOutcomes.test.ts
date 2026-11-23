/**
 * v38 — every consented, randomized /start visitor is a complete record, whether or
 * not they sign up: covariates on the assignment, impressions with rank, and
 * apply-clicks bound to anon_id on the server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { buildAnonCovariates, cleanUtm, hasAnonCovariates, UTM_MAX_LENGTH } from '@/lib/research/anonCovariates';
import { bindAnonOutcome, PRIMARY_WINDOW_DAYS, type AnonFacts } from '@/lib/research/outcomeBinding';
import { buildAnonImpressionRows } from '@/lib/research/anonImpressions';
import { buildAnonExport, pseudonymiseAnon, anonExclusion, TEST_ANON_IDS } from '@/lib/research/anonExport';
import { readFileSync } from 'node:fs';
import { summarizeAnonHealth } from '@/lib/research/anonHealth';
import { parsePreviewOffset, PREVIEW_MAX_OFFSET } from '@/lib/preview/types';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';

const ANON = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_PROFILE = { level: 'uni', province: 'ขอนแก่น', income: 2, gpa: null };

// ── 1. Covariates ────────────────────────────────────────────────────────────

describe('buildAnonCovariates (task 1)', () => {
  it('codes the walkthrough visitor exactly as the profile path would', () => {
    const c = buildAnonCovariates(TEST_PROFILE, { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'isaan_2026', utm_content: 'ad1', landing_variant: 'default' });
    expect(c).toEqual({
      level: 'uni', province: 'ขอนแก่น', region_group: 'northeast', income_bracket: 2, gave_gpa: false,
      utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'isaan_2026', utm_content: 'ad1',
      recruitment_source: 'isaan_2026', landing_variant: 'default',
    });
    expect(hasAnonCovariates(c)).toBe(true);
  });

  it('recruitment_source is the closed set: isaan_2026 / bkk_2026, else organic', () => {
    expect(buildAnonCovariates(TEST_PROFILE, { utm_campaign: 'bkk_2026' }).recruitment_source).toBe('bkk_2026');
    expect(buildAnonCovariates(TEST_PROFILE, { utm_campaign: 'spring_promo' }).recruitment_source).toBe('organic');
    expect(buildAnonCovariates(TEST_PROFILE, null).recruitment_source).toBe('organic');
  });

  it('region is from the declared province, never from the campaign', () => {
    const c = buildAnonCovariates({ ...TEST_PROFILE, province: 'กรุงเทพมหานคร' }, { utm_campaign: 'isaan_2026' });
    expect(c.region_group).toBe('bangkok_metro');
    expect(c.recruitment_source).toBe('isaan_2026');
  });

  it('treats URL values as untrusted: trimmed, bounded, empty is null; unknown variants are the default', () => {
    expect(cleanUtm('  ad2  ')).toBe('ad2');
    expect(cleanUtm('')).toBeNull();
    expect(cleanUtm(42)).toBeNull();
    expect(cleanUtm('x'.repeat(500))).toHaveLength(UTM_MAX_LENGTH);
    expect(buildAnonCovariates(TEST_PROFILE, { landing_variant: '<script>' }).landing_variant).toBe('default');
    expect(buildAnonCovariates({ ...TEST_PROFILE, gpa: 3.1 }, {}).gave_gpa).toBe(true);
  });
});

// ── 2. Binding an anonymous click ────────────────────────────────────────────

describe('bindAnonOutcome (task 2)', () => {
  const assigned = '2026-11-22T10:00:00Z';
  const anon: AnonFacts = {
    ranking_variant: 'fairness_adjusted', ranking_assigned_at: assigned,
    research_consent_version: CURRENT_CONSENT_VERSION, research_consented_at: assigned,
  };
  const imp = (at: string, rank = 3) => ({ occurred_at: at, context: { rank, tab: 'matches', fairness_mode: 'on' } });
  const bind = (clickedAt: string, over: Partial<Parameters<typeof bindAnonOutcome>[0]> = {}) =>
    bindAnonOutcome({ clickedAt: new Date(clickedAt), anon, impression: imp('2026-11-22T10:01:00Z'), currentConsentVersion: CURRENT_CONSENT_VERSION, ...over });

  it('a consented participant clicking inside the window counts, with arm and rank', () => {
    expect(bind('2026-11-22T10:05:00Z')).toEqual({
      ranking_variant: 'fairness_adjusted', ranking_assigned_at: assigned,
      rank_position: 3, was_personalized: true, served_fairness_mode: 'on',
      excluded_from_primary: false, binding_source: 'server',
    });
  });

  it(`after ${PRIMARY_WINDOW_DAYS} days the click keeps its arm but is not primary`, () => {
    const b = bind('2026-12-07T10:00:01Z', { impression: null });
    expect(b.ranking_variant).toBe('fairness_adjusted');
    expect(b.excluded_from_primary).toBe(true);
  });

  it('consent to superseded wording is not primary', () => {
    const b = bind('2026-11-22T10:05:00Z', { anon: { ...anon, research_consent_version: '2025-old' } });
    expect(b.excluded_from_primary).toBe(true);
  });

  it('a click before the assignment carries no arm', () => {
    expect(bind('2026-11-22T09:59:00Z')).toMatchObject({ ranking_variant: null, excluded_from_primary: true });
  });

  it('no assignment row (decliner, minor): kept, no arm, excluded', () => {
    expect(bind('2026-11-22T10:05:00Z', { anon: null })).toMatchObject({ ranking_variant: null, excluded_from_primary: true, binding_source: 'server' });
  });

  it('a failed read is recorded unbound, never guessed', () => {
    expect(bind('2026-11-22T10:05:00Z', { anon: null, anonReadFailed: true })).toMatchObject({ binding_source: 'server_unbound', excluded_from_primary: true });
  });

  it('an impression older than 24 h gives no rank', () => {
    expect(bind('2026-11-24T10:05:00Z', { impression: imp('2026-11-22T10:01:00Z') }).rank_position).toBeNull();
  });
});

describe('impressions carry their true rank, page after page', () => {
  it('rank = offset + position + 1', () => {
    const rows = buildAnonImpressionRows({
      anonId: ANON, scholarshipIds: ['a', 'b'], offset: 10, fairnessMode: 'off', variant: 'anonymous-baseline',
      broadened: false, servedAt: new Date('2026-11-22T10:00:00Z'),
    });
    expect(rows.map((r) => r.rank)).toEqual([11, 12]);
    expect(rows[0]).toMatchObject({ anon_id: ANON, surface: 'start_preview', fairness_mode: 'off' });
  });

  it('offset is a bounded whole number', () => {
    expect(parsePreviewOffset(undefined)).toBe(0);
    expect(parsePreviewOffset(10)).toBe(10);
    expect(parsePreviewOffset('20')).toBe(20);
    expect(parsePreviewOffset(-1)).toBeNull();
    expect(parsePreviewOffset(2.5)).toBeNull();
    expect(parsePreviewOffset(PREVIEW_MAX_OFFSET + 1)).toBeNull();
  });
});

// ── 3. The routes, against an in-memory database ─────────────────────────────

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  user: null as null | { id: string },
  userInserts: [] as Row[],
  failInsertColumn: false,
}));

function fakeAdmin() {
  return {
    from(table: string) {
      const filters: [string, unknown, string][] = [];
      let mode: 'select' | 'insert' = 'select';
      const rows = () => (db.tables[table] ??= []);
      const matches = () => rows().filter((r) => filters.every(([c, v, op]) =>
        op === 'eq' ? r[c] === v : op === 'lte' ? String(r[c]) <= String(v) : true));
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v, 'eq']); return q; },
        lte: (c: string, v: unknown) => { filters.push([c, v, 'lte']); return q; },
        maybeSingle: async () => {
          const hit = matches().sort((a, b) => String(b.served_at ?? '').localeCompare(String(a.served_at ?? '')));
          return { data: hit[0] ?? null, error: null };
        },
        insert: async (r: Row | Row[]) => {
          mode = 'insert';
          const list = Array.isArray(r) ? r : [r];
          if (db.failInsertColumn && table === 'apply_click' && list.some((x) => 'anon_id' in x)) {
            return { error: { code: 'PGRST204', message: "Could not find the 'anon_id' column" } };
          }
          rows().push(...list.map((x) => ({ ...x })));
          return { error: null };
        },
      };
      void mode;
      return q;
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: () => ({ insert: async (r: Row) => { db.userInserts.push(r); return { error: null }; } }),
  }),
}));

import { POST as applyClick } from '@/app/api/apply-click/route';

const click = (cookie?: string) => applyClick(new NextRequest('https://www.tundee.org/api/apply-click', {
  method: 'POST', body: JSON.stringify({ scholarship_id: 'TD-0001' }), headers: cookie ? { cookie } : {},
}));

describe('POST /api/apply-click — anonymous participants (task 2)', () => {
  beforeEach(() => {
    process.env.ANON_RANDOMIZATION = 'on';
    db.user = null;
    db.userInserts = [];
    db.failInsertColumn = false;
    const now = Date.now();
    db.tables = {
      anon_assignments: [{
        anon_id: ANON, ranking_variant: 'baseline', ranking_assigned_at: new Date(now - 60_000).toISOString(),
        research_consent_version: CURRENT_CONSENT_VERSION, research_consented_at: new Date(now - 60_000).toISOString(), claimed_by: null,
      }],
      anon_impressions: [{ anon_id: ANON, scholarship_id: 'TD-0001', rank: 4, fairness_mode: 'off', served_at: new Date(now - 30_000).toISOString() }],
      apply_click: [],
    };
  });

  it('binds the click to the anon_id, with the arm and the served rank, on the server', async () => {
    expect((await click(`tundee_anon=${ANON}`)).status).toBe(200);
    expect(db.tables.apply_click).toHaveLength(1);
    expect(db.tables.apply_click[0]).toMatchObject({
      anon_id: ANON, user_id: null, scholarship_id: 'TD-0001',
      ranking_variant: 'baseline', rank_position: 4, served_fairness_mode: 'off',
      excluded_from_primary: false, binding_source: 'server',
    });
    expect(db.userInserts).toHaveLength(0);       // anon_id rows are written by the service role only
  });

  it('a claimed participant clicking while signed out is filed under the account, with the account\'s arm', async () => {
    db.tables.anon_assignments[0].claimed_by = 'u1';
    db.tables.profiles = [{ id: 'u1', ranking_variant: 'fairness_adjusted', ranking_assigned_at: '2026-01-01T00:00:00Z', cohort: 'main' }];
    await click(`tundee_anon=${ANON}`);
    expect(db.tables.apply_click[0]).toMatchObject({ user_id: 'u1', anon_id: ANON, ranking_variant: 'fairness_adjusted' });
  });

  it('no cookie: kept, never primary, no anon_id, through the visitor\'s own client as before', async () => {
    await click();
    expect(db.tables.apply_click).toHaveLength(0);
    expect(db.userInserts[0]).toMatchObject({ user_id: null, excluded_from_primary: true });
    expect(db.userInserts[0]).not.toHaveProperty('anon_id');
  });

  it('a cookie with no assignment is not a participant', async () => {
    await click('tundee_anon=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(db.userInserts[0]).toMatchObject({ ranking_variant: null, excluded_from_primary: true });
  });

  it('with the switch off the cookie is not read', async () => {
    process.env.ANON_RANDOMIZATION = 'off';
    await click(`tundee_anon=${ANON}`);
    expect(db.tables.apply_click).toHaveLength(0);
    expect(db.userInserts).toHaveLength(1);
  });

  it('before the v38_2 migration the click is still stored (without anon_id), never lost', async () => {
    db.failInsertColumn = true;
    expect((await click(`tundee_anon=${ANON}`)).status).toBe(200);
    expect(db.tables.apply_click).toHaveLength(1);
    expect(db.tables.apply_click[0]).not.toHaveProperty('anon_id');
  });

  it('the client cannot state an arm: extra body fields are ignored', async () => {
    await applyClick(new NextRequest('https://www.tundee.org/api/apply-click', {
      method: 'POST', headers: { cookie: `tundee_anon=${ANON}` },
      body: JSON.stringify({ scholarship_id: 'TD-0001', ranking_variant: 'fairness_adjusted', anon_id: 'x', rank_position: 1 }),
    }));
    expect(db.tables.apply_click[0]).toMatchObject({ ranking_variant: 'baseline', rank_position: 4, anon_id: ANON });
  });
});

// ── 4. The export ────────────────────────────────────────────────────────────

describe('anonymous export (task 3)', () => {
  const part = (id: string, over: Row = {}) => ({
    anon_id: id, ranking_variant: 'baseline', ranking_assigned_at: '2026-11-22T10:00:00Z',
    assignment_algorithm_version: 'v2', stratum: 'northeast|2', fairness_eligible: true,
    research_consent_version: CURRENT_CONSENT_VERSION, research_consented_at: '2026-11-22T10:00:00Z', claimed_by: null,
    level: 'uni', province: 'ขอนแก่น', region_group: 'northeast', income_bracket: 2, gave_gpa: false,
    recruitment_source: 'isaan_2026', utm_campaign: 'isaan_2026', utm_content: 'ad1', landing_variant: 'default', ...over,
  });
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const out = buildAnonExport({
    participants: [part(ANON), part(B, { claimed_by: 'u1' }), part(C, { research_consent_version: 'old' })] as never,
    impressions: [
      { anon_id: ANON, scholarship_id: 'TD-1', rank: 1, fairness_mode: 'off', variant: 'anonymous-baseline', broadened: false, served_at: '2026-11-22T10:00:01Z' },
      { anon_id: B, scholarship_id: 'TD-1', rank: 1, fairness_mode: 'off', variant: 'anonymous-baseline', broadened: false, served_at: '2026-11-22T10:00:01Z' },
    ],
    clicks: [
      { anon_id: ANON, scholarship_id: 'TD-1', clicked_at: '2026-11-22T10:01:00Z', ranking_variant: 'baseline', ranking_assigned_at: '2026-11-22T10:00:00Z', rank_position: 1, was_personalized: true, served_fairness_mode: 'off', excluded_from_primary: false, binding_source: 'server' },
      { anon_id: C, scholarship_id: 'TD-1', clicked_at: '2026-11-22T10:01:00Z', ranking_variant: null, ranking_assigned_at: null, rank_position: null, was_personalized: null, served_fairness_mode: null, excluded_from_primary: null, binding_source: null },
    ],
    currentConsentVersion: CURRENT_CONSENT_VERSION,
  });
  const lines = out.lines.map((l) => JSON.parse(l));

  it('emits one participant with covariates, its impressions and its clicks, under sha256(anon_id)', () => {
    const pid = createHash('sha256').update(ANON).digest('hex');
    expect(pseudonymiseAnon(ANON)).toBe(pid);
    expect(lines.map((l) => l.record_type)).toEqual(['participant', 'impression', 'apply_click']);
    expect(lines.every((l) => l.pseudo_anon_id === pid)).toBe(true);
    expect(lines[0]).toMatchObject({ ranking_variant: 'baseline', stratum: 'northeast|2', recruitment_source: 'isaan_2026', level: 'uni', is_target_population: true });
    expect(lines[2]).toMatchObject({ excluded_from_primary: false, rank_position: 1 });
    expect(JSON.stringify(lines)).not.toContain(ANON);
  });

  it('a claimed participant is emitted once — under the account, not here — and stale consent is out; both counted', () => {
    expect(out.participants).toBe(1);
    expect(out.excluded).toEqual({ test_participant: 0, stale_consent_version: 1, claimed_by_account: 1 });
  });
});

describe('test participants are left out of the anonymous extract (2026-11-23)', () => {
  const TEST = '7dfb9dbc-995d-4dd0-aa27-e5314b053e30';
  const REAL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const part = (anon_id: string) => ({
    anon_id, ranking_variant: 'baseline', ranking_assigned_at: '2026-11-23T02:14:37Z',
    assignment_algorithm_version: 'v2', stratum: 'northeast|2', fairness_eligible: true,
    research_consent_version: CURRENT_CONSENT_VERSION, research_consented_at: '2026-11-23T02:14:37Z', claimed_by: null,
  });
  const imp = (anon_id: string) => ({ anon_id, scholarship_id: 'TD-0251', rank: 1, fairness_mode: 'off', variant: 'anonymous-baseline', broadened: false, served_at: '2026-11-23T02:14:40Z' });
  const out = buildAnonExport({
    participants: [part(TEST), part(REAL)] as never,
    impressions: [imp(TEST), imp(REAL)],
    clicks: [],
    currentConsentVersion: CURRENT_CONSENT_VERSION,
  });

  it('the walkthrough participant is listed', () => {
    expect(TEST_ANON_IDS.has(TEST)).toBe(true);
    expect(TEST_ANON_IDS.has('d6bb94cf-ba67-4711-995d-0955b19337de')).toBe(true);
    expect(TEST_ANON_IDS.has('3c75c8de-c9ed-49fb-a11a-3a34777e8973')).toBe(true);
    expect(TEST_ANON_IDS.has('203a2f6d-d331-466f-bd50-b888b3ca8ad1')).toBe(true);
    expect(anonExclusion(part(TEST), CURRENT_CONSENT_VERSION)).toBe('test_participant');
    expect(anonExclusion(part(REAL), CURRENT_CONSENT_VERSION)).toBeNull();
  });

  it('neither it nor its impressions are emitted, and it is counted', () => {
    expect(out.participants).toBe(1);
    expect(out.excluded.test_participant).toBe(1);
    expect(out.lines.join('\n')).not.toContain(pseudonymiseAnon(TEST));
    expect(out.lines.map((l) => JSON.parse(l).pseudo_anon_id)).toEqual([pseudonymiseAnon(REAL), pseudonymiseAnon(REAL)]);
  });

  it('the export route reports the count in a header', () => {
    expect(readFileSync('app/api/research/export/route.ts', 'utf8')).toContain("'X-Excluded-Test-Participant':   String(out.excluded.test_participant)");
  });
});

// ── 5. Health: the zero case ─────────────────────────────────────────────────

describe('summarizeAnonHealth (task 9)', () => {
  it('zero assignments: no shares, no alert', () => {
    expect(summarizeAnonHealth({ assignments: [], anonIdsWithImpression: [], anonApplyClicks: 0 })).toEqual({
      window_hours: 24, assignments: 0, with_covariates_share: null, with_impression_share: null, apply_clicks: 0, alerts: [],
    });
  });
});
