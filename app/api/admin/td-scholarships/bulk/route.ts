/**
 * PATCH /api/admin/td-scholarships/bulk
 *
 * Bulk-update verification state or status on a set of td_scholarships rows.
 * Re-computes is_displayed for each row and writes an audit log entry.
 *
 * Body: { ids: string[], action: 'verify' | 'unverify' | 'set_status', status?: 'Open' | 'Closed' | 'Recheck' }
 * Response: { updated: number, displayedNow: number }
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function resolveAdminEmail(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.user.email ?? null;
  } catch { return null; }
}

export async function PATCH(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const email = await resolveAdminEmail();
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!email || !adminEmail || email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ids: string[]; action: string; status?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { ids, action, status } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  if (!['verify', 'unverify', 'set_status'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'set_status' && !['Open', 'Closed', 'Recheck'].includes(status ?? '')) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const db = makeAdminClient();
  const todayBkk = bangkokMidnight();

  const { data: rows, error: fetchErr } = await db
    .from('td_scholarships')
    .select('*')
    .in('scholarship_id', ids);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: 'No rows found' }, { status: 404 });

  const unverifiedStatus = 'Auto-extracted (confirm deadline + link)';
  const auditEntries: object[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const row of rows) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const update: Record<string, unknown> = {
      scholarship_id: row.scholarship_id,
      updated_at: new Date().toISOString(),
    };

    if (action === 'verify') {
      if (row.verification_status !== 'verified') changes.verification_status = { from: row.verification_status, to: 'verified' };
      if (row.last_verified !== todayBkk) changes.last_verified = { from: row.last_verified, to: todayBkk };
      if (row.verified_by !== email) changes.verified_by = { from: row.verified_by, to: email };
      update.verification_status = 'verified';
      update.last_verified = todayBkk;
      update.verified_by = email;
    } else if (action === 'unverify') {
      if (row.verification_status !== unverifiedStatus) changes.verification_status = { from: row.verification_status, to: unverifiedStatus };
      if (row.verified_by !== null) changes.verified_by = { from: row.verified_by, to: null };
      update.verification_status = unverifiedStatus;
      update.verified_by = null;
    } else if (action === 'set_status') {
      if (row.status !== status) changes.status = { from: row.status, to: status };
      update.status = status;
    }

    // Recompute display gate with the new field values
    const gate = isDisplayable(
      {
        verification_status: (update.verification_status ?? row.verification_status) as string,
        status:              (update.status ?? row.status) as string,
        deadline_date:       row.deadline_date as string | null,
        last_verified:       (update.last_verified ?? row.last_verified) as string | null,
      },
      todayBkk,
    );
    if (gate.is_displayed !== row.is_displayed) changes.is_displayed = { from: row.is_displayed, to: gate.is_displayed };
    update.is_displayed   = gate.is_displayed;
    update.display_reason = gate.display_reason;
    update.stale          = gate.stale;

    updates.push(update);
    if (Object.keys(changes).length > 0) {
      auditEntries.push({ scholarship_id: row.scholarship_id, changed_by: email, action, changes });
    }
  }

  const { error: upsertErr } = await db
    .from('td_scholarships')
    .upsert(updates, { onConflict: 'scholarship_id' });

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  if (auditEntries.length > 0) {
    await db.from('td_audit_log').insert(auditEntries);
  }

  const displayedNow = updates.filter(u => u.is_displayed).length;
  return NextResponse.json({ updated: rows.length, displayedNow });
}
