import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { fetchAllRows } from '@/lib/supabase/fetchAll';

/** Exactly the columns the status recompute reads. */
interface TdStatusRow {
  scholarship_id:   string;
  open_date:        string | null;
  deadline_date:    string | null;
  status:           string | null;
  status_effective: string | null;
  last_verified:    string | null;
  is_displayed:     boolean | null;
  stale:            boolean | null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron job: runs daily at 18:00 UTC (01:00 Thailand time, UTC+7).
 *
 * 1. Marks legacy scholarships with a past deadline as is_active = false.
 * 2. Recomputes status_effective / is_displayed / display_reason / stale for every
 *    td_scholarships row (Status-only gate — see lib/tdScholarships/displayGate.ts)
 *    so scholarships transition Opening Soon → Open → Closing Soon → Closed and
 *    staleness updates without a re-import.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date().toISOString().split('T')[0];
  const todayBkk = bangkokMidnight();

  // ── 1. Legacy scholarships table ─────────────────────────────────────────
  const { data: legacyHidden, error: legacyErr } = await adminClient
    .from('scholarships')
    .update({ is_active: false })
    .lt('deadline_date', today)
    .eq('is_active', true)
    .select('name_th, deadline_date');

  if (legacyErr) {
    console.error('[CRON] Error hiding legacy expired scholarships:', legacyErr.message);
  }
  const legacyCount = legacyHidden?.length ?? 0;

  // ── 2. td_scholarships: recompute status_effective + display gate ────────
  // This is what lets a scholarship auto-transition (Opening Soon → Open →
  // Closing Soon → Closed) day to day with no re-upload and no code change.
  // Paginated: this reads the whole table, which passed 1000 rows some time ago.
  // Unpaginated it was recomputing 1000 of 1575 scholarships and reporting
  // success, so 575 kept whatever status they last had — deadlines passing
  // without the display gate ever noticing.
  const { data: allRows, error: fetchErr } = await fetchAllRows<TdStatusRow>((from, to) =>
    adminClient
      .from('td_scholarships')
      .select('scholarship_id, open_date, deadline_date, status, status_effective, last_verified, is_displayed, stale')
      .order('scholarship_id')
      .range(from, to));

  if (fetchErr) {
    console.error('[CRON] Error fetching td_scholarships:', fetchErr.message);
    return Response.json({
      ok: false,
      error: fetchErr.message,
      legacy_hidden: legacyCount,
    }, { status: 500 });
  }

  let tdChanged = 0;
  const tdErrors: string[] = [];

  for (const row of (allRows ?? []) as Pick<TdScholarship, 'scholarship_id' | 'open_date' | 'deadline_date' | 'status' | 'status_effective' | 'last_verified' | 'is_displayed' | 'stale'>[]) {
    const gate = isDisplayable(row, todayBkk);

    // Skip rows where nothing changed (avoid unnecessary writes)
    if (gate.is_displayed === row.is_displayed && gate.stale === row.stale && gate.status_effective === row.status_effective) continue;

    const { error } = await adminClient
      .from('td_scholarships')
      .update({
        status_effective: gate.status_effective || null,
        is_displayed:      gate.is_displayed,
        display_reason:    gate.display_reason,
        stale:             gate.stale,
        updated_at:        new Date().toISOString(),
      })
      .eq('scholarship_id', row.scholarship_id);

    if (error) {
      tdErrors.push(`${row.scholarship_id}: ${error.message}`);
    } else {
      tdChanged++;
    }
  }

  console.log(`[CRON] Done — legacy hidden: ${legacyCount}, td_scholarships updated: ${tdChanged}`);

  return Response.json({
    ok: true,
    legacy_hidden: legacyCount,
    td_updated: tdChanged,
    td_errors: tdErrors,
    ran_at: new Date().toISOString(),
  });
}
