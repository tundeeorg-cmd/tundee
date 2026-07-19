/**
 * POST /api/admin/research/outcomes
 * Admin: import partner-verified scholarship outcomes (Mechanism C).
 *
 * Accepts JSON body: { partner_name, rows: Array<{ external_applicant_id, scholarship_id, outcome, outcome_date?, notes? }> }
 * Stores in outcome_partner with provenance = "partner_verified".
 *
 * Privacy: external_applicant_id is the PARTNER'S anonymous ID (never our user_id).
 * Offline matching (if needed) is done in the analysis pipeline, not here.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient }               from '@supabase/supabase-js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);
const VALID_OUTCOMES = ['applied', 'awarded', 'rejected'] as const;

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { partner_name, rows } = body as {
    partner_name?: string;
    rows?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: 'rows array required' }, { status: 422 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const now         = new Date().toISOString();
  const importedBy  = user.email ?? user.id;
  const errors: string[] = [];
  const payloads: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.external_applicant_id) { errors.push(`row ${i}: external_applicant_id required`); continue; }
    if (!row.scholarship_id)        { errors.push(`row ${i}: scholarship_id required`); continue; }
    if (!VALID_OUTCOMES.includes(row.outcome as (typeof VALID_OUTCOMES)[number])) {
      errors.push(`row ${i}: invalid outcome "${row.outcome}"`); continue;
    }

    payloads.push({
      scholarship_id:        row.scholarship_id,
      external_applicant_id: row.external_applicant_id,
      outcome:               row.outcome,
      outcome_date:          row.outcome_date ?? null,
      provenance:            'partner_verified',
      partner_name:          partner_name ?? null,
      imported_by:           importedBy,
      imported_at:           now,
      notes:                 row.notes ?? null,
    });
  }

  if (!payloads.length) {
    return NextResponse.json({ errors, inserted: 0 }, { status: 422 });
  }

  const { data, error } = await db.from('outcome_partner').insert(payloads).select('id');
  if (error) return NextResponse.json({ error: error.message, errors }, { status: 500 });

  return NextResponse.json({
    inserted: data?.length ?? 0,
    skipped:  rows.length - payloads.length,
    errors,
  });
}
