/**
 * POST /api/cron/line-reminders
 * Vercel Cron — runs daily at 01:00 UTC (08:00 Asia/Bangkok).
 * Sends LINE push reminders at 14 days and 1 day before a tracked deadline.
 *
 * Required env vars:
 *   CRON_SECRET
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   REMINDER_OFFSETS  (optional, default "14,1")
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import { linePush } from '@/lib/line/push';
import { parseOffsets, shouldSendReminder, buildReminderText } from '@/lib/line/reminders';

function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const db       = makeDb();
  const todayBkk = bangkokMidnight();
  const todayStr = todayBkk.toISOString().slice(0, 10);
  const offsets  = parseOffsets(process.env.REMINDER_OFFSETS);

  // Load all potentially eligible tracked rows in one query
  // Join: tracked_scholarship → profiles (line_user_id) → td_scholarships (deadline_date + link)
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
        deadline_date,
        application_link
      )
    `)
    .in('status', ['interested', 'applying'])
    .eq('reminder_opt_in', true);

  if (fetchErr) {
    console.error('[line-reminders] fetch error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Load existing reminder_log entries for today's targets (idempotency)
  const { data: sentLog } = await db
    .from('reminder_log')
    .select('user_id, scholarship_id, offset_days, deadline_date')
    .eq('channel', 'line');

  const sentSet = new Set<string>(
    (sentLog ?? []).map(
      (r: { user_id: string; scholarship_id: string; offset_days: number; deadline_date: string }) =>
        `${r.user_id}|${r.scholarship_id}|${r.offset_days}|${r.deadline_date}`,
    ),
  );

  const results = { sent: 0, skipped: 0, errors: 0, offsets: {} as Record<number, number> };

  for (const row of rows ?? []) {
    const profile    = row.profiles as unknown as { line_user_id: string | null } | null;
    const scholarship = row.td_scholarships as unknown as {
      scholarship_name: string;
      deadline_date: string | null;
      application_link: string;
    } | null;

    for (const offsetDays of offsets) {
      const sentKey = `${row.user_id}|${row.scholarship_id}|${offsetDays}|${scholarship?.deadline_date ?? ''}`;
      const { send, reason } = shouldSendReminder({
        deadlineDate:  scholarship?.deadline_date ?? null,
        todayStr,
        offsetDays,
        reminderOptIn: row.reminder_opt_in as boolean,
        lineUserId:    profile?.line_user_id,
        status:        row.status as string,
        alreadySent:   sentSet.has(sentKey),
      });

      if (!send) { results.skipped++; continue; }

      const text = buildReminderText(
        scholarship!.scholarship_name,
        scholarship!.deadline_date!,
        scholarship!.application_link,
        offsetDays,
        'th',
      );

      try {
        await linePush(profile!.line_user_id!, [{ type: 'text', text }]);

        await db.from('reminder_log').insert({
          user_id:       row.user_id,
          scholarship_id: row.scholarship_id,
          offset_days:   offsetDays,
          deadline_date: scholarship!.deadline_date,
          channel:       'line',
        });

        sentSet.add(sentKey); // prevent double-send within this run
        results.sent++;
        results.offsets[offsetDays] = (results.offsets[offsetDays] ?? 0) + 1;

        console.log(`[line-reminders] sent offset=${offsetDays} user=${row.user_id} scholarship=${row.scholarship_id}`);
      } catch (err) {
        console.error(`[line-reminders] push failed user=${row.user_id}:`, err);
        results.errors++;
      }
    }
  }

  console.log('[line-reminders] done', { today: todayStr, ...results });
  return NextResponse.json({ ok: true, today: todayStr, ...results });
}
