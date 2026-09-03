/**
 * POST /api/line/webhook
 * LINE Messaging API webhook handler.
 *
 * Handles:
 *   - follow event    → no-op (we learn line_user_id from LINE Login instead)
 *   - unfollow event  → clear line_user_id for the unfollowing user
 *   - message event   → an open outcome survey takes priority (amount reply);
 *                        otherwise a 6-digit link code maps line_user_id → user
 *   - postback event  → outcome survey answers (see lib/line/survey.ts):
 *                        awarded / waiting / not_applied / rejected, plus the
 *                        amount-skip, research-consent and reminder-opt-in
 *                        follow-ups. Legacy 3-choice postbacks still work.
 *
 * Idempotency: every answer upserts public.outcomes on (user_id,
 * scholarship_id), so re-tapping a quick reply overwrites rather than
 * duplicating. survey_log carries the conversation state.
 *
 * Required env vars:
 *   LINE_CHANNEL_SECRET   – for signature verification
 *   LINE_CHANNEL_ACCESS_TOKEN – for the reply on postback
 *   SUPABASE_SERVICE_ROLE_KEY
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { bangkokMidnight } from '@/lib/tdScholarships/displayGate';
import { lineReply, type LineTextMessage } from '@/lib/line/push';
import { parseOutcomePostback, outcomeChoiceToStatus, buildOutcomeConfirmationText } from '@/lib/line/outcomes';
import {
  parseSurveyPostback,
  parseAmountThb,
  routeSurveyAnswer,
  parseReaskDays,
  buildConsentQuestion,
  buildAmountUnparseableReply,
  COPY,
  OPEN_SURVEY_STATES,
  type SurveyState,
} from '@/lib/line/survey';
import { getLineMessagingChannelSecret } from '@/lib/line/env';

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type Db = ReturnType<typeof makeDb>;

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
};

interface OpenSurvey {
  id: number;
  scholarship_id: string;
  state: SurveyState;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function findProfileId(db: Db, lineUserId: string): Promise<string | null> {
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[line/webhook] profile lookup error:', error);
    return null;
  }
  return (data as { id: string }).id;
}

/** The one open survey conversation for this user, if any. */
async function findOpenSurvey(db: Db, userId: string, scholarshipId?: string): Promise<OpenSurvey | null> {
  let q = db
    .from('survey_log')
    .select('id, scholarship_id, state')
    .eq('user_id', userId)
    .in('state', OPEN_SURVEY_STATES)
    .order('sent_at', { ascending: false })
    .limit(1);

  if (scholarshipId) q = q.eq('scholarship_id', scholarshipId);

  const { data, error } = await q;
  if (error) {
    console.error('[line/webhook] survey_log lookup error:', error);
    return null;
  }
  const rows = (data ?? []) as unknown as OpenSurvey[];
  return rows.length ? rows[0] : null;
}

async function advanceSurvey(
  db: Db,
  surveyId: number,
  state: SurveyState,
  reaskAfter?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { state, responded_at: new Date().toISOString() };
  if (reaskAfter) patch.reask_after = reaskAfter;

  const { error } = await db.from('survey_log').update(patch).eq('id', surveyId);
  if (error) console.error('[line/webhook] survey_log update error:', error);
}

/**
 * Upsert the outcome row. Conflict target (user_id, scholarship_id) — the
 * latest answer wins, so a student correcting "waiting" to "awarded" works.
 */
async function upsertOutcome(
  db: Db,
  userId: string,
  scholarshipId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from('outcomes').upsert(
    {
      user_id:        userId,
      scholarship_id: scholarshipId,
      reported_at:    new Date().toISOString(),
      updated_at:     new Date().toISOString(),
      source:         'line',
      ...patch,
    },
    { onConflict: 'user_id,scholarship_id' },
  );
  if (error) console.error('[line/webhook] outcomes upsert error:', error);
}

