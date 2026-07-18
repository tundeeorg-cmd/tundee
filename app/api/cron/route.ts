import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import type { TdScholarship } from '@/lib/tdScholarships/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron job: runs daily at 18:00 UTC (01:00 Thailand time, UTC+7).
 *
 * 1. Marks legacy scholarships with a past deadline as is_active = false.
 * 2. Recomputes is_displayed / display_reason / stale for every td_scholarships row
 *    so that past-deadline rows auto-expire and staleness updates without a re-import.
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

  // ── 2. td_scholarships: recompute display gate for every row ─────────────
  const { data: allRows, error: fetchErr } = await adminClient
    .from('td_scholarships')
    .select('scholarship_id, verification_status, status, deadline_date, last_verified, is_displayed, stale');

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

  for (const row of (allRows ?? []) as Pick<TdScholarship, 'scholarship_id' | 'verification_status' | 'status' | 'deadline_date' | 'last_verified' | 'is_displayed' | 'stale'>[]) {
    const gate = isDisplayable(row, todayBkk);

    // Skip rows where nothing changed (avoid unnecessary writes)
    if (gate.is_displayed === row.is_displayed && gate.stale === row.stale) continue;

    const { error } = await adminClient
      .from('td_scholarships')
      .update({
        is_displayed:   gate.is_displayed,
        display_reason: gate.display_reason,
        stale:          gate.stale,
        updated_at:     new Date().toISOString(),
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
