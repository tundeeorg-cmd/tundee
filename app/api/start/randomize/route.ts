/**
 * POST /api/start/randomize — randomize an anonymous visitor who has consented.
 *
 * BEHIND A SWITCH: answers 404 {enabled:false} unless ANON_RANDOMIZATION=on. See
 * lib/research/anonAssignment.ts for what must be true before that is turned on.
 *
 * Body: { answers: PreviewInput, consent: true }
 *
 * - No consent, no assignment, no cookie, no row: the visitor simply gets the
 *   baseline ranking and is not in the study (PART 2 step 6).
 * - Idempotent: the same anon_id always gets the same arm, however often the quiz
 *   is resubmitted and with whatever answers (the first stratum is the one used).
 * - The arm is NEVER returned. Participants are not told which arm they are in
 *   (PREREG §4); the ranking they are served is the only place it shows.
 * - Any failure is an error status, not a quiet "baseline": a visitor we failed to
 *   randomize must be countable as that, not mistaken for a decliner.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePreviewInput } from '@/lib/preview/types';
import { anonRandomizationEnabled, buildAnonAssignment, anonLogTag } from '@/lib/research/anonAssignment';
import { ANON_CONSENT_VERSION, saveAnonAssignment } from '@/lib/research/anonStore';
import { anonIdFromRequest, mintAnonId, setAnonCookie } from '@/lib/research/anonRequest';

export async function POST(request: NextRequest) {
  if (!anonRandomizationEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as { answers?: unknown; consent?: unknown } | null;
  const answers = parsePreviewInput(body?.answers);
  if (!answers) return NextResponse.json({ error: 'invalid_answers' }, { status: 400 });

  // Consent is an explicit `true`. Absent, false or anything else is a decline.
  if (body?.consent !== true) {
    return NextResponse.json({ randomized: false, reason: 'no_consent' });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('[anon] randomize: service role not configured');
    return NextResponse.json({ error: 'randomization_unavailable' }, { status: 503 });
  }

  const anonId = anonIdFromRequest(request) ?? mintAnonId();

  let assignment;
  try {
    assignment = buildAnonAssignment({
      anonId,
      province: answers.province,
      incomeBracket: answers.income,
      consentVersion: ANON_CONSENT_VERSION,
      now: new Date(),
    });
  } catch (err) {
    // A missing or weak RANDOMIZATION_SALT stops assignment, loudly (PREREG §4).
    console.error('[anon] randomize: salt unavailable:', (err as Error).message);
    return NextResponse.json({ error: 'randomization_unavailable' }, { status: 503 });
  }

  const saved = await saveAnonAssignment(admin, assignment);
  if (saved.error || !saved.row) {
    console.error('[anon] randomize FAILED', { anon: anonLogTag(anonId), message: saved.error });
    return NextResponse.json({ error: 'randomization_failed' }, { status: 500 });
  }

  console.info('[anon] randomized', { anon: anonLogTag(anonId), created: saved.created });
  const response = NextResponse.json({ randomized: true });
  return setAnonCookie(response, anonId, request.nextUrl.hostname);
}
