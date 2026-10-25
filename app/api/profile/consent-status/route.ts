/**
 * GET /api/profile/consent-status — does this signed-in student need to be asked for
 * research consent again? See lib/research/reconsent.ts for who, and why.
 *
 * BEHIND A SWITCH: answers needsReconsent:false for everyone unless RECONSENT_PROMPT is
 * exactly "on". Turn it on only after the study team has approved the research wording
 * the student will be asked to confirm. The wording today (2026-07-v1) does not tell a
 * participant that different ways of ordering scholarships are being compared; if the
 * approved text is a new version, everyone who confirmed the old one would have to be
 * asked again — so asking before the wording is settled spends their consent twice.
 *
 * Reads only the student's own rows, through their own session (row-level security).
 * An error is an error: the caller hides the prompt and logs, it never shows one on a
 * guess.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CURRENT_CONSENT_VERSION } from '@/lib/research/consentGate';
import { reconsentReason } from '@/lib/research/reconsent';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (process.env.RECONSENT_PROMPT !== 'on') {
    return NextResponse.json({ needsReconsent: false, reason: null, currentVersion: CURRENT_CONSENT_VERSION, enabled: false });
  }

  const [profile, sp] = await Promise.all([
    supabase.from('profiles').select('research_opt_in').eq('id', user.id).maybeSingle(),
    supabase.from('student_profile').select('consent_research, consent_version').eq('user_id', user.id).maybeSingle(),
  ]);
  if (profile.error || sp.error) {
    console.error('[consent-status] read failed:', profile.error?.message ?? sp.error?.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }

  const reason = reconsentReason({
    researchOptIn: (profile.data as { research_opt_in: boolean | null } | null)?.research_opt_in,
    sp: (sp.data as { consent_research: boolean | null; consent_version: string | null } | null) ?? null,
  });

  return NextResponse.json({
    needsReconsent: reason !== null,
    reason,
    currentVersion: CURRENT_CONSENT_VERSION,
  });
}
