/**
 * GET|POST /api/cron/line-reminders
 * Vercel Cron — runs daily at 01:00 UTC (08:00 Asia/Bangkok).
 * Sends LINE push reminders at 14 days and 1 day before a tracked deadline.
 *
 * Vercel Cron Jobs invoke the path with a GET request (auto-attaching
 * `Authorization: Bearer $CRON_SECRET`); POST is also supported for manual
 * triggering/testing.
 *
 * Required env vars:
 *   CRON_SECRET
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   REMINDER_OFFSETS       (optional, default "14,1")
 *   REMINDER_CATCHUP_DAYS  (optional, default 3; 0 = exact-date match only)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import { linePush } from '@/lib/line/push';
import {
  addDays, parseOffsets, parseCatchupDays, offsetWindows,
  shouldSendReminder, buildReminderText,
} from '@/lib/line/reminders';

function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function handleReminders(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
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
  // A run missed for any reason used to drop that day's reminders permanently — the rule
  // was an exact date match and nothing looked back. Each offset now stays eligible for a
  // few days past its target, clamped so two offsets can never fire for the same row on
  // the same morning.
  const catchup  = parseCatchupDays(process.env.REMINDER_CATCHUP_DAYS);
  const windows  = offsetWindows(offsets, catchup);

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

  // Load existing reminder_log entries for today's targets (idempotency).
  //
  // Scoped to every deadline date an offset could fire on today — the whole window, not
  // just its top edge. The table was previously loaded unfiltered, and PostgREST caps an
  // unbounded select at 1000 rows, so once the log passed 1000 entries the dedup set
  // would have been silently short and students would have received the same reminder
  // twice. Scoping also keeps the query small permanently, which paging would not.
  const targetDeadlines = Array.from(new Set(
    offsets.flatMap(offsetDays => {
      const lowerBound = windows.get(offsetDays) ?? offsetDays;
      const dates: string[] = [];
      for (let d = lowerBound; d <= offsetDays; d++) dates.push(addDays(todayStr, d));
      return dates;
    }),
  ));

  const { data: sentLog, error: logErr } = await db
    .from('reminder_log')
    .select('user_id, scholarship_id, offset_days, deadline_date')
    .eq('channel', 'line')
    .in('deadline_date', targetDeadlines);

  // Abort rather than send. An unread log is indistinguishable from an empty one, and
  // proceeding would treat every eligible reminder as never-sent and push the lot again.
  // A missed run costs one day of reminders; a duplicate storm costs trust.
  if (logErr) {
    console.error('[line-reminders] reminder_log fetch failed, sending nothing:', logErr);
    return NextResponse.json({ error: `reminder_log unreadable: ${logErr.message}` }, { status: 500 });
  }

  const sentSet = new Set<string>(
    (sentLog ?? []).map(
      (r: { user_id: string; scholarship_id: string; offset_days: number; deadline_date: string }) =>
        `${r.user_id}|${r.scholarship_id}|${r.offset_days}|${r.deadline_date}`,
    ),
  );

  const results = {
    sent: 0, skipped: 0, errors: 0, catchUp: 0,
    offsets: {} as Record<number, number>,
  };

  for (const row of rows ?? []) {
    const profile    = row.profiles as unknown as { line_user_id: string | null } | null;
    const scholarship = row.td_scholarships as unknown as {
      scholarship_name: string;
      deadline_date: string | null;
      application_link: string;
    } | null;

    for (const offsetDays of offsets) {
      const sentKey = `${row.user_id}|${row.scholarship_id}|${offsetDays}|${scholarship?.deadline_date ?? ''}`;
      const { send, reason, daysRemaining } = shouldSendReminder({
        deadlineDate:  scholarship?.deadline_date ?? null,
        todayStr,
        offsetDays,
        reminderOptIn: row.reminder_opt_in as boolean,
        lineUserId:    profile?.line_user_id,
        status:        row.status as string,
        alreadySent:   sentSet.has(sentKey),
        lowerBound:    windows.get(offsetDays),
      });

      if (!send) { results.skipped++; continue; }
      if (reason === 'catch-up') results.catchUp++;

      const text = buildReminderText(
        scholarship!.scholarship_name,
        scholarship!.deadline_date!,
        scholarship!.application_link,
        // Days actually remaining, not the offset. A catch-up send is late by definition
        // and must not claim more time than the student has.
        daysRemaining ?? offsetDays,
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

        console.log(`[line-reminders] sent offset=${offsetDays} days_left=${daysRemaining} ` +
                    `reason=${reason} user=${row.user_id} scholarship=${row.scholarship_id}`);
      } catch (err) {
        console.error(`[line-reminders] push failed user=${row.user_id}:`, err);
        results.errors++;
      }
    }
  }

  console.log('[line-reminders] done', { today: todayStr, ...results });
  return NextResponse.json({ ok: true, today: todayStr, ...results });
}

export async function GET(request: NextRequest) {
  return handleReminders(request);
}

export async function POST(request: NextRequest) {
  return handleReminders(request);
}
