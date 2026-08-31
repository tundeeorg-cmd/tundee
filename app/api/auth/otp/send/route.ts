/**
 * POST /api/auth/otp/send — email a six-digit code, without JavaScript.
 *
 * The hydrated form calls supabase.auth.signInWithOtp directly in the browser;
 * this is the same step for the student whose JavaScript has not arrived. /auth
 * is server-rendered behind a Suspense boundary, so on a stalled 3G connection
 * AuthShell is the real page — and on paid traffic that is the difference
 * between a signup and a blank screen.
 *
 * Accepts a native form POST and answers with a redirect back to /auth, which
 * is the only thing a browser with no JavaScript can act on.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isPlausibleEmail, normalizeEmail, classifyOtpError } from '@/lib/auth/otp';
import { CONSENT_PARAM, CONSENT_VERSION, isValidConsent } from '@/lib/consent';
import { PREVIEW_PARAM } from '@/lib/preview/types';
import { INTAKE_PARAM, isIntakeId } from '@/lib/intake/pendingIntake';
import { safeNext } from '@/lib/auth/resolveRedirect';

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const form   = await request.formData();

  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };

  const next    = safeNext(get('next'));
  const email   = normalizeEmail(get('email'));
  const preview = get(PREVIEW_PARAM);
  const intake  = get(INTAKE_PARAM);
  const utm     = get('utm_campaign');

  /** Back to /auth with everything intact, so nothing the student typed is lost. */
  const back = (params: Record<string, string>) => {
    const qs = new URLSearchParams({ next, ...params });
    if (email) qs.set('email', email);
    if (preview) qs.set(PREVIEW_PARAM, preview);
    if (isIntakeId(intake)) qs.set(INTAKE_PARAM, intake);
    if (utm) qs.set('utm_campaign', utm);
    return NextResponse.redirect(`${origin}/auth?${qs.toString()}`, { status: 303 });
  };

  if (!isValidConsent(get(CONSENT_PARAM))) return back({ error: 'consent_required' });
  if (!isPlausibleEmail(email))            return back({ error: 'invalid_email' });

  const callback = new URL(`${origin}/auth/callback`);
  callback.searchParams.set('next', next);
  callback.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
  if (preview) callback.searchParams.set(PREVIEW_PARAM, preview);
  if (isIntakeId(intake)) callback.searchParams.set(INTAKE_PARAM, intake);
  if (utm) callback.searchParams.set('utm_campaign', utm);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
  });

  if (error) {
    // The real error stays here; the student gets a code the page turns into
    // Thai. Supabase's own text is English and names our provider.
    console.error('[POST /api/auth/otp/send] failed:', error.status, error.message, { email });
    return back({ error: classifyOtpError(error) });
  }

  // stage=code makes both the shell and the hydrated form open on the code
  // entry step, so the two render the same thing from the same URL.
  return back({ stage: 'code', sent: '1' });
}
