/**
 * PATCH /api/admin/td-scholarships/[id]
 *
 * Inline-edit a single td_scholarships row.
 * Editable fields: deadline_raw, status, application_link, verification_status, notes.
 * Deadline re-parse and is_displayed recompute happen automatically.
 * Writes an audit log entry.
 *
 * Response: { scholarship: TdScholarship }
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { parseDeadline } from '@/lib/tdScholarships/deadlineParser';
import { isDisplayable, bangkokMidnight } from '@/lib/tdScholarships/displayGate';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let email: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getSession();
    email = data.session?.user.email ?? null;
  } catch { /* ignore */ }

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!email || !adminEmail || email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: existing, error: fetchErr } = await db
    .from('td_scholarships')
    .select('*')
    .eq('scholarship_id', id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Simple string fields
  for (const field of ['status', 'application_link', 'verification_status', 'notes'] as const) {
    if (field in body && body[field] !== existing[field]) {
      changes[field] = { from: existing[field], to: body[field] };
      update[field] = body[field];
    }
  }

  // Deadline: re-parse when deadline_raw changes
  if ('deadline_raw' in body && body.deadline_raw !== existing.deadline_raw) {
    const dp = parseDeadline(body.deadline_raw as string | null);
    changes.deadline_raw = { from: existing.deadline_raw, to: body.deadline_raw };
    update.deadline_raw        = body.deadline_raw;
    update.deadline_date       = dp.deadline_date;
    update.deadline_is_rolling = dp.deadline_is_rolling;
    update.deadline_note       = dp.deadline_note || null;
    if (dp.deadline_date !== existing.deadline_date) {
      changes.deadline_date = { from: existing.deadline_date, to: dp.deadline_date };
    }
  }

  // Recompute display gate
  const gate = isDisplayable(
    {
      verification_status: (update.verification_status ?? existing.verification_status) as string,
      status:              (update.status ?? existing.status) as string,
      deadline_date:       (update.deadline_date !== undefined ? update.deadline_date : existing.deadline_date) as string | null,
      last_verified:       existing.last_verified as string | null,
    },
    bangkokMidnight(),
  );
  if (gate.is_displayed !== existing.is_displayed) {
    changes.is_displayed = { from: existing.is_displayed, to: gate.is_displayed };
  }
  update.is_displayed   = gate.is_displayed;
  update.display_reason = gate.display_reason;
  update.stale          = gate.stale;

  const { error: updateErr } = await db
    .from('td_scholarships')
    .update(update)
    .eq('scholarship_id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (Object.keys(changes).length > 0) {
    await db.from('td_audit_log').insert({
      scholarship_id: id,
      changed_by: email,
      action: 'inline_edit',
      changes,
    });
  }

  const { data: updated } = await db
    .from('td_scholarships')
    .select('*')
    .eq('scholarship_id', id)
    .single();

  return NextResponse.json({ scholarship: updated });
}
