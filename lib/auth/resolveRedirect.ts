/**
 * Where a freshly-authenticated visitor lands, and the guest-session merge that
 * makes escaping the signup wizard possible.
 *
 * This used to live inside app/auth/callback/route.ts, which was fine while the
 * callback was the only way into a session. It no longer is: email + password
 * signup completes at app/api/auth/password without any callback round trip, so
 * the merge had to become something both routes call rather than something one
 * of them owns. Two copies of this logic would drift, and the failure mode when
 * they drift is a student being re-asked their grade, GPA and province — the
 * exact drop-off the merge exists to remove.
 *
 * The rule, in one line: if we already know the answers and we have consent,
 * write the profile HERE and send them straight to their matches.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PREVIEW_COOKIE,
  decodePreviewInput,
  previewCompletesProfile,
} from '@/lib/preview/types'
import { CONSENT_COOKIE, CONSENT_VERSION, isValidConsent } from '@/lib/consent'
import { canonicalizeGradeLevel } from '@/lib/profile/gradeLevels'
import { signupMethodFrom } from '@/lib/analytics'
import { recruitmentSourceFrom } from '@/lib/research/assignment'
import {
  isFirstSignIn,
  encodeSignupConversion,
  SIGNUP_CONVERSION_COOKIE,
  SIGNUP_CONVERSION_MAX_AGE_SECONDS,
  type SignupConversion,
  type SignupConversionMethod,
} from '@/lib/analytics/signupConversion'
import { inspectUserAgent } from '@/lib/browser/inAppBrowser'

/** Only same-origin paths are accepted as a post-login destination. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/scholarships'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scholarships'
  return raw
}

/**
 * Everything the merge needs that differs between the two callers.
 *
 * The three carriers are all optional and all fall back to cookies, because
 * which one is populated depends on the path taken. A password signup posts
 * them in a form body; an OAuth callback has them in its query string; a
 * visitor who escaped a webview into Chrome has them in the URL and NOTHING in
 * cookies, because the two browsers do not share a jar.
 */
export interface MergeContext {
  next: string
  /** Encoded /start answers from the URL or form body. Cookie is the fallback. */
  previewParam?: string | null
  consentParam?: string | null
  utmCampaign?: string | null
  /**
   * Overrides provider sniffing. The password route knows what it just minted;
   * everything else is inferred from the Supabase user record.
   */
  methodOverride?: SignupConversionMethod
  /** Request User-Agent, so the conversion can record the browser it happened in. */
  userAgent?: string | null
}

export interface ResolvedRedirect {
  path: string
  /** Set only when THIS request created the account, on every branch. */
  conversion?: SignupConversion
}

/**
 * After successful auth, decide where the user lands.
 *
 *   • /start answers + consent  → write the profile HERE, go straight to `next`
 *   • incomplete profile        → /profile/setup (prefilled where possible)
 *   • otherwise                 → `next`
 *
 * Writing at this point rather than at wizard-submit is the whole point. It
 * means someone who matched on /start never sees a screen that re-asks their
 * level, GPA or province, and their answers survive even if they abandon the
 * rest of onboarding.
 */
