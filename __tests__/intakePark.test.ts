/**
 * /api/intake must park answers using only the privilege v20 grants anon: INSERT.
 *
 * It used to ask for the new row back (`.select('id')`), which needs SELECT, so
 * every call failed in production and the table stayed empty for its whole life.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isIntakeId } from '@/lib/intake/pendingIntake';

const calls = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn(), result: { error: null as null | { code: string; message: string } } }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: unknown) => { calls.insert(row); return { select: calls.select, then: (r: (v: unknown) => unknown) => Promise.resolve(calls.result).then(r) }; },
    }),
  }),
}));

import { POST } from '@/app/api/intake/route';

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/intake', { method: 'POST', body: JSON.stringify(body) }));

const answers = { level: 'M4-M6', province: 'ขอนแก่น', income: 4, gpa: null };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'k';
  calls.insert.mockClear(); calls.select.mockClear();
  calls.result.error = null;
});

describe('POST /api/intake', () => {
  it('parks the answers and returns an id the claim step will accept', async () => {
    const res = await post({ answers });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(isIntakeId(body.id)).toBe(true);
    expect(calls.insert).toHaveBeenCalledWith(expect.objectContaining({ id: body.id }));
  });

  it('never asks for the row back (RETURNING needs SELECT, which anon does not have)', async () => {
    await post({ answers });
    expect(calls.select).not.toHaveBeenCalled();
  });

  it('reports a failed insert instead of returning an id that points at nothing', async () => {
    calls.result.error = { code: '42501', message: 'denied' };
    const res = await post({ answers });
    expect(res.status).toBe(500);
    expect((await res.json()).id).toBeUndefined();
  });

  it('rejects answers that are not a preview input', async () => {
    expect((await post({ answers: { level: 'nope' } })).status).toBe(400);
    expect(calls.insert).not.toHaveBeenCalled();
  });
});
