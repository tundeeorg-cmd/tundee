/**
 * POST /api/admin/td-import
 *
 * Accepts pre-parsed rows from the client-side TdImport engine,
 * upserts them into td_scholarships (by scholarship_id), computes
 * the display gate for every upserted row, and returns an import report.
 *
 * Body: { rows: TdImportRow[] }
 * Response: { inserted, updated, skipped, errors: string[] }
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { TdImportRow } from '@/lib/tdScholarships/types';
import { parseDeadline } from '@/lib/tdScholarships/deadlineParser';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';

function fmtErr(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const e = err as Record<string, unknown>;
  return String(e.message ?? e.details ?? e.hint ?? JSON.stringify(err));
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error: missing env vars' }, { status: 500 });
    }

    // Admin auth
    let session = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch {
      // ignore
    }
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!session || !adminEmail || session.user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { rows: TdImportRow[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { rows } = body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, errors: [] });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const todayBkk = bangkokMidnight();

    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (row.action === 'skip') { skipped++; continue; }

      // Compute derived deadline fields
      const dp = parseDeadline(row.deadline_raw ?? null);

      // Compute display gate
      const gateInput = {
        verification_status: row.verification_status,
        status: row.status,
        deadline_date: dp.deadline_date,
        last_verified: row.last_verified,
      };
      const gate = isDisplayable(gateInput, todayBkk);

      const payload = {
        scholarship_id:      row.scholarship_id,
        scholarship_name:    row.scholarship_name,
        funder:              row.funder,
        funder_type:         row.funder_type,
        level:               row.level,
        field_of_study:      row.field_of_study,
        award_amount_thb:    row.award_amount_thb,
        region_eligibility:  row.region_eligibility,
        targets_low_income:  row.targets_low_income,
        num_recipients:      row.num_recipients,
        min_gpa:             row.min_gpa,
        income_cap_thb:      row.income_cap_thb,
        language:            row.language,
        deadline_raw:        dp.deadline_note || null,
        status:              row.status,
        application_link:    row.application_link!,
        source:              row.source,
        verification_status: row.verification_status,
        last_verified:       row.last_verified,
        notes:               row.notes,
        // Derived
        deadline_date:       dp.deadline_date,
        deadline_is_rolling: dp.deadline_is_rolling,
        deadline_note:       dp.deadline_note || null,
        is_displayed:        gate.is_displayed,
        display_reason:      gate.display_reason,
        stale:               gate.stale,
        updated_at:          new Date().toISOString(),
      };

      // Check if row exists to count correctly
      const { data: existing } = await adminClient
        .from('td_scholarships')
        .select('scholarship_id')
        .eq('scholarship_id', row.scholarship_id)
        .maybeSingle();

      const isNew = !existing;

      const { error } = await adminClient
        .from('td_scholarships')
        .upsert(payload, { onConflict: 'scholarship_id' });

      if (error) {
        errors.push(`Row ${row.rowNum} (${row.scholarship_id}): ${fmtErr(error)}`);
      } else if (isNew) {
        inserted++;
      } else {
        updated++;
      }
    }

    console.log('[td-import] inserted:', inserted, 'updated:', updated, 'skipped:', skipped, 'errors:', errors.length);
    return NextResponse.json({ inserted, updated, skipped, errors });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[td-import] Unhandled error:', err);
    return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, errors: [`Server error: ${msg}`] }, { status: 500 });
  }
}
