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

    // Separate skipped rows
    const toUpsert = rows.filter(r => r.action !== 'skip');
    const skipped  = rows.length - toUpsert.length;
    const errors: string[] = [];

    if (toUpsert.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, skipped, errors: [] });
    }

    // One query to find which IDs already exist (to count inserts vs updates)
    const ids = toUpsert.map(r => r.scholarship_id);
    const { data: existingRows } = await adminClient
      .from('td_scholarships')
      .select('scholarship_id')
      .in('scholarship_id', ids);

    const existingIds = new Set(
      (existingRows ?? []).map((r: { scholarship_id: string }) => r.scholarship_id),
    );

    // Build all payloads (per-row errors go to errors[], not a 500)
    const payloads: Record<string, unknown>[] = [];
    for (const row of toUpsert) {
      try {
        const dp = parseDeadline(row.deadline_raw ?? null);
        const gate = isDisplayable(
          {
            verification_status: row.verification_status,
            status:              row.status,
            deadline_date:       dp.deadline_date,
            last_verified:       row.last_verified,
          },
          todayBkk,
        );

        payloads.push({
          scholarship_id:      row.scholarship_id,
          scholarship_name:    row.scholarship_name,
          funder:              row.funder,
          funder_type:         row.funder_type ?? null,
          level:               row.level ?? null,
          field_of_study:      row.field_of_study ?? null,
          award_amount_thb:    row.award_amount_thb ?? null,
          region_eligibility:  row.region_eligibility ?? null,
          targets_low_income:  row.targets_low_income ?? null,
          num_recipients:      row.num_recipients ?? null,
          min_gpa:             row.min_gpa ?? null,
          income_cap_thb:      row.income_cap_thb ?? null,
          language:            row.language ?? null,
          deadline_raw:        row.deadline_raw ?? null,
          status:              row.status ?? null,
          application_link:    row.application_link ?? '',
          source:              row.source ?? null,
          verification_status: row.verification_status ?? null,
          last_verified:       row.last_verified ?? null,
          notes:               row.notes ?? null,
          deadline_date:       dp.deadline_date,
          deadline_is_rolling: dp.deadline_is_rolling,
          deadline_note:       dp.deadline_note || null,
          is_displayed:        gate.is_displayed,
          display_reason:      gate.display_reason,
          stale:               gate.stale,
          updated_at:          new Date().toISOString(),
        });
      } catch (err) {
        errors.push(`Row ${row.rowNum} (${row.scholarship_id}): ${fmtErr(err)}`);
      }
    }

    // Single bulk upsert — one round trip for all rows
    if (payloads.length > 0) {
      const { error } = await adminClient
        .from('td_scholarships')
        .upsert(payloads, { onConflict: 'scholarship_id' });

      if (error) {
        console.error('[td-import] bulk upsert error:', error);
        errors.push(`Bulk upsert error: ${fmtErr(error)}`);
        return NextResponse.json({ inserted: 0, updated: 0, skipped, errors }, { status: 500 });
      }
    }

    // Count inserts vs updates based on the pre-fetch
    let inserted = 0;
    let updated  = 0;
    for (const p of payloads) {
      if (existingIds.has(p.scholarship_id as string)) {
        updated++;
      } else {
        inserted++;
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
