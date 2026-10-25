/**
 * /admin/funnel — totals only, admin only (PART 3 step 4).
 *
 * The funnel is where a drop-off shows up; it is NOT allowed to become an
 * outcome-by-arm view, which the pre-registration forbids before the stopping
 * point. These tests pin both halves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildFunnel, FUNNEL_STEPS, FUNNEL_WINDOWS_DAYS } from '@/lib/admin/funnel';

describe('buildFunnel', () => {
  const counts = [
    { step: 'landed', n: 1000 }, { step: 'browsed', n: 600 }, { step: 'engaged', n: 300 },
    { step: 'personalize_shown', n: 400 }, { step: 'personalized', n: 100 }, { step: 'signed_up', n: 20 },
    { step: 'tracked', n: 10 }, { step: 'applied_clicked', n: 40 }, { step: 'returned', n: 5 },
  ];
  const rows = buildFunnel(counts);
  const row = (k: string) => rows.find((r) => r.key === k)!;

  it('lists every step in the order of the plan', () => {
    expect(rows.map((r) => r.key)).toEqual(FUNNEL_STEPS.map((s) => s.key));
    expect(rows[0].key).toBe('landed');
    expect(rows[rows.length - 1].key).toBe('returned');
  });

  it('works out the share of the previous step, the drop and the share of the first', () => {
    expect(row('browsed')).toMatchObject({ count: 600, ofPrevious: 0.6, ofFirst: 0.6 });
    expect(row('browsed').droppedFromPrevious).toBeCloseTo(0.4);
    expect(row('signed_up').ofFirst).toBeCloseTo(0.02);
  });

  it('shows a step that exceeds the one before as over 100% with a drop of zero, not a negative', () => {
    // 40 clicks from 10 trackers: independent counts, so this is real.
    expect(row('applied_clicked').ofPrevious).toBeCloseTo(4);
    expect(row('applied_clicked').droppedFromPrevious).toBe(0);
  });

  it('never divides by zero and never invents a number for a missing step', () => {
    const sparse = buildFunnel([{ step: 'landed', n: 0 }, { step: 'browsed', n: 5 }]);
    expect(sparse[1].ofPrevious).toBeNull();
    expect(sparse[1].ofFirst).toBeNull();
    expect(sparse[2].count).toBeNull();
    expect(sparse[2].ofPrevious).toBeNull();
  });

  it('reads counts that arrive as strings (bigint over JSON)', () => {
    const r = buildFunnel([{ step: 'landed', n: '10' as unknown as number }, { step: 'browsed', n: '5' as unknown as number }]);
    expect(r[1].ofPrevious).toBe(0.5);
  });

  it('covers a week and a month', () => {
    expect([...FUNNEL_WINDOWS_DAYS]).toEqual([7, 30]);
  });
});

// ── The route ────────────────────────────────────────────────────────────────

const world = vi.hoisted(() => ({
  user: { id: 'u', email: 'boss@example.com' } as { id: string; email: string } | null,
  admin: true,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: world.user } }) } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => (world.admin ? { rpc: world.rpc } : null),
}));

import { GET } from '@/app/api/admin/funnel/route';

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_EMAIL = 'boss@example.com';
  world.user = { id: 'u', email: 'boss@example.com' };
  world.admin = true;
  world.rpc.mockReset();
  world.rpc.mockResolvedValue({ data: [{ step: 'landed', n: 10 }, { step: 'browsed', n: 5 }], error: null });
});

describe('GET /api/admin/funnel', () => {
  it('refuses a visitor with no session (401) and a signed-in non-admin (403)', async () => {
    world.user = null;
    expect((await GET()).status).toBe(401);
    world.user = { id: 'x', email: 'student@example.com' };
    const res = await GET();
    expect(res.status).toBe(403);
    expect(world.rpc).not.toHaveBeenCalled();
  });

  it('refuses everyone when no admin email is configured', async () => {
    delete process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    expect((await GET()).status).toBe(403);
  });

  it('returns the 7- and 30-day funnels, asking the database once per window', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.windows)).toEqual(['d7', 'd30']);
    expect(body.windows.d7[1]).toMatchObject({ key: 'browsed', count: 5, ofPrevious: 0.5 });
    expect(world.rpc).toHaveBeenCalledTimes(2);
    const [fn, args] = world.rpc.mock.calls[0];
    expect(fn).toBe('funnel_step_counts');
    expect(Object.keys(args)).toEqual(['p_since']);
  });

  it('says which migration is missing instead of a bare 500', async () => {
    world.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no function' } });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('migration_missing');
    expect(body.hint).toContain('20261029_v27_funnel_steps.sql');
  });

  it('reports any other failure without leaking the database message', async () => {
    world.rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement; secret detail' } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

// ── No peeking ───────────────────────────────────────────────────────────────

describe('no outcome-by-arm interface (PREREG §8, §12.8)', () => {
  const files = [
    'lib/admin/funnel.ts',
    'app/api/admin/funnel/route.ts',
    'app/admin/funnel/page.tsx',
  ];

  it.each(files)('%s never mentions an arm or the fairness adjustment', (f) => {
    const src = readFileSync(f, 'utf8').split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))        // comments may explain the rule
      .join('\n');
    expect(src).not.toMatch(/ranking_variant|ab_arm|fairness|cohort/i);
  });

  it('the database function reads no arm column', () => {
    const sql = readFileSync('scripts/20261029_v27_funnel_steps.sql', 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/ranking_variant|ab_arm/i);
  });
});

describe('/start instrumentation', () => {
  const src = readFileSync('components/start/StartBrowse.tsx', 'utf8');
  it('logs browsed (scroll or filter) and personalize_shown, once per session', () => {
    expect(src).toContain("logStepOnce('personalize_shown')");
    expect(src).toContain("logStepOnce('browsed', { how: 'scroll' })");
    expect(src).toContain("logStepOnce('browsed', { how: 'filter' })");
    expect(src).toContain('sessionStorage.getItem(key)');
  });
});
