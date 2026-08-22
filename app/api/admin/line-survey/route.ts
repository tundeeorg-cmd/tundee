/**
 * POST /api/admin/line-survey
 * Admin: manually send the LINE outcome survey to one student for one
 * scholarship. Backs the "ส่งแบบสอบถาม" button in /admin → Outcomes.
 *
 * Body: { user_id, scholarship_id, force?: boolean }
 *   force = true bypasses the 30-day duplicate guard and any open
 *   conversation (the previous one is marked 'skipped').
 *
 * Required env vars: SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN,
 * plus NEXT_PUBLIC_ADMIN_EMAIL or ADMIN_EMAILS.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import {
  sendOutcomeSurvey,
  shouldSendSurvey,
  OPEN_SURVEY_STATES,
} from '@/lib/line/survey';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { user_id, scholarship_id, force } = body as {
    user_id?: string; scholarship_id?: string; force?: boolean;
  };

  if (!user_id)        return NextResponse.json({ error: 'user_id required' }, { status: 422 });
  if (!scholarship_id) return NextResponse.json({ error: 'scholarship_id required' }, { status: 422 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // The student must have a linked LINE account to receive a push.
  const { data: profile, error: profErr } = await db
    .from('profiles').select('id, line_user_id').eq('id', user_id).maybeSingle();

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: 'No such user' }, { status: 404 });

  const lineUserId = (profile as { line_user_id: string | null }).line_user_id;

  const { data: sch, error: schErr } = await db
    .from('td_scholarships').select('scholarship_name')
    .eq('scholarship_id', scholarship_id).maybeSingle();

  if (schErr) return NextResponse.json({ error: schErr.message }, { status: 500 });
  if (!sch)   return NextResponse.json({ error: 'No such scholarship' }, { status: 404 });

  // Most recent send + whether a conversation is still open, for the guard.
  const { data: logRows } = await db
    .from('survey_log')
    .select('sent_at, state')
    .eq('user_id', user_id)
    .eq('scholarship_id', scholarship_id)
    .order('sent_at', { ascending: false })
    .limit(20);

  const rows = (logRows ?? []) as unknown as { sent_at: string; state: string }[];
  const lastSentAt = rows.length ? rows[0].sent_at : null;
  const hasOpenSurvey = rows.some(r => (OPEN_SURVEY_STATES as string[]).includes(r.state));

  const { send, reason } = shouldSendSurvey({
    lineUserId,
    reminderOptIn:   true,
    status:          'applied',
    deadlineDate:    bangkokMidnight().toISOString().slice(0, 10),
    todayStr:        bangkokMidnight().toISOString().slice(0, 10),
    offsetDays:      0,
    lastSentAt,
    sentToUserToday: 0,
    maxPerUserPerDay: Number.MAX_SAFE_INTEGER,
    hasOpenSurvey,
    force:           force === true,
  });

  if (!send) return NextResponse.json({ sent: false, reason }, { status: 409 });

  try {
    const res = await sendOutcomeSurvey(
      lineUserId!,
      {
        user_id,
        scholarship_id,
        scholarship_name: (sch as { scholarship_name: string | null }).scholarship_name,
      },
      db,
      { triggerSource: 'admin' },
    );

    if (!res.ok) return NextResponse.json({ sent: false, reason: res.reason }, { status: 500 });

    console.log(`[admin/line-survey] ${admin} sent survey user=${user_id} scholarship=${scholarship_id}`);
    return NextResponse.json({ sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/line-survey] push failed:', message);
    return NextResponse.json({ sent: false, error: message }, { status: 502 });
  }
}
