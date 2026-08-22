/**
 * Integration tests for the survey half of POST /api/line/webhook.
 * Mocks @supabase/supabase-js and global fetch (the LINE reply API) — no live
 * DB or LINE access token needed.
 *
 * Covers: each of the four answers recording correctly, amount + consent
 * capture, idempotent re-tapping, and the six-digit amount vs. link-code
 * collision.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createMockDb, type MockDbResponses, type MockDbCall } from './helpers/mockSupabase';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { POST } from '@/app/api/line/webhook/route';

const SECRET  = 'test-channel-secret';
const LINE_ID = 'U-line-1';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SCH_ID  = 'TD-0001';

function sign(body: string): string {
  return crypto.createHmac('sha256', body ? SECRET : SECRET).update(body).digest('base64');
}

function req(body: string): NextRequest {
  return new NextRequest('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': sign(body) },
    body,
  });
}

function postbackEvent(data: string) {
  return JSON.stringify({
    events: [{
      type: 'postback',
      replyToken: 'reply-token-1',
      source: { type: 'user', userId: LINE_ID },
      postback: { data },
    }],
  });
}

function textEvent(text: string) {
  return JSON.stringify({
    events: [{
      type: 'message',
      replyToken: 'reply-token-1',
      source: { type: 'user', userId: LINE_ID },
      message: { type: 'text', text },
    }],
  });
}

/** Mock DB with a linked profile, a named scholarship and an open survey row. */
function db(surveyState: string | null = 'sent', extra: MockDbResponses = {}) {
  const responses: MockDbResponses = {
    profiles:        { select: { data: { id: USER_ID }, error: null }, update: { error: null } },
    td_scholarships: { select: { data: { scholarship_name: 'ทุนตัวอย่าง' }, error: null } },
    survey_log: {
      select: {
        data: surveyState
          ? [{ id: 7, scholarship_id: SCH_ID, state: surveyState }]
          : [],
        error: null,
      },
      update: { error: null },
      insert: { error: null },
    },
    outcomes:            { upsert: { error: null } },
    event:               { insert: { error: null } },
    tracked_scholarship: { update: { error: null } },
    ...extra,
  };
  const mock = createMockDb(responses);
  (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

const callsTo = (mock: { _calls: MockDbCall[] }, table: string, fn: string) =>
  mock._calls.filter(c => c.table === table && c.fn === fn);

const replyPayload = () => {
  const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .find(c => String(c[0]).includes('/message/reply'));
  return call ? JSON.parse((call[1] as { body: string }).body) : null;
};

describe('POST /api/line/webhook — outcome survey', () => {
  beforeEach(() => {
    vi.stubEnv('LINE_CHANNEL_SECRET', SECRET);
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', 'test-access-token');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── the four answers ────────────────────────────────────────────────────

  it.each([
    ['awarded',     'awarded'],
    ['waiting',     'waiting'],
    ['not_applied', 'not_applied'],
    ['rejected',    'rejected'],
  ])('records the %s answer to outcomes with source=line', async (choice, expected) => {
    const mock = db();
    const res = await POST(req(postbackEvent(`survey:${SCH_ID}:${choice}`)));
    expect(res.status).toBe(200);

    const upserts = callsTo(mock, 'outcomes', 'upsert');
    expect(upserts).toHaveLength(1);

    const row = upserts[0].args[0] as Record<string, unknown>;
    expect(row.user_id).toBe(USER_ID);
    expect(row.scholarship_id).toBe(SCH_ID);
    expect(row.status).toBe(expected);
    expect(row.source).toBe('line');
    expect(row.scholarship_name).toBe('ทุนตัวอย่าง');

    // Upsert must target the composite key, not blind-insert.
    expect(upserts[0].args[1]).toMatchObject({ onConflict: 'user_id,scholarship_id' });
  });

  it('writes an audit event alongside every answer', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:awarded`)));

    const row = callsTo(mock, 'event', 'insert')[0].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: USER_ID, scholarship_id: SCH_ID,
      event_type: 'self_report_outcome', outcome: 'awarded', outcome_source: 'self_report',
    });
  });

  it('awarded → asks for the amount and moves the survey to awaiting_amount', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:awarded`)));

    expect(replyPayload().messages[0].quickReply.items[0].action.data)
      .toBe(`amount:${SCH_ID}:skip`);
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0])
      .toMatchObject({ state: 'awaiting_amount' });
    expect(callsTo(mock, 'tracked_scholarship', 'update')[0].args[0])
      .toMatchObject({ status: 'awarded' });
  });

  it('waiting → schedules a re-ask instead of closing the survey', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:waiting`)));

    const patch = callsTo(mock, 'survey_log', 'update')[0].args[0] as Record<string, unknown>;
    expect(patch.state).toBe('awaiting_reask');
    expect(patch.reask_after).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(patch.responded_at).toBeTruthy();
    // "waiting" is not a tracked_scholarship status — leave the tracker alone.
    expect(callsTo(mock, 'tracked_scholarship', 'update')).toHaveLength(0);
  });

  it('not_applied → offers the deadline reminder opt-in', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:not_applied`)));

    expect(replyPayload().messages[0].quickReply.items.map((i: any) => i.action.data))
      .toEqual([`remind:${SCH_ID}:yes`, `remind:${SCH_ID}:no`]);
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0])
      .toMatchObject({ state: 'awaiting_reminder_optin' });
  });

  it('rejected → sends the supportive message with the tundee.org nudge', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:rejected`)));

    expect(replyPayload().messages[0].text).toContain('tundee.org');
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0]).toMatchObject({ state: 'done' });
  });

  // ── amount + consent capture ────────────────────────────────────────────

  it('captures a typed amount and then asks for consent', async () => {
    const mock = db('awaiting_amount');
    await POST(req(textEvent('50,000 บาท')));

    expect((callsTo(mock, 'outcomes', 'upsert')[0].args[0] as Record<string, unknown>).amount_thb)
      .toBe(50000);
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0])
      .toMatchObject({ state: 'awaiting_consent' });
    expect(replyPayload().messages[0].quickReply.items.map((i: any) => i.action.data))
      .toEqual([`consent:${SCH_ID}:yes`, `consent:${SCH_ID}:no`]);
  });

  it('re-prompts without recording when the amount is unreadable', async () => {
    const mock = db('awaiting_amount');
    await POST(req(textEvent('ประมาณห้าหมื่นมั้งคะ')));

    expect(callsTo(mock, 'outcomes', 'upsert')).toHaveLength(0);
    expect(callsTo(mock, 'survey_log', 'update')).toHaveLength(0);
    expect(replyPayload().messages[0].quickReply.items[0].action.data)
      .toBe(`amount:${SCH_ID}:skip`);
  });

  it('skipping the amount leaves amount_thb untouched and still asks for consent', async () => {
    const mock = db('awaiting_amount');
    await POST(req(postbackEvent(`amount:${SCH_ID}:skip`)));

    expect(callsTo(mock, 'outcomes', 'upsert')).toHaveLength(0);
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0])
      .toMatchObject({ state: 'awaiting_consent' });
    expect(replyPayload().messages[0].quickReply.items).toHaveLength(2);
  });

  it.each([['yes', true], ['no', false]])(
    'records consent=%s and closes the survey', async (answer, expected) => {
      const mock = db('awaiting_consent');
      await POST(req(postbackEvent(`consent:${SCH_ID}:${answer}`)));

      expect((callsTo(mock, 'outcomes', 'upsert')[0].args[0] as Record<string, unknown>).consent_research)
        .toBe(expected);
      expect(callsTo(mock, 'survey_log', 'update')[0].args[0]).toMatchObject({ state: 'done' });
    });

  it('applies the reminder opt-in from the not_applied branch', async () => {
    const mock = db('awaiting_reminder_optin');
    await POST(req(postbackEvent(`remind:${SCH_ID}:yes`)));

    expect(callsTo(mock, 'tracked_scholarship', 'update')[0].args[0])
      .toMatchObject({ reminder_opt_in: true });
    expect(callsTo(mock, 'survey_log', 'update')[0].args[0]).toMatchObject({ state: 'done' });
  });

  // ── idempotency ─────────────────────────────────────────────────────────

  it('re-tapping never inserts — it always upserts on the composite key', async () => {
    const mock = db();
    await POST(req(postbackEvent(`survey:${SCH_ID}:waiting`)));
    await POST(req(postbackEvent(`survey:${SCH_ID}:awarded`)));

    expect(callsTo(mock, 'outcomes', 'insert')).toHaveLength(0);

    const upserts = callsTo(mock, 'outcomes', 'upsert');
    expect(upserts).toHaveLength(2);
    for (const u of upserts) {
      expect(u.args[1]).toMatchObject({ onConflict: 'user_id,scholarship_id' });
    }
    // Latest answer wins.
    expect((upserts[1].args[0] as Record<string, unknown>).status).toBe('awarded');
  });

  // ── the six-digit collision ─────────────────────────────────────────────

  it('treats a six-digit reply as an amount while a survey awaits one', async () => {
    const mock = db('awaiting_amount');
    await POST(req(textEvent('100000')));

    expect((callsTo(mock, 'outcomes', 'upsert')[0].args[0] as Record<string, unknown>).amount_thb)
      .toBe(100000);
    // Must NOT have been consumed as an account link code.
    expect(callsTo(mock, 'profiles', 'update')).toHaveLength(0);
  });

  it('still treats a six-digit reply as a link code when no survey is open', async () => {
    const mock = db(null);
    await POST(req(textEvent('123456')));

    expect(callsTo(mock, 'outcomes', 'upsert')).toHaveLength(0);
    const update = callsTo(mock, 'profiles', 'update')[0];
    expect(update.args[0]).toMatchObject({ line_user_id: LINE_ID });
  });

  it('ignores a postback from a LINE id with no linked profile', async () => {
    const mock = db();
    mock._calls.length = 0;
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      createMockDb({ profiles: { select: { data: null, error: null } } }),
    );

    const res = await POST(req(postbackEvent(`survey:${SCH_ID}:awarded`)));
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
});
