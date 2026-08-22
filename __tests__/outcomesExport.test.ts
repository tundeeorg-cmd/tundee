/**
 * Tests for GET /api/admin/outcomes/export — the PDPA gate.
 * Only rows with consent_research = TRUE may leave the system, and the filter
 * must be applied in the query rather than in post-processing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMockDb, type MockDbCall } from './helpers/mockSupabase';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser } }),
}));

import { GET } from '@/app/api/admin/outcomes/export/route';

const ADMIN = 'admin@tundee.org';

function exportRequest(url = 'http://localhost/api/admin/outcomes/export'): NextRequest {
  return new NextRequest(url);
}

const consentedRow = {
  user_id: '11111111-1111-1111-1111-111111111111',
  province: 'สุรินทร์',
  region: 'Northeast',
  education_level: 'bachelor',
  scholarship_id: 'TD-0001',
  scholarship_name: 'ทุนตัวอย่าง',
  status: 'awarded',
  amount_thb: 50000,
  reported_at: '2026-08-20T03:00:00.000Z',
  source: 'line',
};

describe('GET /api/admin/outcomes/export', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_EMAIL', ADMIN);
    getUser.mockResolvedValue({ data: { user: { email: ADMIN } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('refuses a non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'student@example.com' } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());

    const res = await GET(exportRequest());
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockDb());

    expect((await GET(exportRequest())).status).toBe(403);
  });

  it('filters on consent_research in the query, not after the fact', async () => {
    const db = createMockDb({ v_admin_outcomes: { select: { data: [consentedRow], error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await GET(exportRequest());

    const eqCalls = (db._calls as MockDbCall[]).filter(c => c.table === 'v_admin_outcomes' && c.fn === 'eq');
    expect(eqCalls.some(c => c.args[0] === 'consent_research' && c.args[1] === true)).toBe(true);
  });

  it('exports a consented row as CSV without any direct identifier', async () => {
    const db = createMockDb({ v_admin_outcomes: { select: { data: [consentedRow], error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(exportRequest());
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Record-Count')).toBe('1');
    expect(res.headers.get('X-Export-Basis')).toBe('PDPA-2562-consent');
    expect(res.headers.get('Content-Type')).toContain('text/csv');

    expect(body).toContain('TD-0001');
    expect(body).toContain('awarded');
    expect(body).toContain('50000');

    // Research columns the paper needs.
    expect(body).toContain('สุรินทร์');
    expect(body).toContain('Northeast');
    expect(body).toContain('bachelor');

    // The raw user_id must never appear — only its SHA-256 pseudonym.
    expect(body).not.toContain(consentedRow.user_id);
    expect(body).toMatch(/[0-9a-f]{64}/);
  });

  it('returns only headers when nothing is consented', async () => {
    const db = createMockDb({ v_admin_outcomes: { select: { data: [], error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const res = await GET(exportRequest());
    expect(res.headers.get('X-Record-Count')).toBe('0');
    expect((await res.text()).trim().split('\n')).toHaveLength(1);
  });

  it('quotes a scholarship name containing a comma', async () => {
    const db = createMockDb({
      v_admin_outcomes: {
        select: { data: [{ ...consentedRow, scholarship_name: 'ทุน ก, ข และ ค' }], error: null },
      },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    expect(await (await GET(exportRequest())).text()).toContain('"ทุน ก, ข และ ค"');
  });

  it('passes ?since through as a reported_at lower bound', async () => {
    const db = createMockDb({ v_admin_outcomes: { select: { data: [], error: null } } });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await GET(exportRequest('http://localhost/api/admin/outcomes/export?since=2026-01-01'));

    const gte = (db._calls as MockDbCall[]).find(c => c.table === 'v_admin_outcomes' && c.fn === 'gte');
    expect(gte?.args).toEqual(['reported_at', '2026-01-01']);
  });
});
