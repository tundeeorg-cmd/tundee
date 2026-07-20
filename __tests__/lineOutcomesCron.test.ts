/**
 * Tests for GET|POST /api/cron/line-outcomes.
 * Mocks @supabase/supabase-js and global fetch (the LINE push API) — no
 * live DB or LINE access token needed. Dates are computed relative to the
 * real "today" (via bangkokMidnight/addDays) so the test doesn't depend on
 * the wall-clock date it happens to run on.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMockDb } from './helpers/mockSupabase';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import { addDays } from '@/lib/line/reminders';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { GET, POST } from '@/app/api/cron/line-outcomes/route';

const CRON_SECRET = 'test-cron-secret';
const TODAY_STR = bangkokMidnight().toISOString().slice(0, 10);
const deadlineFor = (offsetDays: number) => addDays(TODAY_STR, -offsetDays);

function cronRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/cron/line-outcomes', { headers });
}

function trackedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: 'user-1',
    scholarship_id: 'TD-0001',
    status: 'applied',
    reminder_opt_in: true,
    profiles: { line_user_id: 'Uabc123' },
    td_scholarships: { scholarship_name: 'ทุนทดสอบ', deadline_date: deadlineFor(30) },
    ...overrides,
  };
}

describe('GET|POST /api/cron/line-outcomes', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', 'test-access-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    const res = await GET(cronRequest({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('is invoked as GET (the method Vercel Cron actually uses) as well as POST', async () => {
    const db = createMockDb({
      tracked_scholarship: { select: { data: [], error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const headers = { authorization: `Bearer ${CRON_SECRET}` };
    expect((await GET(cronRequest(headers))).status).toBe(200);
    expect((await POST(cronRequest(headers))).status).toBe(200);
  });

  it('sends exactly one outcome follow-up (3 quick-reply buttons) for a row 30 days past deadline, and logs attempt 1', async () => {
    const db = createMockDb({
      tracked_scholarship: { select: { data: [trackedRow()], error: null } },
      outcome_followup_log: { select: { data: [], error: null }, insert: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sent).toBe(1);
    expect(json.errors).toBe(0);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    const pushBody = JSON.parse(init.body as string);
    expect(pushBody.to).toBe('Uabc123');
    expect(pushBody.messages[0].quickReply.items).toHaveLength(3);

    const logInsert = db._calls.find(c => c.table === 'outcome_followup_log' && c.fn === 'insert');
    expect(logInsert?.args[0]).toMatchObject({
      user_id: 'user-1', scholarship_id: 'TD-0001', attempt_no: 1,
    });
  });

  it('does not re-send an attempt already recorded in outcome_followup_log (idempotent)', async () => {
    const db = createMockDb({
      tracked_scholarship: { select: { data: [trackedRow()], error: null } },
      outcome_followup_log: {
        select: { data: [{ user_id: 'user-1', scholarship_id: 'TD-0001', attempt_no: 1 }], error: null },
      },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();

    expect(json.sent).toBe(0);
    expect(json.skipped).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips a row with no line_user_id', async () => {
    const db = createMockDb({
      tracked_scholarship: {
        select: { data: [trackedRow({ profiles: { line_user_id: null } })], error: null },
      },
      outcome_followup_log: { select: { data: [], error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never asks before the deadline has passed (future deadline_date)', async () => {
    const db = createMockDb({
      tracked_scholarship: {
        select: {
          data: [trackedRow({ td_scholarships: { scholarship_name: 'ทุนทดสอบ', deadline_date: addDays(TODAY_STR, 5) } })],
          error: null,
        },
      },
      outcome_followup_log: { select: { data: [], error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips a row with no concrete deadline_date (rolling/prose deadline)', async () => {
    const db = createMockDb({
      tracked_scholarship: {
        select: {
          data: [trackedRow({ td_scholarships: { scholarship_name: 'ทุนทดสอบ', deadline_date: null } })],
          error: null,
        },
      },
      outcome_followup_log: { select: { data: [], error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('appends the optional incentive note when OUTCOME_FOLLOWUP_INCENTIVE_NOTE is set', async () => {
    vi.stubEnv('OUTCOME_FOLLOWUP_INCENTIVE_NOTE', 'ขอบคุณที่ช่วยตอบนะคะ 🙏');
    const db = createMockDb({
      tracked_scholarship: { select: { data: [trackedRow()], error: null } },
      outcome_followup_log: { select: { data: [], error: null }, insert: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await GET(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }));

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const pushBody = JSON.parse(init.body as string);
    expect(pushBody.messages[0].text).toContain('ขอบคุณที่ช่วยตอบนะคะ');
  });
});
