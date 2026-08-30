import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PREVIEW_COOKIE, PREVIEW_PARAM, decodePreviewInput, previewCompletesProfile } from '@/lib/preview/types'
import {
  CONSENT_COOKIE,
  CONSENT_PARAM,
  CONSENT_VERSION,
  isValidConsent,
} from '@/lib/consent'
import { signupMethodFrom } from '@/lib/analytics'
import { recruitmentSourceFrom } from '@/lib/research/assignment'
import {
  SIGNUP_CONVERSION_COOKIE,
  SIGNUP_CONVERSION_MAX_AGE_SECONDS,
  type SignupConversionMethod,
  isFirstSignIn,
} from '@/lib/analytics/signupConversion'

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
  // token_hash works from ANY browser: unlike the PKCE `code` below it needs no
  // code_verifier from the device that requested the link. Magic links are
  // routinely opened in a different browser (see buildCallbackUrl in
  // app/auth/page.tsx), so this is the path email sign-in should take.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change',
      token_hash,
    })

    if (!error) {
      const resolved = await resolveRedirect(supabase, next, searchParams)
      return redirectWithConversion(origin, resolved)
    }

    console.error('[TunDee] verifyOtp error:', error.status, error.message)
    // Supabase reports both expiry and reuse as 4xx on an unusable token; it
    // does not distinguish them, so neither do we. Claiming "expired" when a
    // link was merely unreadable is what sent users round the loop.
    return NextResponse.redirect(`${origin}/auth?error=link_invalid`)
  }

  // ── OAuth code exchange (PKCE) ────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const resolved = await resolveRedirect(supabase, next, searchParams)
      return redirectWithConversion(origin, resolved)
    }

    console.error('[TunDee] exchangeCodeForSession error:', error.status, error.message)
    return NextResponse.redirect(`${origin}/auth?error=exchange_failed`)
  }

  // ── Nothing usable arrived ────────────────────────────────────────────────
  // This is NOT an expired link. It means the callback was reached with no
  // token_hash and no code — which is what happens when the email points at
  // Supabase's /auth/v1/verify endpoint: that returns the session in the URL
  // FRAGMENT, and a fragment is never sent to the server, so this route sees
  // an empty query string.
  //
  // It used to redirect to `auth_failed`, which the UI renders as "your link
  // expired or was already used". Users then requested another link, hit the
  // identical wall, and gave up — with nothing in the logs to show why.
  console.error(
    '[TunDee] auth callback received no token_hash and no code.',
    'Check that the email template links to this route with token_hash + type,',
    'not to Supabase /auth/v1/verify.',
    'params:', Array.from(searchParams.keys()).join(',') || '(none)',
  )
  return NextResponse.redirect(`${origin}/auth?error=no_credentials`)
}

/**
 * Where to send the visitor, plus — only when this route wrote the profile
 * itself and skipped the wizard — which provider signed them up.
 */
interface ResolvedRedirect {
  path: string
  /** Set whenever this callback created the account, on every branch. */
  signupMethod?: SignupConversionMethod
}

/**
 * Redirect, attaching the CompleteRegistration marker when a signup completed
 * here. components/SignupConversion.tsx reads it on arrival and deletes it.
 */
function redirectWithConversion(origin: string, resolved: ResolvedRedirect): NextResponse {
  const response = NextResponse.redirect(`${origin}${resolved.path}`)

  if (resolved.signupMethod) {
    response.cookies.set(SIGNUP_CONVERSION_COOKIE, resolved.signupMethod, {
      // Readable by the client: a browser pixel cannot be fired from here.
      httpOnly: false,
      sameSite: 'lax',
      path:     '/',
      maxAge:   SIGNUP_CONVERSION_MAX_AGE_SECONDS,
      secure:   process.env.NODE_ENV === 'production',
    })
  }

  return response
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
): Promise<ResolvedRedirect> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Verification succeeded a moment ago but the session did not stick —
      // usually a cookie that could not be written. Distinct from a bad link,
      // and telling the user their link expired would send them to request
      // another one that fails the same way.
      console.error('[TunDee] session verified but getUser() returned no user')
      return { path: '/auth?error=session_lost' }
    }

    // (last_active_at removed column does not exist in profiles table)

    /**
     * The account exists as of this request, so the registration is complete —
     * whatever the visitor does with the wizard next. Computed once here and
     * attached to every branch below, because the branch taken says something
     * about onboarding, not about whether a signup happened.
     */
    const signupMethod = isFirstSignIn(user.created_at, user.last_sign_in_at)
      ? signupMethodFrom(
          user.app_metadata?.provider,
          user.user_metadata?.provider as string | undefined,
        )
      : undefined

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
      .select('gpa, income_bracket')
      .eq('id', user.id)
      .maybeSingle()

    // GPA is no longer a reliable completeness proxy: it is optional on /start,
    // so a visitor can arrive with a full preview and no GPA at all. Income is
    // required there, so it is the better signal for "has this profile been
    // filled in".
    const incomplete = !profile || profile.income_bracket == null

    // Enough on hand to skip onboarding altogether — and only if writing it
    // actually leaves the profile complete. Skipping the wizard on a preview
    // that cannot fill it is how five accounts ended up half-written in August.
    if (incomplete && preview && consented && previewCompletesProfile(preview)) {
      const { error } = await supabase.from('profiles').upsert({
        id:              user.id,
        grade_level:     preview.level,
        province:        preview.province,
        income_bracket:  preview.income,
        // PREREG §5.4. Validated against the closed campaign set here, not
        // trusted as free text; anything unrecognised becomes 'organic'.
        // /api/experiment/assign only writes this when it is still null, so
        // whichever path runs first wins and neither overwrites the other.
        recruitment_source: recruitmentSourceFrom(searchParams.get('utm_campaign')),
        // Only write a GPA the visitor actually gave. Writing a default would
        // put a grade on their record that they never claimed.
        ...(preview.gpa !== null ? { gpa: preview.gpa } : {}),
        consent_version: CONSENT_VERSION,
        consent_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'id' })

      if (!error) {
        return { path: next, signupMethod }
      }

      // Fall through to the wizard rather than stranding the user on a
      // half-written profile; their answers are still in the cookie.
      console.error('[TunDee] callback profile upsert failed:', error.message)
    }

    if (incomplete) {
      const params = new URLSearchParams({ next })
      if (preview) params.set('prefill', '1')
      // Marked too. This is the branch that was losing the conversion: the
      // wizard only reported on submit, and visitors who opened it and left
      // never reported at all — 100% of them since 25 Aug.
      return { path: `/profile/setup?${params.toString()}`, signupMethod }
    }

    // Usually a returning user, for whom signupMethod is undefined and nothing
    // fires. It is set only if this same request created the account — someone
    // whose profile was already written for them, who is still a new signup.
    return { path: next, signupMethod }
  } catch {
    return { path: next }
  }
}
