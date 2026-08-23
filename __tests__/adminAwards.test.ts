/**
 * Tests for the /admin Awards section: the pure helpers in lib/admin/awards.ts,
 * the summary-tile route, and the manual "Add outcome" endpoint.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMockDb, type MockDbCall } from './helpers/mockSupabase';
import {
  awardRate, formatAwardRate, normaliseFilters, matchesSearch, profileCompletionRate,
  OUTCOME_STATUSES, STATUS_LABELS, SOURCE_LABELS, type AwardRow,
} from '@/lib/admin/awards';
import { countDistinctFunders } from '@/lib/scholarships/counts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser } }),
}));

import { GET as STATS_GET } from '@/app/api/admin/outcomes/stats/route';
import { POST as OUTCOME_POST } from '@/app/api/admin/outcomes/route';

const ADMIN = 'admin@tundee.org';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// ── pure helpers ───────────────────────────────────────────────────────────

describe('profileCompletionRate', () => {
  it('is profiles over accounts', () => {
    expect(profileCompletionRate(30, 62)).toBeCloseTo(30 / 62);
  });

  it('is null when there are no accounts, never NaN', () => {
    expect(profileCompletionRate(0, 0)).toBeNull();
    expect(formatAwardRate(profileCompletionRate(0, 0))).toBe('—');
  });

  it('never exceeds 100% even if a profile outlives its auth user', () => {
    expect(profileCompletionRate(70, 62)).toBe(1);
  });
});

describe('countDistinctFunders', () => {
  it('prefers the Thai name and falls back through the other columns', () => {
    expect(countDistinctFunders([
      { funder_th: 'มูลนิธิ ก', funder: 'Foundation A' },
      { funder_th: null, funder: 'Foundation A' },
      { funder_th: '', funder: null, funder_en: 'Foundation B' },
    ])).toBe(3);
  });

  it('collapses repeats and ignores blank funders', () => {
    expect(countDistinctFunders([
      { funder_th: 'มูลนิธิ ก' }, { funder_th: 'มูลนิธิ ก' }, { funder_th: '  ' }, {},
    ])).toBe(1);
  });
});

describe('awardRate', () => {
  it('divides awarded by apply-clicks', () => {
    expect(awardRate(5, 100)).toBe(0.05);
    expect(awardRate(0, 100)).toBe(0);
  });

  it('returns null rather than NaN or 0 when nobody has clicked apply', () => {
    expect(awardRate(0, 0)).toBeNull();
    expect(awardRate(3, 0)).toBeNull();
    expect(formatAwardRate(awardRate(0, 0))).toBe('—');
  });

  it('formats as a one-decimal percentage', () => {
    expect(formatAwardRate(0.05)).toBe('5.0%');
    expect(formatAwardRate(0.1234)).toBe('12.3%');
  });
});

describe('normaliseFilters', () => {
  const parse = (qs: string) => normaliseFilters(new URLSearchParams(qs));

  it('keeps a valid status and drops an unknown one', () => {
    expect(parse('status=awarded').status).toBe('awarded');
    expect(parse('status=bogus').status).toBeNull();
  });

  it('accepts every status the DB allows', () => {
    for (const st of OUTCOME_STATUSES) {
      expect(parse(`status=${st}`).status).toBe(st);
    }
  });

  it('only accepts ISO dates for the range', () => {
    expect(parse('from=2026-01-01&to=2026-12-31')).toMatchObject({
      from: '2026-01-01', to: '2026-12-31',
    });
    expect(parse('from=last-tuesday&to=soon')).toMatchObject({ from: null, to: null });
  });

  it('treats blank and whitespace-only params as absent', () => {
    expect(parse('province=&region=%20&search=')).toMatchObject({
      province: null, region: null, search: null,
    });
  });

  it('passes province, region and search through', () => {
    expect(parse('province=%E0%B8%AA%E0%B8%B8%E0%B8%A3%E0%B8%B4%E0%B8%99%E0%B8%97%E0%B8%A3%E0%B9%8C&region=Northeast&search=abc'))
      .toMatchObject({ province: 'สุรินทร์', region: 'Northeast', search: 'abc' });
  });
});

describe('matchesSearch', () => {
  const row = {
    scholarship_name: 'ทุนเรียนดี', scholarship_id: 'TD-0001',
    display_name: 'Somchai', email: 'som@example.com',
  } as AwardRow;

  it('matches any of name, id, display name or email, case-insensitively', () => {
    expect(matchesSearch(row, 'ทุนเรียน')).toBe(true);
    expect(matchesSearch(row, 'td-0001')).toBe(true);
    expect(matchesSearch(row, 'somchai')).toBe(true);
    expect(matchesSearch(row, 'SOM@EXAMPLE')).toBe(true);
  });

  it('returns false on no match and true when no search is set', () => {
    expect(matchesSearch(row, 'nothing')).toBe(false);
    expect(matchesSearch(row, null)).toBe(true);
    expect(matchesSearch(row, '')).toBe(true);
  });

  it('tolerates missing fields', () => {
    const sparse = { scholarship_id: 'TD-9', scholarship_name: null,
                     display_name: null, email: null } as AwardRow;
    expect(matchesSearch(sparse, 'td-9')).toBe(true);
    expect(matchesSearch(sparse, 'somchai')).toBe(false);
  });
});

describe('bilingual labels', () => {
  it('covers every status and source with both languages', () => {
    for (const st of OUTCOME_STATUSES) {
      expect(STATUS_LABELS[st].th).toBeTruthy();
      expect(STATUS_LABELS[st].en).toBeTruthy();
    }
    for (const src of ['self', 'line', 'admin', 'web', 'partner'] as const) {
      expect(SOURCE_LABELS[src].th).toBeTruthy();
      expect(SOURCE_LABELS[src].en).toBeTruthy();
    }
  });
});

// ── routes ─────────────────────────────────────────────────────────────────

describe('GET /api/admin/outcomes/stats', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_EMAIL', ADMIN);
    getUser.mockResolvedValue({ data: { user: { email: ADMIN } } });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('refuses a non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'student@example.com' } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    expect((await STATS_GET(new NextRequest('http://localhost/api/admin/outcomes/stats'))).status).toBe(403);
  });

  it('reports accounts and completed profiles as separate numbers', async () => {
    // The mock resolves per (table, action); counts come back on the same shape.
    const db: any = {
      _calls: [] as MockDbCall[],
      // auth.users is counted through the GoTrue admin API, not PostgREST.
      auth: { admin: { listUsers: async () => ({ data: { users: [], total: 250 }, error: null }) } },
      from(table: string) {
        const self = this;
        const b: any = {
          select(_c: string, opts?: { count?: string; head?: boolean }) {
            self._calls.push({ table, fn: 'select', args: [opts] });
            b._head = opts?.head === true;
            return b;
          },
          eq() { return b; },
          not() { return b; },
          then(res: (v: unknown) => unknown) {
            const counts: Record<string, number> = {
              profiles: 120, apply_click: 400, outcomes: 20,
            };
            if (b._head) return Promise.resolve({ count: counts[table] ?? 0, error: null }).then(res);
            return Promise.resolve({
              data: [{ amount_thb: 50000 }, { amount_thb: 25000 }, { amount_thb: null }],
              error: null,
            }).then(res);
          },
        };
        return b;
      },
    };
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const json = await (await STATS_GET(new NextRequest('http://localhost/api/admin/outcomes/stats'))).json();

    expect(json.total_accounts).toBe(250);          // auth.users
    expect(json.total_profiles).toBe(120);          // completed onboarding
    expect(json.profile_completion_rate).toBeCloseTo(120 / 250);
    expect(json.total_apply_clicks).toBe(400);
    expect(json.total_awarded).toBe(20);
    expect(json.total_thb_awarded).toBe(75000);   // nulls ignored
    expect(json.award_rate).toBeCloseTo(20 / 400);
  });
});

describe('POST /api/admin/outcomes (manual add)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_EMAIL', ADMIN);
    getUser.mockResolvedValue({ data: { user: { email: ADMIN } } });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  const post = (body: unknown) =>
    OUTCOME_POST(new NextRequest('http://localhost/api/admin/outcomes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));

  const okDb = () => {
    const db = createMockDb({
      td_scholarships: { select: { data: { scholarship_name: 'ทุนตัวอย่าง' }, error: null } },
      outcomes:        { upsert: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);
    return db;
  };

  it('refuses a non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'student@example.com' } } });
    okDb();
    expect((await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded' })).status).toBe(403);
  });

  it('writes source=admin and upserts on the composite key', async () => {
    const db = okDb();
    const res = await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded', amount_thb: 50000 });
    expect(res.status).toBe(200);

    const upsert = (db._calls as MockDbCall[]).find(c => c.table === 'outcomes' && c.fn === 'upsert')!;
    expect(upsert.args[0]).toMatchObject({
      user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded',
      amount_thb: 50000, source: 'admin', scholarship_name: 'ทุนตัวอย่าง',
    });
    expect(upsert.args[1]).toMatchObject({ onConflict: 'user_id,scholarship_id' });
  });

  it('never grants research consent — only the student can', async () => {
    const db = okDb();
    await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded' });

    const row = (db._calls as MockDbCall[])
      .find(c => c.table === 'outcomes' && c.fn === 'upsert')!.args[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('consent_research');
  });

  it('accepts a string amount and a missing amount', async () => {
    const db = okDb();
    await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded', amount_thb: '25000' });
    await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'waiting' });

    const upserts = (db._calls as MockDbCall[]).filter(c => c.table === 'outcomes' && c.fn === 'upsert');
    expect((upserts[0].args[0] as any).amount_thb).toBe(25000);
    expect((upserts[1].args[0] as any).amount_thb).toBeNull();
  });

  it('rejects a bad status, a negative amount and missing ids', async () => {
    okDb();
    expect((await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'nope' })).status).toBe(422);
    expect((await post({ user_id: USER_ID, scholarship_id: 'TD-0001', status: 'awarded', amount_thb: -5 })).status).toBe(422);
    expect((await post({ scholarship_id: 'TD-0001', status: 'awarded' })).status).toBe(422);
    expect((await post({ user_id: USER_ID, status: 'awarded' })).status).toBe(422);
  });

  it('404s on an unknown scholarship', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      createMockDb({ td_scholarships: { select: { data: null, error: null } } }),
    );
    expect((await post({ user_id: USER_ID, scholarship_id: 'NOPE', status: 'awarded' })).status).toBe(404);
  });
});
