/**
 * POST /api/admin/td-import
 *
 * Accepts pre-parsed rows from the client-side TdImport engine (28-field schema),
 * upserts them into td_scholarships (by scholarship_id), computes the display
 * gate for every upserted row, and returns an import report.
 *
 * Protection: if the existing DB row has verification_status = "verified" and
 * the incoming row does not, we preserve the DB's deadline/status/name/funder/
 * verification fields and only update the other descriptive columns.
 *
 * Body:    { rows: TdImportRow[] }
 * Response: { inserted, updated, skipped, protected, errors }
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
    } catch { /* ignore */ }
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
      return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, protected: 0, errors: [] });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const todayBkk = bangkokMidnight();
    const toUpsert  = rows.filter(r => r.action !== 'skip');
    const skipped   = rows.length - toUpsert.length;
    const errors: string[] = [];

    if (toUpsert.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, skipped, protected: 0, errors: [] });
    }

    type ExistingRow = {
      scholarship_id:       string;
      verification_status:  string | null;
      last_verified:        string | null;
      verified_by:          string | null;
      deadline_raw:         string | null;
      deadline_date:        string | null;
      deadline_is_rolling:  boolean;
      deadline_note:        string | null;
      status:               string | null;
      application_url:      string | null;
      application_link:     string | null;
      scholarship_name_en:  string | null;
      scholarship_name_th:  string | null;
      funder_en:            string | null;
      funder_th:            string | null;
    };

    // Fetch existing rows for insert-vs-update counts and verified-row protection.
    const ids = toUpsert.map(r => r.scholarship_id);
    const { data: rawExistingRows } = await adminClient
      .from('td_scholarships')
      .select('scholarship_id, verification_status, last_verified, verified_by, deadline_raw, deadline_date, deadline_is_rolling, deadline_note, status, application_url, application_link, scholarship_name_en, scholarship_name_th, funder_en, funder_th')
      .in('scholarship_id', ids);
    const existingRows = (rawExistingRows ?? []) as unknown as ExistingRow[];

    const existingIds = new Set(existingRows.map(r => r.scholarship_id));
    const verifiedDbRows = new Map<string, ExistingRow>();
    for (const r of existingRows) {
      if ((r.verification_status ?? '').toLowerCase() === 'verified') {
        verifiedDbRows.set(r.scholarship_id, r);
      }
    }

    const payloads: Record<string, unknown>[] = [];
    let protectedCount = 0;

    for (const row of toUpsert) {
      try {
        const dbRow = verifiedDbRows.get(row.scholarship_id);
        const incomingIsVerified = (row.verification_status ?? '').toLowerCase() === 'verified';
        const isProtected = !!dbRow && !incomingIsVerified;
        if (isProtected) protectedCount++;

        // For protected rows, keep DB's critical admin-edited fields
        const effectiveDeadlineRaw = isProtected ? (dbRow!.deadline_raw ?? row.deadline_raw) : row.deadline_raw;
        const dp = isProtected
          ? {
              deadline_date:       dbRow!.deadline_date,
              deadline_is_rolling: dbRow!.deadline_is_rolling,
              deadline_note:       dbRow!.deadline_note ?? '',
            }
          : parseDeadline(row.deadline_raw ?? null);

        const effectiveVerificationStatus = isProtected ? 'verified' : (row.verification_status ?? null);
        const effectiveLastVerified       = isProtected ? dbRow!.last_verified : (row.last_verified ?? null);
        const effectiveVerifiedBy         = isProtected ? dbRow!.verified_by : null;
        const effectiveStatus             = isProtected ? (dbRow!.status ?? row.status) : row.status;

        // For protected rows, preserve existing name/funder
        const effectiveNameEn  = isProtected ? (dbRow!.scholarship_name_en ?? row.scholarship_name_en) : row.scholarship_name_en;
        const effectiveNameTh  = isProtected ? (dbRow!.scholarship_name_th ?? row.scholarship_name_th) : row.scholarship_name_th;
        const effectiveFunderEn = isProtected ? (dbRow!.funder_en ?? row.funder_en) : row.funder_en;
        const effectiveFunderTh = isProtected ? (dbRow!.funder_th ?? row.funder_th) : row.funder_th;

        // Canonical URL — prefer incoming (it's the sheet source of truth), but fall back to DB
        const effectiveAppUrl = row.application_url
          ?? (isProtected ? (dbRow!.application_url ?? dbRow!.application_link) : null)
          ?? null;

        const gate = isDisplayable(
          {
            verification_status: effectiveVerificationStatus,
            status:              effectiveStatus,
            deadline_date:       dp.deadline_date,
            last_verified:       effectiveLastVerified,
          },
          todayBkk,
        );

        payloads.push({
          scholarship_id:           row.scholarship_id,

          // Bilingual identity (canonical)
          scholarship_name_en:      effectiveNameEn ?? null,
          scholarship_name_th:      effectiveNameTh ?? null,
          funder_en:                effectiveFunderEn ?? null,
          funder_th:                effectiveFunderTh ?? null,
          source_language:          row.source_language ?? null,

          // Legacy single-language columns (back-filled for existing code that reads them)
          scholarship_name:         effectiveNameEn ?? effectiveNameTh ?? row.scholarship_name ?? null,
          funder:                   effectiveFunderEn ?? effectiveFunderTh ?? row.funder ?? null,

          funder_type:              row.funder_type ?? null,
          level:                    row.level ?? null,
          field_of_study:           row.field_of_study ?? null,

          // Award
          award_value_tier:         row.award_value_tier ?? null,
          award_amount_thb_numeric: row.award_amount_thb_numeric ?? null,
          award_type:               row.award_type ?? null,
          award_amount_thb:         row.award_amount_thb ?? null,

          // Eligibility
          renewable:                row.renewable ?? null,
          bond_obligation:          row.bond_obligation ?? null,
          region_eligibility:       row.region_eligibility ?? null,
          targets_low_income:       row.targets_low_income ?? false,
          welfare_card_priority:    row.welfare_card_priority ?? null,
          income_cap_thb:           row.income_cap_thb ?? null,
          num_recipients:           row.num_recipients ?? null,
          min_gpa:                  row.min_gpa ?? null,
          english_requirement:      row.english_requirement ?? null,

          // Deadline
          deadline_raw:             effectiveDeadlineRaw ?? null,
          deadline_date:            dp.deadline_date,
          deadline_is_rolling:      dp.deadline_is_rolling,
          deadline_note:            dp.deadline_note || null,

          // Status & verification
          status:                   effectiveStatus ?? null,
          verification_status:      effectiveVerificationStatus,
          last_verified:            effectiveLastVerified,
          verified_by:              effectiveVerifiedBy,

          // URLs
          application_url:          effectiveAppUrl,
          source_url:               row.source_url ?? null,
          application_link:         effectiveAppUrl ?? '',  // legacy compat
          source:                   row.source_url ?? null, // legacy compat

          notes:                    row.notes ?? null,

          // Display gate (computed)
          is_displayed:             gate.is_displayed,
          display_reason:           gate.display_reason,
          stale:                    gate.stale,

          updated_at:               new Date().toISOString(),
        });
      } catch (err) {
        errors.push(`Row ${row.rowNum} (${row.scholarship_id}): ${fmtErr(err)}`);
      }
    }

    if (payloads.length > 0) {
      const { error } = await adminClient
        .from('td_scholarships')
        .upsert(payloads, { onConflict: 'scholarship_id' });

      if (error) {
        console.error('[td-import] bulk upsert error:', error);
        errors.push(`Bulk upsert error: ${fmtErr(error)}`);
        return NextResponse.json({ inserted: 0, updated: 0, skipped, protected: 0, errors }, { status: 500 });
      }
    }

    let inserted = 0;
    let updated  = 0;
    for (const p of payloads) {
      if (existingIds.has(p.scholarship_id as string)) updated++;
      else inserted++;
    }

    console.log(
      '[td-import] inserted:', inserted, 'updated:', updated,
      'skipped:', skipped, 'protected:', protectedCount, 'errors:', errors.length,
    );
    return NextResponse.json({ inserted, updated, skipped, protected: protectedCount, errors });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[td-import] Unhandled error:', err);
    return NextResponse.json({ inserted: 0, updated: 0, skipped: 0, protected: 0, errors: [`Server error: ${msg}`] }, { status: 500 });
  }
}
