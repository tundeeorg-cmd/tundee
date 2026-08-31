/**
 * POST /api/auth/otp/verify — check a six-digit code, without JavaScript.
 *
 * The server counterpart of the hydrated form's supabase.auth.verifyOtp call.
 * Verifying here sets the session cookies on the redirect response, so a
 * student with no working JavaScript ends up signed in exactly like everyone
 * else — and lands on /auth/callback, which is where the /start answers are
 * merged and the profile row is guaranteed.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeEmail, normalizeOtpCode, classifyOtpError, OTP_LENGTH } from '@/lib/auth/otp';
import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
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
  const token   = normalizeOtpCode(get('code'));
  const preview = get(PREVIEW_PARAM);
  const intake  = get(INTAKE_PARAM);
  const utm     = get('utm_campaign');

  const carriers = (qs: URLSearchParams) => {
    if (preview) qs.set(PREVIEW_PARAM, preview);
    if (isIntakeId(intake)) qs.set(INTAKE_PARAM, intake);
    if (utm) qs.set('utm_campaign', utm);
    return qs;
  };

  const back = (error: string) => NextResponse.redirect(
    `${origin}/auth?${carriers(new URLSearchParams({ next, stage: 'code', email, error })).toString()}`,
    { status: 303 },
  );

  if (token.length !== OTP_LENGTH) return back('code_invalid');

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  if (error) {
    console.error('[POST /api/auth/otp/verify] failed:', error.status, error.message, { email });
    return back(classifyOtpError(error));
  }

  // Straight to the callback, which owns the merge, the guaranteed profile row
  // and the conversion marker — the same destination the LINE bridge uses, so
  // there is one place where "a session just started" is handled.
  const qs = carriers(new URLSearchParams({ next }));
  qs.set(CONSENT_PARAM, CONSENT_VERSION);
  return NextResponse.redirect(`${origin}/auth/callback?${qs.toString()}`, { status: 303 });
}
