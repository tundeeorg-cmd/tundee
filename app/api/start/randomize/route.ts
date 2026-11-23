/**
 * POST /api/start/randomize — randomize an anonymous visitor who has consented.
 *
 * BEHIND A SWITCH: answers 404 {enabled:false} unless ANON_RANDOMIZATION=on. See
 * lib/research/anonAssignment.ts for what must be true before that is turned on.
 *
 * Body: { answers: PreviewInput, adult: true, consent: true,
 *         attribution?: { utm_source, utm_medium, utm_campaign, utm_content, landing_variant } }
 *
 * - The covariates (answers, region_group, recruitment_source, UTMs, landing
 *   variant) are written on the assignment row, once (scripts/20261122_v38_1), so a
 *   participant who never signs up is still a complete record (PREREG §10.2).
 *
 * - Age first: unless the visitor declared they have reached the threshold
 *   (START_ADULT_AGE) there is no assignment, no cookie and no row — they get the full
 *   service outside the study. Self-declared, so a limit of the design, not a check.
 *
 * - No consent, no assignment, no cookie, no row: the visitor simply gets the
 *   baseline ranking and is not in the study (PART 2 step 6).
 * - Signed in, no assignment either: an account holder is in the account-level study
 *   already, and a second, anonymous record splits their outcome (anonStudyOffered in
 *   lib/research/startEligibility.ts). /start does not offer them the consent; this
 *   is the server's half of that rule.
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
import { mayBeRandomized } from '@/lib/research/startEligibility';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildAnonCovariates, type AnonAttribution } from '@/lib/research/anonCovariates';

export async function POST(request: NextRequest) {
  if (!anonRandomizationEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as {
    answers?: unknown; consent?: unknown; adult?: unknown; attribution?: unknown;
  } | null;
  const answers = parsePreviewInput(body?.answers);
  if (!answers) return NextResponse.json({ error: 'invalid_answers' }, { status: 400 });

  // Age, then consent: each an explicit `true`. Absent, false or anything else is a no,
  // and a no creates nothing.
  const may = mayBeRandomized({ adult: body?.adult, consent: body?.consent });
  if (may !== 'ok') {
    return NextResponse.json({ randomized: false, reason: may });
  }

  // Signed in: no assignment, no cookie, no row. A failed session read is an error,
  // not a guess either way — randomizing an account holder is the bug this prevents.
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.json({ randomized: false, reason: 'signed_in' });
  } catch (err) {
    console.error('[anon] randomize: session check failed:', (err as Error).message);
    return NextResponse.json({ error: 'randomization_unavailable' }, { status: 503 });
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

  const attribution = body?.attribution && typeof body.attribution === 'object'
    ? body.attribution as AnonAttribution
    : null;
  const covariates = buildAnonCovariates(answers, attribution);

  const saved = await saveAnonAssignment(admin, assignment, covariates);
  if (saved.error || !saved.row) {
    console.error('[anon] randomize FAILED', { anon: anonLogTag(anonId), message: saved.error });
    return NextResponse.json({ error: 'randomization_failed' }, { status: 500 });
  }

  console.info('[anon] randomized', {
    anon: anonLogTag(anonId), created: saved.created, covariates: saved.covariatesStored ?? false,
    recruitment_source: covariates.recruitment_source,
  });
  const response = NextResponse.json({ randomized: true });
  return setAnonCookie(response, anonId, request.nextUrl.hostname);
}
