/**
 * POST /api/meta/capi — server-side mirror to every configured Meta dataset.
 *
 * The properties that matter: both datasets receive the conversion, each with
 * its own token, carrying the SAME event_id (that is what lets each dataset
 * de-duplicate against its own browser copy), and one dataset failing does not
 * cost the other the event.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser } }),
}));

import { POST } from '@/app/api/meta/capi/route';

const PRIMARY = '28939107965678201';
const AGENCY  = '518364469095414';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/meta/capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'vitest' },
    body: JSON.stringify(body),
  });
}

const VALID = { eventName: 'Lead', eventId: 'evt-123', eventSourceUrl: 'https://www.tundee.org/start' };

/** Graph API calls made, decoded into something readable. */
function graphCalls() {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url, init]) => {
    const u = new URL(String(url));
    const body = JSON.parse(String((init as RequestInit).body));
    return {
      pixelId: u.pathname.split('/')[2],
      token:   u.searchParams.get('access_token'),
      eventId: body.data[0].event_id,
      eventName: body.data[0].event_name,
      testEventCode: body.test_event_code,
    };
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  getUser.mockResolvedValue({ data: { user: null } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function bothDatasets() {
  vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
  vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'tok-primary');
  vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID_AGENCY', AGENCY);
  vi.stubEnv('META_CAPI_ACCESS_TOKEN_AGENCY', 'tok-agency');
}

describe('fan-out to both datasets', () => {
  it('posts the conversion to each pixel with its own token', async () => {
    bothDatasets();
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, delivered: 2, attempted: 2 });

    const calls = graphCalls();
    expect(calls.map(c => [c.pixelId, c.token])).toEqual([
      [PRIMARY, 'tok-primary'],
      [AGENCY,  'tok-agency'],
    ]);
  });

  it('sends the SAME event_id to both — de-duplication depends on it', async () => {
    bothDatasets();
    await POST(req(VALID));
    const ids = graphCalls().map(c => c.eventId);
    expect(ids).toEqual(['evt-123', 'evt-123']);
  });

  it('still delivers to the agency when the primary dataset rejects', async () => {
    bothDatasets();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) =>
      String(url).includes(PRIMARY)
        ? new Response('bad token', { status: 400 })
        : new Response('{}', { status: 200 }));

    const res = await POST(req(VALID));
    expect(await res.json()).toMatchObject({ ok: true, delivered: 1, attempted: 2 });
  });

  it('survives a network throw from one dataset', async () => {
    bothDatasets();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes(AGENCY)) throw new Error('ECONNRESET');
      return new Response('{}', { status: 200 });
    });

    const res = await POST(req(VALID));
    expect(await res.json()).toMatchObject({ ok: true, delivered: 1 });
  });

  it('reports 202 when every dataset fails', async () => {
    bothDatasets();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('nope', { status: 500 }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: false, delivered: 0, attempted: 2 });
  });

  it('never leaks a token into the response body', async () => {
    bothDatasets();
    const res = await POST(req(VALID));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('tok-primary');
    expect(text).not.toContain('tok-agency');
  });
});

describe('gating', () => {
  it('stays dormant (204, no calls) when no dataset is configured', async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to one dataset only when only one is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', PRIMARY);
    vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'tok-primary');
    const res = await POST(req(VALID));
    expect(await res.json()).toMatchObject({ delivered: 1, attempted: 1 });
    expect(graphCalls().map(c => c.pixelId)).toEqual([PRIMARY]);
  });

  it('rejects a non-conversion event before contacting Meta', async () => {
    bothDatasets();
    const res = await POST(req({ ...VALID, eventName: 'PageView' }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a missing event id', async () => {
    bothDatasets();
    const res = await POST(req({ eventName: 'Lead' }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('test event codes', () => {
  it('applies the shared code to both datasets', async () => {
    bothDatasets();
    vi.stubEnv('META_TEST_EVENT_CODE', 'TEST123');
    await POST(req(VALID));
    expect(graphCalls().map(c => c.testEventCode)).toEqual(['TEST123', 'TEST123']);
  });

  it('lets the agency use its own code', async () => {
    bothDatasets();
    vi.stubEnv('META_TEST_EVENT_CODE', 'TEST123');
    vi.stubEnv('META_TEST_EVENT_CODE_AGENCY', 'TESTAGENCY');
    await POST(req(VALID));
    expect(graphCalls().map(c => c.testEventCode)).toEqual(['TEST123', 'TESTAGENCY']);
  });
});

describe('PII handling is unchanged', () => {
  it('hashes a signed-in email rather than sending it raw', async () => {
    bothDatasets();
    getUser.mockResolvedValue({ data: { user: { email: 'Somchai@Example.com ' } } });
    await POST(req(VALID));

    const body = JSON.parse(String(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    const em = body.data[0].user_data.em[0];
    expect(em).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain('Somchai');
    expect(JSON.stringify(body)).not.toContain('example.com');
  });
});
