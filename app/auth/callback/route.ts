import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PREVIEW_COOKIE, PREVIEW_PARAM, decodePreviewInput } from '@/lib/preview/types'
import {
  CONSENT_COOKIE,
  CONSENT_PARAM,
  CONSENT_VERSION,
  isValidConsent,
} from '@/lib/consent'

/**
 * Auth callback handles:
 *  • Magic link / OTP:  URL contains token_hash + type
 *  • Google OAuth:      URL contains code
 *  • LINE login:        app/api/auth/line/callback hands off a token_hash here
 *
 * After successful session:
 *  • New user (no profile GPA)  → /profile/setup (prefilled from the /start preview)
 *  • Returning user              → the `next` param, default /scholarships
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = safeNext(searchParams.get('next'))

  const supabase = await createServerSupabaseClient()

  // ── Magic link / OTP ──────────────────────────────────────────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'signup' | 'recovery' | 'invite' | 'sms' | 'phone_change' | 'email_change',
      token_hash,
    })

    if (!error) {
      const redirectTo = await resolveRedirect(supabase, next, searchParams)
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }

    console.error('[TunDee] verifyOtp error:', error.message)
  }

  // ── OAuth code exchange ───────────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const redirectTo = await resolveRedirect(supabase, next, searchParams)
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }

    console.error('[TunDee] exchangeCodeForSession error:', error.message)
  }

  // ── Fallback: something went wrong ────────────────────────────────────────
  return NextResponse.redirect(`${origin}/auth?error=auth_failed`)
}

/** Only same-origin paths are accepted as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw) return '/scholarships'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scholarships'
  return raw
}

/**
 * After successful auth, decide where the user lands.
 *
 *   • /start answers + consent  → write the profile HERE, go straight to `next`
 *   • incomplete profile        → /profile/setup (prefilled where possible)
 *   • otherwise                 → `next`
 *
 * Writing at the callback rather than at wizard-submit is the point of this
 * route. It means someone who matched on /start never sees a screen that re-asks
 * their level, GPA or province, and their answers survive even if they abandon
 * the rest of onboarding.
 */
async function resolveRedirect(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  next: string,
  searchParams: URLSearchParams,
): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '/auth?error=auth_failed'

    // (last_active_at removed column does not exist in profiles table)

    const jar = await cookies()

    // Query param first, cookie second: an email magic link opened in another
    // browser carries the param but none of this browser's cookies.
    const preview = decodePreviewInput(
      searchParams.get(PREVIEW_PARAM) ?? jar.get(PREVIEW_COOKIE)?.value,
    )
    const consented =
      isValidConsent(searchParams.get(CONSENT_PARAM)) ||
      isValidConsent(jar.get(CONSENT_COOKIE)?.value)

    // Check if the user has filled in their profile (GPA as proxy)
    const { data: profile } = await supabase
      .from('profiles')
      .select('gpa')
      .eq('id', user.id)
      .maybeSingle()

    const incomplete = !profile || profile.gpa == null

    // Enough on hand to skip onboarding altogether.
    if (incomplete && preview && consented) {
      const { error } = await supabase.from('profiles').upsert({
        id:              user.id,
        grade_level:     preview.level,
        province_id:     preview.province,
        gpa:             preview.gpa,
        consent_version: CONSENT_VERSION,
        consent_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'id' })

      if (!error) return next

      // Fall through to the wizard rather than stranding the user on a
      // half-written profile; their answers are still in the cookie.
      console.error('[TunDee] callback profile upsert failed:', error.message)
    }

    if (incomplete) {
      const params = new URLSearchParams({ next })
      if (preview) params.set('prefill', '1')
      return `/profile/setup?${params.toString()}`
    }

    return next
  } catch {
    return next
  }
}