export async function resolveRedirect(
  supabase: SupabaseClient,
  ctx: MergeContext,
): Promise<ResolvedRedirect> {
  const next = safeNext(ctx.next)

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Verification succeeded a moment ago but the session did not stick —
      // usually a cookie that could not be written. Distinct from a bad link,
      // and telling the user their link expired would send them to request
      // another one that fails the same way.
      console.error('[TunDee] session established but getUser() returned no user')
      return { path: '/auth?error=session_lost' }
    }

    /**
     * The account exists as of this request, so the registration is complete —
     * whatever the visitor does with the wizard next. Computed once here and
     * attached to every branch below, because the branch taken says something
     * about onboarding, not about whether a signup happened.
     */
    const iab = inspectUserAgent(ctx.userAgent)
    const conversion: SignupConversion | undefined =
      isFirstSignIn(user.created_at, user.last_sign_in_at)
        ? {
            method: ctx.methodOverride ?? signupMethodFrom(
              user.app_metadata?.provider,
              user.user_metadata?.provider as string | undefined,
            ),
            inWebview: iab.isInApp,
            app:       iab.app,
          }
        : undefined

    const jar = await cookies()

    // Param first, cookie second. A visitor who escaped a webview into Chrome
    // arrives with the param and none of the webview's cookies, so the param
    // has to win — it is the only carrier that crosses a browser boundary.
    const preview = decodePreviewInput(
      ctx.previewParam ?? jar.get(PREVIEW_COOKIE)?.value,
    )
    const consented =
      isValidConsent(ctx.consentParam) ||
      isValidConsent(jar.get(CONSENT_COOKIE)?.value)

    // GPA is not a reliable completeness proxy: it is optional on /start, so a
    // visitor can arrive with a full preview and no GPA at all. Income is
    // required there, so it is the better signal for "has this been filled in".
    const { data: profile } = await supabase
      .from('profiles')
      .select('gpa, income_bracket')
      .eq('id', user.id)
      .maybeSingle()

    const incomplete = !profile || profile.income_bracket == null

    // Enough on hand to skip onboarding altogether — and only if writing it
    // actually leaves the profile complete. Skipping the wizard on a preview
    // that cannot fill it is how five accounts ended up half-written in August.
    if (incomplete && preview && consented && previewCompletesProfile(preview)) {
      // Canonicalised, not trusted. This upsert was the SILENT half of the
      // 31 Aug outage: a visitor who chose ม.4–6 on /start had their level
      // rejected here by profiles_grade_level_check, the error was logged and
      // swallowed, and they were forwarded to the wizard — which then failed on
      // the same value at 100%. parsePreviewInput now validates against the
      // canonical set, and this is the second line of defence.
      const previewGrade = canonicalizeGradeLevel(preview.level)

      const { error } = await supabase.from('profiles').upsert({
        id:              user.id,
        ...(previewGrade ? { grade_level: previewGrade } : {}),
        province:        preview.province,
        income_bracket:  preview.income,
        // PREREG §5.4. Validated against the closed campaign set here, not
        // trusted as free text; anything unrecognised becomes 'organic'.
        // /api/experiment/assign only writes this when it is still null, so
        // whichever path runs first wins and neither overwrites the other.
        recruitment_source: recruitmentSourceFrom(ctx.utmCampaign ?? null),
        // Only write a GPA the visitor actually gave. Writing a default would
        // put a grade on their record that they never claimed.
        ...(preview.gpa !== null ? { gpa: preview.gpa } : {}),
        consent_version: CONSENT_VERSION,
        consent_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'id' })

      if (!error) return { path: next, conversion }

      // Fall through to the wizard rather than stranding the user on a
      // half-written profile; their answers are still in the cookie.
      console.error('[TunDee] profile upsert failed during merge:', error.message)
    }

    if (incomplete) {
      const params = new URLSearchParams({ next })
      if (preview) params.set('prefill', '1')
      // Marked too. This is the branch that was losing the conversion: the
      // wizard only reported on submit, and visitors who opened it and left
      // never reported at all — 100% of them since 25 Aug.
      return { path: `/profile/setup?${params.toString()}`, conversion }
    }

    // Usually a returning user, for whom conversion is undefined and nothing
    // fires. It is set only if this same request created the account — someone
    // whose profile was already written for them, who is still a new signup.
    return { path: next, conversion }
  } catch {
    return { path: next }
  }
}

/**
 * Attach the CompleteRegistration marker when a signup completed on this
 * request. components/SignupConversion.tsx reads it on arrival and deletes it.
 *
 * Separate from the redirect helper below because the password route answers
 * the hydrated client with JSON, not a redirect, and the marker has to ride
 * that response too — otherwise every webview signup, the ones this change
 * exists to create, would go unreported to Meta and TikTok.
 */
export function applyConversionCookie<T extends NextResponse>(
  response: T,
  resolved: ResolvedRedirect,
): T {
  if (resolved.conversion) {
    response.cookies.set(SIGNUP_CONVERSION_COOKIE, encodeSignupConversion(resolved.conversion), {
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

/**
 * Redirect to the resolved path with the marker attached.
 *
 * Lives here rather than in a route file because Next.js route modules may only
 * export route handlers and the recognised config options — and both the OAuth
 * callback and the no-JS half of the password route need it.
 */
export function redirectWithConversion(origin: string, resolved: ResolvedRedirect): NextResponse {
  return applyConversionCookie(NextResponse.redirect(`${origin}${resolved.path}`), resolved)
}
