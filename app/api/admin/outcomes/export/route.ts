/**
 * GET /api/admin/outcomes/export
 * Admin-only CSV export of self-reported scholarship outcomes — the file used
 * for the research paper.
 *
 * PDPA gate: ONLY rows with consent_research = TRUE are exported. The filter is
 * applied in the query, not in post-processing, so a bug downstream cannot leak
 * a non-consented row.
 *
 * Identity: user_id is replaced by a stable SHA-256 pseudonym, matching
 * /api/research/export. The same student hashes to the same value across
 * exports, so rows stay linkable for analysis without carrying a direct
 * identifier. Names, emails and LINE ids are never included.
 *
 * Reads v_admin_outcomes so province, region and education level come from the
 * research profile (falling back to onboarding) rather than a second query.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/admin/auth';
import { normaliseFilters } from '@/lib/admin/awards';

const HEADERS = [
  'Pseudonymous User ID', 'Province', 'Region', 'Education Level',
  'Scholarship ID', 'Scholarship Name', 'Status', 'Amount (THB)',
  'Reported At', 'Source',
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function pseudonymise(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex');
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse('Forbidden', { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new NextResponse('Server configuration error', { status: 500 });

  const { searchParams } = new URL(request.url);
  const filters = normaliseFilters(searchParams);
  const since = searchParams.get('since');   // ISO date, optional (legacy param)

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let query = db
    .from('v_admin_outcomes')
    .select('user_id, province, region, education_level, scholarship_id, scholarship_name, status, amount_thb, reported_at, source')
    .eq('consent_research', true)          // ← hard PDPA gate, applied in-query
    .order('reported_at', { ascending: true });

  // The table's filters carry through to the export, so what you see is what
  // you download.
  if (filters.status)   query = query.eq('status', filters.status);
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.region)   query = query.eq('region', filters.region);
  if (filters.from)     query = query.gte('reported_at', `${filters.from}T00:00:00Z`);
  if (filters.to)       query = query.lte('reported_at', `${filters.to}T23:59:59.999Z`);
  if (since)            query = query.gte('reported_at', since);

  const { data, error } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });

  type Row = {
    user_id: string; province: string | null; region: string | null;
    education_level: string | null; scholarship_id: string;
    scholarship_name: string | null; status: string;
    amount_thb: number | null; reported_at: string; source: string;
  };

  const lines = [
    HEADERS.join(','),
    ...((data ?? []) as unknown as Row[]).map(r => [
      pseudonymise(r.user_id),
      r.province,
      r.region,
      r.education_level,
      r.scholarship_id,
      r.scholarship_name,
      r.status,
      r.amount_thb,
      r.reported_at,
      r.source,
    ].map(cell).join(',')),
  ];

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[admin/outcomes/export] ${admin} exported ${lines.length - 1} consented rows`);

  return new NextResponse('﻿' + lines.join('\n') + '\n', {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tundee_outcomes_consented_${today}.csv"`,
      'X-Record-Count':      String(lines.length - 1),
      'X-Export-Basis':      'PDPA-2562-consent',
    },
  });
}
