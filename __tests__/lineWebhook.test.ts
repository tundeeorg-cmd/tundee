/**
 * Tests for POST /api/line/webhook.
 * Mocks @supabase/supabase-js and global fetch (the LINE reply/push API) —
 * no live DB or LINE access token needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createMockDb } from './helpers/mockSupabase';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { POST } from '@/app/api/line/webhook/route';

const SECRET = 'test-channel-secret';

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function webhookRequest(body: string, signature: string): NextRequest {
  return new NextRequest('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': signature },
    body,
  });
}

describe('POST /api/line/webhook', () => {
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

  it('rejects a request with an invalid signature', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    const body = JSON.stringify({ events: [] });
    const res = await POST(webhookRequest(body, 'not-the-real-signature'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a request with a valid signature and no events', async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());
    const body = JSON.stringify({ events: [] });
    const res = await POST(webhookRequest(body, sign(body, SECRET)));
    expect(res.status).toBe(200);
  });

  it('links line_user_id on a valid 6-digit code message', async () => {
    const db = createMockDb({ profiles: { update: { error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{
        type: 'message',
        source: { type: 'user', userId: 'Uabc123' },
        message: { type: 'text', text: '123456' },
      }],
    });
    const res = await POST(webhookRequest(body, sign(body, SECRET)));
    expect(res.status).toBe(200);

    const update = db._calls.find(c => c.table === 'profiles' && c.fn === 'update');
    expect(update?.args[0]).toMatchObject({ line_user_id: 'Uabc123' });
    const eqLinkCode = db._calls.find(c => c.table === 'profiles' && c.fn === 'eq' && c.args[0] === 'line_link_code');
    expect(eqLinkCode?.args).toEqual(['line_link_code', '123456']);
  });

  it('clears line_user_id and line_linked_at on unfollow', async () => {
    const db = createMockDb({ profiles: { update: { error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{ type: 'unfollow', source: { type: 'user', userId: 'Uabc123' } }],
    });
    const res = await POST(webhookRequest(body, sign(body, SECRET)));
    expect(res.status).toBe(200);

    const update = db._calls.find(c => c.table === 'profiles' && c.fn === 'update');
    expect(update?.args[0]).toEqual({ line_user_id: null, line_linked_at: null });
    const eq = db._calls.find(c => c.table === 'profiles' && c.fn === 'eq');
    expect(eq?.args).toEqual(['line_user_id', 'Uabc123']);
  });

  it('records a self_report_outcome event, sets status=awarded, and replies with a congrats confirmation', async () => {
    const db = createMockDb({
      profiles: { select: { data: { id: 'user-1' }, error: null } },
      event: { insert: { error: null } },
      tracked_scholarship: { update: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{
        type: 'postback',
        replyToken: 'reply-token-1',
        source: { type: 'user', userId: 'Uabc123' },
        postback: { data: 'outcome:TD-0001:awarded' },
      }],
    });
    const res = await POST(webhookRequest(body, sign(body, SECRET)));
    expect(res.status).toBe(200);

    const eventInsert = db._calls.find(c => c.table === 'event' && c.fn === 'insert');
    expect(eventInsert?.args[0]).toMatchObject({
      user_id: 'user-1',
      scholarship_id: 'TD-0001',
      event_type: 'self_report_outcome',
      outcome: 'awarded',
      outcome_source: 'self_report',
    });

    const statusUpdate = db._calls.find(c => c.table === 'tracked_scholarship' && c.fn === 'update');
    expect(statusUpdate?.args[0]).toMatchObject({ status: 'awarded' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/reply',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const replyPayload = JSON.parse(init.body as string);
    expect(replyPayload.replyToken).toBe('reply-token-1');
    expect(replyPayload.messages[0].text).toContain('ยินดีด้วย');
  });

  it('records a rejected outcome and updates status without a congrats line', async () => {
    const db = createMockDb({
      profiles: { select: { data: { id: 'user-1' }, error: null } },
      event: { insert: { error: null } },
      tracked_scholarship: { update: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{
        type: 'postback',
        replyToken: 'reply-token-2',
        source: { type: 'user', userId: 'Uabc123' },
        postback: { data: 'outcome:TD-0001:rejected' },
      }],
    });
    await POST(webhookRequest(body, sign(body, SECRET)));

    const statusUpdate = db._calls.find(c => c.table === 'tracked_scholarship' && c.fn === 'update');
    expect(statusUpdate?.args[0]).toMatchObject({ status: 'rejected' });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const replyPayload = JSON.parse(init.body as string);
    expect(replyPayload.messages[0].text).not.toContain('ยินดีด้วย');
  });

  it('leaves tracked_scholarship.status untouched for a "waiting" answer', async () => {
    const db = createMockDb({
      profiles: { select: { data: { id: 'user-1' }, error: null } },
      event: { insert: { error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{
        type: 'postback',
        replyToken: 'reply-token-3',
        source: { type: 'user', userId: 'Uabc123' },
        postback: { data: 'outcome:TD-0001:waiting' },
      }],
    });
    await POST(webhookRequest(body, sign(body, SECRET)));

    const statusUpdate = db._calls.find(c => c.table === 'tracked_scholarship' && c.fn === 'update');
    expect(statusUpdate).toBeUndefined();
  });

  it('ignores a postback for an unlinked line_user_id (no profile match)', async () => {
    const db = createMockDb({
      profiles: { select: { data: null, error: null } },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const body = JSON.stringify({
      events: [{
        type: 'postback',
        replyToken: 'reply-token-4',
        source: { type: 'user', userId: 'Uunknown' },
        postback: { data: 'outcome:TD-0001:awarded' },
      }],
    });
    const res = await POST(webhookRequest(body, sign(body, SECRET)));
    expect(res.status).toBe(200);

    const eventInsert = db._calls.find(c => c.table === 'event' && c.fn === 'insert');
    expect(eventInsert).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