async function reply(replyToken: string | undefined, messages: LineTextMessage[]): Promise<void> {
  if (!replyToken || !messages.length) return;
  try {
    await lineReply(replyToken, messages);
  } catch (err) {
    console.error('[line/webhook] reply failed:', err);
  }
}

// ── survey postbacks ───────────────────────────────────────────────────────

async function handleSurveyPostback(
  db: Db,
  userId: string,
  data: string,
  replyToken: string | undefined,
): Promise<boolean> {
  const parsed = parseSurveyPostback(data);
  if (!parsed) return false;

  const { scholarshipId } = parsed;
  const survey = await findOpenSurvey(db, userId, scholarshipId);
  const todayStr = bangkokMidnight().toISOString().slice(0, 10);

  switch (parsed.kind) {
    // ── Message 1: one of the four answers ────────────────────────────────
    case 'answer': {
      const reaskDays = parseReaskDays(process.env.SURVEY_REASK_DAYS);
      const branch = routeSurveyAnswer(parsed.choice, scholarshipId, { todayStr, reaskDays });

      // Look up the name so the outcome row is readable in the dashboard.
      const { data: sch } = await db
        .from('td_scholarships')
        .select('scholarship_name')
        .eq('scholarship_id', scholarshipId)
        .maybeSingle();

      await upsertOutcome(db, userId, scholarshipId, {
        status:           parsed.choice,
        scholarship_name: (sch as { scholarship_name?: string } | null)?.scholarship_name ?? null,
      });

      // Audit trail alongside the durable row.
      const { error: eventErr } = await db.from('event').insert({
        user_id:        userId,
        scholarship_id: scholarshipId,
        event_type:     'self_report_outcome',
        outcome:        parsed.choice,
        outcome_source: 'self_report',
        outcome_date:   todayStr,
      });
      if (eventErr) console.error('[line/webhook] event insert error:', eventErr);

      if (branch.trackedStatus) {
        const { error } = await db
          .from('tracked_scholarship')
          .update({ status: branch.trackedStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('scholarship_id', scholarshipId);
        if (error) console.error('[line/webhook] tracked status update error:', error);
      }

      if (survey) await advanceSurvey(db, survey.id, branch.nextState, branch.reaskAfter);
      await reply(replyToken, branch.messages);
      return true;
    }

    // ── awarded → "skip" on the amount question ───────────────────────────
    case 'amount': {
      if (survey) await advanceSurvey(db, survey.id, 'awaiting_consent');
      await reply(replyToken, [buildConsentQuestion(scholarshipId)]);
      return true;
    }

    // ── research consent ──────────────────────────────────────────────────
    case 'consent': {
      await upsertOutcome(db, userId, scholarshipId, { consent_research: parsed.agreed });
      if (survey) await advanceSurvey(db, survey.id, 'done');
      await reply(replyToken, [{
        type: 'text',
        text: parsed.agreed ? COPY.consentYesReply : COPY.consentNoReply,
      }]);
      return true;
    }

    // ── not_applied → deadline reminder opt-in ────────────────────────────
    case 'remind': {
      const { error } = await db
        .from('tracked_scholarship')
        .update({ reminder_opt_in: parsed.optIn, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('scholarship_id', scholarshipId);
      if (error) console.error('[line/webhook] reminder opt-in update error:', error);

      if (survey) await advanceSurvey(db, survey.id, 'done');
      await reply(replyToken, [{
        type: 'text',
        text: parsed.optIn ? COPY.remindYesReply : COPY.remindNoReply,
      }]);
      return true;
    }
  }
}

/** Legacy 3-choice postback ("outcome:<id>:<choice>") from before v14. */
async function handleLegacyPostback(
  db: Db,
  userId: string,
  data: string,
  replyToken: string | undefined,
): Promise<boolean> {
  const parsed = parseOutcomePostback(data);
  if (!parsed) return false;

  const { scholarshipId, choice } = parsed;
  const outcomeDate = bangkokMidnight().toISOString().slice(0, 10);

  await upsertOutcome(db, userId, scholarshipId, { status: choice });

  const { error: eventErr } = await db.from('event').insert({
    user_id:        userId,
    scholarship_id: scholarshipId,
    event_type:     'self_report_outcome',
    outcome:        choice,
    outcome_source: 'self_report',
    outcome_date:   outcomeDate,
  });
  if (eventErr) console.error('[line/webhook] legacy event insert error:', eventErr);

  const newStatus = outcomeChoiceToStatus(choice);
  if (newStatus) {
    const { error } = await db
      .from('tracked_scholarship')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('scholarship_id', scholarshipId);
    if (error) console.error('[line/webhook] legacy status update error:', error);
  }

  await reply(replyToken, [{ type: 'text', text: buildOutcomeConfirmationText(choice, 'th') }]);
  return true;
}

// ── inbound text ───────────────────────────────────────────────────────────

/**
 * A student answering the amount question types a bare number — and a 6-digit
 * amount such as "100000" is indistinguishable from an account link code.
 * An open survey awaiting an amount therefore takes priority over the link-code
 * branch. Returns true when the text was consumed by the survey.
 */
async function handleSurveyText(
  db: Db,
  userId: string,
  text: string,
  replyToken: string | undefined,
): Promise<boolean> {
  const survey = await findOpenSurvey(db, userId);
  if (!survey || survey.state !== 'awaiting_amount') return false;

  const amount = parseAmountThb(text);
  if (amount === null) {
    await reply(replyToken, [buildAmountUnparseableReply(survey.scholarship_id)]);
    return true;   // consumed: stay in awaiting_amount and re-prompt
  }

  await upsertOutcome(db, userId, survey.scholarship_id, { amount_thb: amount });
  await advanceSurvey(db, survey.id, 'awaiting_consent');
  await reply(replyToken, [buildConsentQuestion(survey.scholarship_id)]);
  return true;
}

async function handleLinkCode(db: Db, lineUserId: string, text: string): Promise<void> {
  if (!/^\d{6}$/.test(text)) return;

  const now = new Date().toISOString();
  const { error } = await db
    .from('profiles')
    .update({ line_user_id: lineUserId, line_linked_at: now, line_link_code: null, line_link_code_expires_at: null })
    .eq('line_link_code', text)
    .gt('line_link_code_expires_at', now);

  if (error) console.error('[line/webhook] link code error:', error);
}

// ── route ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // The MESSAGING API channel secret, not the Login one. lib/line/env trims it
  // and refuses to let the two hold the same value — an untrimmed secret makes
  // every signature mismatch, which looks identical to a forged request.
  let secret: string;
  try {
    secret = getLineMessagingChannelSecret();
  } catch (e) {
    console.error('[line/webhook] LINE env misconfigured:', e);
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const db = makeDb();

  for (const event of payload.events ?? []) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    try {
      if (event.type === 'unfollow') {
        const { error } = await db
          .from('profiles')
          .update({ line_user_id: null, line_linked_at: null })
          .eq('line_user_id', lineUserId);
        if (error) console.error('[line/webhook] unfollow clear error:', error);
        continue;
      }

      if (event.type === 'message' && event.message?.type === 'text') {
        const text = (event.message.text ?? '').trim();

        // An open survey wins over the link-code branch — see handleSurveyText.
        const userId = await findProfileId(db, lineUserId);
        if (userId && await handleSurveyText(db, userId, text, event.replyToken)) continue;

        await handleLinkCode(db, lineUserId, text);
        continue;
      }

      if (event.type === 'postback' && event.postback?.data) {
        const userId = await findProfileId(db, lineUserId);
        if (!userId) {
          console.error('[line/webhook] postback: no profile for line_user_id', lineUserId);
          continue;
        }

        const data = event.postback.data;
        if (await handleSurveyPostback(db, userId, data, event.replyToken)) continue;
        await handleLegacyPostback(db, userId, data, event.replyToken);
      }
    } catch (err) {
      console.error('[line/webhook] event handling error:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
