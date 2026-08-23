/**
 * The LINE reminder cron's route-level safety behaviour.
 *
 * `lib/line/reminders.ts` is well covered by trackerReminders.test.ts, but the decision
 * that matters most to a student lives in the route: what happens when the idempotency
 * log cannot be read. An unread log looks exactly like an empty one, and treating it as
 * empty means every eligible reminder is re-sent as if it had never gone out.
 *
 * These push real messages to real phones, so the route must fail closed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const linePush = vi.fn();
vi.mock('@/lib/line/push', () => ({ linePush: (...args: unknown[]) => linePush(...args) }));

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

const { GET } = await import('../app/api/cron/line-reminders/route');

const SECRET = 'cron-secret';
const authed = () =>
  new NextRequest('http://localhost/api/cron/line-reminders', {
    headers: { authorization: `Bearer ${SECRET}` },
  });

/** ISO date `days` from today in Bangkok — the same arithmetic the route uses. */
function bkkPlus(days: number): string {
  const bkkNow = new Date(Date.now() + 7 * 3600 * 1000);
  const midnight = Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate());
  return new Date(midnight + days * 86_400_000).toISOString().slice(0, 10);
}

/** A tracked row wired to a linked LINE account, opted in, closing in `days`. */
const trackedRow = (days: number) => ({
  id: 't1',
  user_id: 'u1',
  scholarship_id: 'TD-0001',
  status: 'interested',
  reminder_opt_in: true,
  profiles: { line_user_id: 'U-line-1' },
  td_scholarships: {
    scholarship_name: 'Test Scholarship',
    deadline_date: bkkPlus(days),
    application_link: 'https://example.org/apply',
  },
});

/** Chainable stub: every builder method returns itself and awaits to `result`. */
function table(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const fn of ['select', 'eq', 'in', 'not', 'order', 'insert']) {
    builder[fn] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);
  return builder;
}

function mockDb(tracked: unknown[], log: { data?: unknown; error?: unknown }) {
  return {
    from: (name: string) =>
      name === 'tracked_scholarship' ? table({ data: tracked }) : table(log),
  };
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  linePush.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('GET /api/cron/line-reminders', () => {
  it('refuses without the cron secret', async () => {
    createClient.mockReturnValue(mockDb([], { data: [] }));
    const res = await GET(new NextRequest('http://localhost/api/cron/line-reminders'));
    expect(res.status).toBe(401);
    expect(linePush).not.toHaveBeenCalled();
  });

  it('sends nothing when the idempotency log cannot be read', async () => {
    // The regression this guards: `sentLog` was destructured without its error, so a
    // failed read produced an empty dedup set and every reminder went out again.
    createClient.mockReturnValue(
      mockDb([trackedRow(1)], { error: { message: 'connection reset' } }),
    );
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(linePush).not.toHaveBeenCalled();
  });

  it('sends when a deadline lands exactly on an offset', async () => {
    createClient.mockReturnValue(mockDb([trackedRow(1)], { data: [] }));
    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(linePush).toHaveBeenCalledTimes(1);
    expect(linePush.mock.calls[0][0]).toBe('U-line-1');
  });

  it('does not send for a deadline that is merely near an offset', async () => {
    // The property that makes this cron safe to switch on: it fires on an exact date
    // match, so it can never flush a backlog of missed reminders in one run.
    createClient.mockReturnValue(mockDb([trackedRow(7)], { data: [] }));
    const body = await (await GET(authed())).json();
    expect(body.sent).toBe(0);
    expect(linePush).not.toHaveBeenCalled();
  });

  it('does not send twice for the same deadline', async () => {
    const deadline = bkkPlus(1);
    createClient.mockReturnValue(mockDb([trackedRow(1)], {
      data: [{ user_id: 'u1', scholarship_id: 'TD-0001', offset_days: 1, deadline_date: deadline }],
    }));
    const body = await (await GET(authed())).json();
    expect(body.sent).toBe(0);
    expect(linePush).not.toHaveBeenCalled();
  });
});
