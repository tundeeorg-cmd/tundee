/**
 * POST /api/intake — park the /start answers before the visitor has an account.
 *
 * Called the moment someone finishes the three questions on /start, so their
 * answers exist on the server before anything can lose them. Returns an id the
 * page threads through every later hop: the email sign-in redirect, the LINE
 * `state`, and localStorage for the same-browser case.
 *
 * Without this, the answers live only in a cookie and a `?p=` param, both tied
 * to one browser — and the single most common path in our funnel crosses a
 * browser boundary, because tapping a sign-in link inside the Facebook webview
 * opens Chrome or Safari.
 *
 * Anonymous by design; no session is required or expected. RLS grants anon
 * INSERT on pending_intake and nothing else, so this route can write a row that
 * it could not itself read back.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parsePreviewInput } from '@/lib/preview/types';
import { anonRandomizationEnabled } from '@/lib/research/anonAssignment';
import { anonIdFromRequest } from '@/lib/research/anonRequest';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // Validated with the same parser /api/preview-match uses, so a row can only
  // ever hold answers the matcher would accept. An unparseable body is refused
  // here rather than stored and discovered later at claim time.
  const answers = parsePreviewInput((body as Record<string, unknown>)?.answers ?? body);
  if (!answers) {
    return NextResponse.json({ ok: false, error: 'invalid_answers' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[POST /api/intake] Supabase env missing');
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 500 });
  }

  // The ANON key on purpose, not the service role. This route needs exactly the
  // one grant anon has — INSERT — and using the service role here would give a
  // public, unauthenticated endpoint the ability to read the whole table if it
  // ever grew a select.
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // The id is minted HERE, and the insert asks for nothing back.
  //
  // This used to be `.insert({ answers }).select('id').single()`. A RETURNING
  // clause needs SELECT on the table, and v20 deliberately grants anon INSERT
  // only (the table is readable by the service role alone), so every request
  // failed and returned 500. pending_intake had 0 rows on 26 Oct 2026 against
  // 2-18 completed quizzes a day: for its whole life no answers were parked.
  // Minting the id here keeps the privileges exactly as v20 set them and needs
  // no migration.
  const id = randomUUID();

  const { error } = await supabase
    .from('pending_intake')
    // With the switch on, the visitor's anonymous id travels with their parked answers,
    // so signing up in a DIFFERENT browser (the Facebook webview -> Chrome case) can
    // still find the arm they were given. The intake id is the one thing that already
    // rides every sign-in link. Off by default: the row is exactly what it always was.
    .insert({ id, answers: withAnonId(answers, request) });

  if (error) {
    // Never fatal for the visitor: /start still works, the cookie still carries
    // their answers within this browser, and only the cross-browser rescue is
    // lost. Logged in full because that rescue silently not working is exactly
    // the class of failure that cost us two months last time.
    console.error('[POST /api/intake] insert failed:', error.code, error.message, error.details);
    return NextResponse.json({ ok: false, error: 'park_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}

/** answers plus the visitor's anon_id, when randomization is on and they have one. */
function withAnonId(answers: object, request: NextRequest): object {
  if (!anonRandomizationEnabled()) return answers;
  const anonId = anonIdFromRequest(request);
  return anonId ? { ...answers, anon_id: anonId } : answers;
}
