/**
 * GET|POST /api/cron/line-outcomes
 * Vercel Cron — runs daily at 01:00 UTC (08:00 Asia/Bangkok).
 * Asks students (via LINE quick-reply) whether they were awarded a
 * scholarship they tracked, at OUTCOME_OFFSETS days after its deadline.
 *
 * Vercel Cron Jobs invoke the path with a GET request (auto-attaching
 * `Authorization: Bearer $CRON_SECRET`); POST is also supported for manual
 * triggering/testing.
 *
 * Required env vars:
 *   CRON_SECRET
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   OUTCOME_OFFSETS  (optional, default "30,60,90")
 *   OUTCOME_FOLLOWUP_INCENTIVE_NOTE (optional, appended to the message)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import { linePush } from '@/lib/line/push';
import { parseOutcomeOffsets, shouldSendOutcomeFollowup, buildOutcomeFollowupMessage } from '@/lib/line/outcomes';

function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function handleOutcomes(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const db       = makeDb();
  const todayBkk = bangkokMidnight();
  const todayStr = todayBkk.toISOString().slice(0, 10);
  const offsets  = parseOutcomeOffsets(process.env.OUTCOME_OFFSETS);
  const incentiveNote = process.env.OUTCOME_FOLLOWUP_INCENTIVE_NOTE || undefined;

  // Load all potentially eligible tracked rows in one query.
  // Join: tracked_scholarship → profiles (line_user_id) → td_scholarships (deadline_date)
  const { data: rows, error: fetchErr } = await db
    .from('tracked_scholarship')
    .select(`
      id,
      user_id,
      scholarship_id,
      status,
      reminder_opt_in,
      profiles!user_id ( line_user_id ),
      td_scholarships!scholarship_id (
        scholarship_name,
        deadline_date
      )
    `)
    .in('status', ['applying', 'applied'])
    .eq('reminder_opt_in', true);

  if (fetchErr) {
    console.error('[line-outcomes] fetch error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Load existing outcome_followup_log entries (idempotency)
  const { data: sentLog } = await db
    .from('outcome_followup_log')
    .select('user_id, scholarship_id, attempt_no');

  const sentSet = new Set<string>(
    (sentLog ?? []).map(
      (r: { user_id: string; scholarship_id: string; attempt_no: number }) =>
        `${r.user_id}|${r.scholarship_id}|${r.attempt_no}`,
    ),
  );

  const results = { sent: 0, skipped: 0, errors: 0, attempts: {} as Record<number, number> };

  for (const row of rows ?? []) {
    const profile     = row.profiles as unknown as { line_user_id: string | null } | null;
    const scholarship = row.td_scholarships as unknown as {
      scholarship_name: string;
      deadline_date: string | null;
    } | null;

    for (let i = 0; i < offsets.length; i++) {
      const offsetDays = offsets[i];
      const attemptNo  = i + 1;
      const sentKey    = `${row.user_id}|${row.scholarship_id}|${attemptNo}`;

      const { send } = shouldSendOutcomeFollowup({
        deadlineDate:  scholarship?.deadline_date ?? null,
        todayStr,
        offsetDays,
        attemptNo,
        reminderOptIn: row.reminder_opt_in as boolean,
        lineUserId:    profile?.line_user_id,
        status:        row.status as string,
        alreadySent:   sentSet.has(sentKey),
      });

      if (!send) { results.skipped++; continue; }

      const message = buildOutcomeFollowupMessage(
        scholarship!.scholarship_name,
        row.scholarship_id as string,
        'th',
        incentiveNote,
      );

      try {
        await linePush(profile!.line_user_id!, [message]);

        await db.from('outcome_followup_log').insert({
          user_id:        row.user_id,
          scholarship_id: row.scholarship_id,
          attempt_no:     attemptNo,
          deadline_date:  scholarship!.deadline_date,
        });

        sentSet.add(sentKey); // prevent double-send within this run
        results.sent++;
        results.attempts[attemptNo] = (results.attempts[attemptNo] ?? 0) + 1;

        console.log(`[line-outcomes] sent attempt=${attemptNo} user=${row.user_id} scholarship=${row.scholarship_id}`);
      } catch (err) {
        console.error(`[line-outcomes] push failed user=${row.user_id}:`, err);
        results.errors++;
      }
    }
  }

  console.log('[line-outcomes] done', { today: todayStr, ...results });
  return NextResponse.json({ ok: true, today: todayStr, ...results });
}

export async function GET(request: NextRequest) {
  return handleOutcomes(request);
}

export async function POST(request: NextRequest) {
  return handleOutcomes(request);
}
