/**
 * POST /api/line/webhook
 * LINE Messaging API webhook handler.
 *
 * Handles:
 *   - follow event  → no-op (we learn line_user_id from LINE Login instead)
 *   - unfollow event → mark line_user_id as unfollowed (optional)
 *   - message event → if text is a 6-digit link code, map line_user_id → user
 *
 * Required env vars:
 *   LINE_CHANNEL_SECRET   – for signature verification
 *   SUPABASE_SERVICE_ROLE_KEY
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  return expected === signature;
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
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
};

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
    }
  }

  return NextResponse.json({ ok: true });
}
