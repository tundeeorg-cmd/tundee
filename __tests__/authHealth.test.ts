/**
 * /api/health/auth is the only alarm for "people sign up and never get in":
 * Vercel's Hobby plan keeps no useful runtime history. It must refuse anyone
 * without CRON_SECRET and must never return an identifier.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const listUsers = vi.fn();
const profileRows = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers } },
    from: () => ({ select: () => ({ in: async () => profileRows() }) }),
  }),
}));

import { GET } from '@/app/api/health/auth/route';

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const line = (id: string, last: string | null, created = ago(1)) => ({
  id, created_at: created, last_sign_in_at: last,
  app_metadata: { provider: 'custom:line' }, user_metadata: {},
});
const req = (auth?: string) =>
  new NextRequest('http://localhost/api/health/auth', { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  listUsers.mockReset();
  profileRows.mockReset();
});

describe('/api/health/auth', () => {
  it('refuses a request without the secret', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer nope'))).status).toBe(401);
  });

  it('alerts when new LINE accounts exist and none has ever signed in', async () => {
    listUsers.mockResolvedValue({ data: { users: [line('a', null), line('b', null), line('c', null), line('old', null, ago(30))] }, error: null });
    profileRows.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null });
    const body = await (await GET(req('Bearer s3cret'))).json();
    expect(body.by_provider.line).toEqual({ created: 3, signed_in: 0, with_profile: 3 });
    expect(body.line_never_signed_in_total).toBe(4);
    expect(body.alert).toBe(true);
  });

  it('is quiet when new accounts signed in and have profiles', async () => {
    listUsers.mockResolvedValue({ data: { users: [line('a', ago(0.5)), line('b', ago(0.2))] }, error: null });
    profileRows.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const body = await (await GET(req('Bearer s3cret'))).json();
    expect(body.alert).toBe(false);
  });

  it('alerts on a new account with no profile row', async () => {
    listUsers.mockResolvedValue({ data: { users: [line('a', ago(0.5))] }, error: null });
    profileRows.mockResolvedValue({ data: [], error: null });
    expect((await (await GET(req('Bearer s3cret'))).json()).alert).toBe(true);
  });

  it('returns counts only, never an id or email', async () => {
    listUsers.mockResolvedValue({ data: { users: [line('secret-user-id', null)] }, error: null });
    profileRows.mockResolvedValue({ data: [], error: null });
    const text = await (await GET(req('Bearer s3cret'))).text();
    expect(text).not.toContain('secret-user-id');
    expect(text).not.toContain('@');
  });
});
