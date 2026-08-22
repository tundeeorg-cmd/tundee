/**
 * GET  /api/admin/outcomes  — filtered Awards table for /admin.
 * POST /api/admin/outcomes  — manually log an outcome an admin learned about.
 *
 * Reads public.v_admin_outcomes (outcomes ↔ profiles ↔ student_profile) with
 * the service role behind the admin gate: outcomes is RLS-limited to own-row
 * reads, so the browser's anon client would come back empty.
 *
 * Query params (GET): status, province, region, from, to, search, limit.
 * Emails are merged in from auth.users — they are never stored in outcomes.
 *
 * Privacy: this endpoint returns display names, emails and provinces. It is
 * operational, admin-only, and deliberately separate from the research export
 * at /api/admin/outcomes/export, which is consent-gated and pseudonymous.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';
import {
  normaliseFilters,
  matchesSearch,
  OUTCOME_STATUSES,
  type AwardRow,
} from '@/lib/admin/awards';

/** Pages of auth.users to scan when resolving emails (1000 per page). */
const MAX_USER_PAGES = 5;

function serviceDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * user_id → email, for the ids present on this page of results.
 * auth.users is not reachable through PostgREST, so this uses the admin API.
 * Best-effort: on failure the table simply renders without emails.
 */
async function emailMap(db: SupabaseClient, wanted: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!wanted.size) return map;

  try {
    for (let page = 1; page <= MAX_USER_PAGES; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;

      for (const u of data.users) {
        if (wanted.has(u.id) && u.email) map.set(u.id, u.email);
      }
      if (map.size >= wanted.size) break;
      if (data.users.length < 1000) break;
    }
  } catch (err) {
    console.error('[admin/outcomes] email lookup failed:', err);
  }
  return map;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = serviceDb();
  if (!db) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const filters = normaliseFilters(searchParams);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10) || 500, 2000);

  let query = db
    .from('v_admin_outcomes')
    .select('id, user_id, scholarship_id, scholarship_name, status, amount_thb, consent_research, reported_at, source, note, display_name, province, region, education_level')
    .order('reported_at', { ascending: false })
    .limit(limit);

  if (filters.status)   query = query.eq('status', filters.status);
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.region)   query = query.eq('region', filters.region);
  if (filters.from)     query = query.gte('reported_at', `${filters.from}T00:00:00Z`);
  if (filters.to)       query = query.lte('reported_at', `${filters.to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as AwardRow[];
  const emails = await emailMap(db, new Set(rows.map(r => r.user_id)));
  const withEmail = rows.map(r => ({ ...r, email: emails.get(r.user_id) ?? null }));

  // Search last, so it can also match the email merged in above.
  return NextResponse.json({ rows: withEmail.filter(r => matchesSearch(r, filters.search)) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = serviceDb();
  if (!db) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { user_id, scholarship_id, status, amount_thb, note } = body as {
    user_id?: string; scholarship_id?: string; status?: string;
    amount_thb?: number | string | null; note?: string;
  };

  if (!user_id)        return NextResponse.json({ error: 'user_id required' }, { status: 422 });
  if (!scholarship_id) return NextResponse.json({ error: 'scholarship_id required' }, { status: 422 });
  if (!status || !(OUTCOME_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${OUTCOME_STATUSES.join(', ')}` }, { status: 422 });
  }

  let amount: number | null = null;
  if (amount_thb !== undefined && amount_thb !== null && amount_thb !== '') {
    amount = typeof amount_thb === 'number' ? amount_thb : parseFloat(String(amount_thb));
    if (!isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'amount_thb must be a non-negative number' }, { status: 422 });
    }
  }

  const { data: sch, error: schErr } = await db
    .from('td_scholarships').select('scholarship_name')
    .eq('scholarship_id', scholarship_id).maybeSingle();

  if (schErr) return NextResponse.json({ error: schErr.message }, { status: 500 });
  if (!sch)   return NextResponse.json({ error: 'No such scholarship' }, { status: 404 });

  const now = new Date().toISOString();

  // Upsert, not insert: (user_id, scholarship_id) is unique, so an admin
  // correcting an earlier report updates it rather than colliding.
  // consent_research is deliberately NOT set here — only the student can grant it.
  const { error } = await db.from('outcomes').upsert(
    {
      user_id,
      scholarship_id,
      scholarship_name: (sch as { scholarship_name: string | null }).scholarship_name,
      status,
      amount_thb:  amount,
      note:        note?.trim() || null,
      source:      'admin',
      reported_at: now,
      updated_at:  now,
    },
    { onConflict: 'user_id,scholarship_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[admin/outcomes] ${admin} logged ${status} user=${user_id} scholarship=${scholarship_id}`);
  return NextResponse.json({ ok: true });
}
