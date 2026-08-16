import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PREVIEW_COOKIE } from '@/lib/preview/types'

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
      const redirectTo = await resolveRedirect(supabase, next)
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }

    console.error('[TunDee] verifyOtp error:', error.message)
  }

  // ── OAuth code exchange ───────────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const redirectTo = await resolveRedirect(supabase, next)
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
 * After successful auth, check if user has a complete profile.
 * New users (no GPA set) → /profile/setup
 * Returning users        → the `next` param or /scholarships
 *
 * Setup can't be skipped even for visitors who already answered on /start —
 * step 0 collects the PDPA terms consent. Instead they get `?prefill=1`, which
 * replays their preview answers into the wizard and skips straight past those
 * questions, then drops them at `next`.
 */
async function resolveRedirect(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  next: string,
): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '/auth?error=auth_failed'

    // (last_active_at removed column does not exist in profiles table)

    // Check if the user has filled in their profile (GPA as proxy)
    const { data: profile } = await supabase
      .from('profiles')
      .select('gpa')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.gpa == null) {
      // New user or incomplete profile → setup wizard
      const hasPreview = Boolean((await cookies()).get(PREVIEW_COOKIE)?.value)
      const params = new URLSearchParams({ next })
      if (hasPreview) params.set('prefill', '1')
      return `/profile/setup?${params.toString()}`
    }

    return next
  } catch {
    return next
  }
}
