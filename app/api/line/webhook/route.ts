/**
 * POST /api/line/webhook
 * LINE Messaging API webhook handler.
 *
 * Handles:
 *   - follow event    → no-op (we learn line_user_id from LINE Login instead)
 *   - unfollow event  → clear line_user_id for the unfollowing user
 *   - message event   → if text is a 6-digit link code, map line_user_id → user
 *   - postback event  → outcome self-report answer (see lib/line/outcomes.ts),
 *                        logs a self_report_outcome event, updates
 *                        tracked_scholarship.status, and replies with a
 *                        localized confirmation.
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
import { lineReply } from '@/lib/line/push';
import { parseOutcomePostback, outcomeChoiceToStatus, buildOutcomeConfirmationText } from '@/lib/line/outcomes';

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

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
};

async function handlePostback(
  db: ReturnType<typeof makeDb>,
  lineUserId: string,
  data: string,
  replyToken: string | undefined,
) {
  const parsed = parseOutcomePostback(data);
  if (!parsed) return;
  const { scholarshipId, choice } = parsed;

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (profileErr || !profile) {
    console.error('[line/webhook] postback: no profile for line_user_id', lineUserId, profileErr);
    return;
  }

  const outcomeDate = bangkokMidnight().toISOString().slice(0, 10);

  const { error: eventErr } = await db.from('event').insert({
    user_id: profile.id,
    scholarship_id: scholarshipId,
    event_type: 'self_report_outcome',
    outcome: choice,
    outcome_source: 'self_report',
    outcome_date: outcomeDate,
  });
  if (eventErr) console.error('[line/webhook] postback: event insert error:', eventErr);

  const newStatus = outcomeChoiceToStatus(choice);
  if (newStatus) {
    const { error: updateErr } = await db
      .from('tracked_scholarship')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('scholarship_id', scholarshipId);
    if (updateErr) console.error('[line/webhook] postback: status update error:', updateErr);
  }

  if (replyToken) {
    try {
      await lineReply(replyToken, [{ type: 'text', text: buildOutcomeConfirmationText(choice, 'th') }]);
    } catch (err) {
      console.error('[line/webhook] postback: reply failed:', err);
    }
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });

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
        // 6-digit numeric link code sent by user to connect their account
        if (/^\d{6}$/.test(text)) {
          const now = new Date().toISOString();
          const { error } = await db
            .from('profiles')
            .update({ line_user_id: lineUserId, line_linked_at: now, line_link_code: null, line_link_code_expires_at: null })
            .eq('line_link_code', text)
            .gt('line_link_code_expires_at', now);

          if (error) console.error('[line/webhook] link code error:', error);
        }
        continue;
      }

      if (event.type === 'postback' && event.postback?.data) {
        await handlePostback(db, lineUserId, event.postback.data, event.replyToken);
      }
    } catch (err) {
      console.error('[line/webhook] event handling error:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
