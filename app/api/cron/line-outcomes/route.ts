/**
 * GET|POST /api/cron/line-outcomes
 * Vercel Cron — runs daily at 01:00 UTC (08:00 Asia/Bangkok).
 *
 * Sends the LINE outcome survey to students whose tracked scholarship's result
 * window has passed and whose outcome is still unknown, and re-asks anyone who
 * previously answered "ยังรอผลอยู่" (waiting) once their re-ask date arrives.
 *
 * Guards:
 *   - never re-ask the same (user, scholarship) inside MIN_RESURVEY_GAP_DAYS (30)
 *   - at most SURVEY_MAX_PER_USER_PER_DAY pushes per user per run (default 1)
 *   - never start a second survey while one conversation is still open
 *
 * Vercel Cron Jobs invoke the path with GET (auto-attaching
 * `Authorization: Bearer $CRON_SECRET`); POST is also supported for manual
 * triggering/testing.
 *
 * Required env vars:
 *   CRON_SECRET
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   OUTCOME_OFFSETS  (optional, default "30,60,90")
 *   SURVEY_REASK_DAYS (optional, default 30)
 *   SURVEY_MAX_PER_USER_PER_DAY (optional, default 1)
 *   OUTCOME_FOLLOWUP_INCENTIVE_NOTE (optional, appended to the message)
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import {
  sendOutcomeSurvey,
  shouldSendSurvey,
  parseSurveyOffsets,
  parseMaxPerUserPerDay,
  isReaskDue,
  OPEN_SURVEY_STATES,
  type SurveyState,
} from '@/lib/line/survey';

function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface SurveyLogRow {
  user_id: string;
  scholarship_id: string;
  sent_at: string;
  state: SurveyState;
  reask_after: string | null;
  attempt_no: number;
}

const key = (userId: string, scholarshipId: string) => `${userId}|${scholarshipId}`;

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
  const offsets  = parseSurveyOffsets(process.env.OUTCOME_OFFSETS);
  const maxPerUserPerDay = parseMaxPerUserPerDay(process.env.SURVEY_MAX_PER_USER_PER_DAY);
  const incentiveNote = process.env.OUTCOME_FOLLOWUP_INCENTIVE_NOTE || undefined;

  // ── Load candidate tracked rows ─────────────────────────────────────────
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

  // ── Load the survey ledger and fold it into lookup maps ─────────────────
  const { data: logRows, error: logErr } = await db
    .from('survey_log')
    .select('user_id, scholarship_id, sent_at, state, reask_after, attempt_no');

  if (logErr) {
    console.error('[line-outcomes] survey_log fetch error:', logErr);
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const lastSentAt   = new Map<string, string>();   // pair → most recent sent_at
  const attemptCount = new Map<string, number>();   // pair → highest attempt_no
  const openPairs    = new Set<string>();           // pair → conversation still open
  const sentToday    = new Map<string, number>();   // user → pushes already today
  const dueReasks: SurveyLogRow[] = [];

  for (const r of (logRows ?? []) as unknown as SurveyLogRow[]) {
    const k = key(r.user_id, r.scholarship_id);

    const prev = lastSentAt.get(k);
    if (!prev || r.sent_at > prev) lastSentAt.set(k, r.sent_at);

    attemptCount.set(k, Math.max(attemptCount.get(k) ?? 0, r.attempt_no));

    if (OPEN_SURVEY_STATES.includes(r.state)) openPairs.add(k);

    if (r.sent_at.slice(0, 10) === todayStr) {
      sentToday.set(r.user_id, (sentToday.get(r.user_id) ?? 0) + 1);
    }

    if (r.state === 'awaiting_reask' && isReaskDue(r.reask_after, todayStr)) {
      dueReasks.push(r);
    }
  }

  const results = {
    sent: 0, reasked: 0, skipped: 0, errors: 0,
    reasons: {} as Record<string, number>,
  };
  const note = (reason: string) => {
    results.skipped++;
    results.reasons[reason] = (results.reasons[reason] ?? 0) + 1;
  };

  /** Push + log, keeping the in-run maps consistent so one run can't double-send. */
  async function send(
    lineUserId: string,
    userId: string,
    scholarshipId: string,
    scholarshipName: string | null,
    attemptNo: number,
    isReask: boolean,
  ): Promise<void> {
    const k = key(userId, scholarshipId);
    try {
      const res = await sendOutcomeSurvey(
        lineUserId,
        { user_id: userId, scholarship_id: scholarshipId, scholarship_name: scholarshipName },
        db,
        { triggerSource: 'cron', attemptNo, incentiveNote },
      );

      if (!res.ok) { results.errors++; return; }

      lastSentAt.set(k, new Date().toISOString());
      attemptCount.set(k, attemptNo);
      openPairs.add(k);
      sentToday.set(userId, (sentToday.get(userId) ?? 0) + 1);

      if (isReask) results.reasked++; else results.sent++;
      console.log(`[line-outcomes] ${isReask ? 're-asked' : 'sent'} attempt=${attemptNo} user=${userId} scholarship=${scholarshipId}`);
    } catch (err) {
      console.error(`[line-outcomes] push failed user=${userId}:`, err);
      results.errors++;
    }
  }

  // ── 1. Due re-asks (students who answered "waiting") ────────────────────
  // Handled first so a promised follow-up isn't crowded out by the rate limit.
  for (const r of dueReasks) {
    if ((sentToday.get(r.user_id) ?? 0) >= maxPerUserPerDay) { note('rate-limited'); continue; }

    const { data: prof } = await db
      .from('profiles').select('id, line_user_id').eq('id', r.user_id).maybeSingle();
    const lineUserId = (prof as { line_user_id?: string | null } | null)?.line_user_id;
    if (!lineUserId) { note('no-line-id'); continue; }

    const { data: sch } = await db
      .from('td_scholarships').select('scholarship_name')
      .eq('scholarship_id', r.scholarship_id).maybeSingle();

    const nextAttempt = Math.min((attemptCount.get(key(r.user_id, r.scholarship_id)) ?? 1) + 1, 6);
    await send(
      lineUserId, r.user_id, r.scholarship_id,
      (sch as { scholarship_name?: string } | null)?.scholarship_name ?? null,
      nextAttempt, true,
    );
  }

  // ── 2. Scheduled first asks at each offset past the deadline ────────────
  for (const row of rows ?? []) {
    const profile     = row.profiles as unknown as { line_user_id: string | null } | null;
    const scholarship = row.td_scholarships as unknown as {
      scholarship_name: string;
      deadline_date: string | null;
    } | null;

    const userId         = row.user_id as string;
    const scholarshipId  = row.scholarship_id as string;
    const k              = key(userId, scholarshipId);

    for (let i = 0; i < offsets.length; i++) {
      const { send: ok, reason } = shouldSendSurvey({
        lineUserId:       profile?.line_user_id,
        reminderOptIn:    row.reminder_opt_in as boolean,
        status:           row.status as string,
        deadlineDate:     scholarship?.deadline_date ?? null,
        todayStr,
        offsetDays:       offsets[i],
        lastSentAt:       lastSentAt.get(k) ?? null,
        sentToUserToday:  sentToday.get(userId) ?? 0,
        maxPerUserPerDay,
        hasOpenSurvey:    openPairs.has(k),
      });

      if (!ok) { note(reason); continue; }

      await send(
        profile!.line_user_id!, userId, scholarshipId,
        scholarship?.scholarship_name ?? null, i + 1, false,
      );
      break;   // one survey per pair per run
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
