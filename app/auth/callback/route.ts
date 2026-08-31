import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PREVIEW_PARAM } from '@/lib/preview/types'
import { INTAKE_PARAM } from '@/lib/intake/pendingIntake'
import { CONSENT_PARAM } from '@/lib/consent'
import { resolveRedirect, safeNext, redirectWithConversion } from '@/lib/auth/resolveRedirect'

/**
 * Auth callback handles:
 *  • Google OAuth:      URL contains code
 *  • LINE login:        app/api/auth/line/callback hands off a token_hash here
 *  • Password recovery: the "set your password" link carries a token_hash too
 *  • Email code:        no token at all — the session already exists
 *
 * Email sign-in is a six-digit code, verified in the page by
 * supabase.auth.verifyOtp — it never reaches this route, because never leaving
 * the page is the entire point of using a code inside a webview. The same email
 * also carries a link, and THAT arrives here as a token_hash: it is the
 * fallback for someone who would rather tap than type, and it is why the
 * token_hash branch matters more now, not less. The LINE bridge and password
 * recovery mint one too.
 *
 * Where the user lands, and the merge of their /start answers into the new
 * account, live in lib/auth/resolveRedirect.ts — shared with the password route
 * so the two cannot drift.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = safeNext(searchParams.get('next'))

  const supabase = await createServerSupabaseClient()

  const merge = () => resolveRedirect(supabase, {
    next,
    previewParam: searchParams.get(PREVIEW_PARAM),
    // Survives an email sign-in link opening in a different browser, where the
    // cookie and the preview param do not exist at all.
    intakeParam:  searchParams.get(INTAKE_PARAM),
    consentParam: searchParams.get(CONSENT_PARAM),
    utmCampaign:  searchParams.get('utm_campaign'),
    userAgent:    request.headers.get('user-agent'),
  })

  // ── One-time token: LINE handoff, or a password-recovery link ─────────────
  // token_hash works from ANY browser: unlike the PKCE `code` below it needs no
  // code_verifier from the device that requested it. A recovery link is
  // routinely opened in a different browser from the one that asked, so this is
  // the path that has to keep working there.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change',
      token_hash,
    })

    if (!error) {
      // A recovery token establishes a session whose only purpose is to let the
      // user set a password. Send them to the form rather than into the app,
      // where they would land signed in with still no password set and no
      // prompt to fix it.
      if (type === 'recovery') {
        const params = new URLSearchParams({ next })
        return NextResponse.redirect(`${origin}/auth/reset/confirm?${params.toString()}`)
      }
      return redirectWithConversion(origin, await merge())
    }

    console.error('[TunDee] verifyOtp error:', error.status, error.message)
    // Supabase reports both expiry and reuse as 4xx on an unusable token; it
    // does not distinguish them, so neither do we.
    return NextResponse.redirect(`${origin}/auth?error=link_invalid`)
  }

  // ── OAuth code exchange (PKCE) ────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) return redirectWithConversion(origin, await merge())

    console.error('[TunDee] exchangeCodeForSession error:', error.status, error.message)
    return NextResponse.redirect(`${origin}/auth?error=exchange_failed`)
  }

  // ── Already signed in ─────────────────────────────────────────────────────
  // The email code is verified in the page (or by /api/auth/otp/verify), so the
  // session exists BEFORE this route is reached and there is no token to
  // exchange. Sending that student to ?error=no_credentials would strand a
  // successful sign-in on an error screen — and skip the merge, which is the
  // one thing every new session has to pass through.
  {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return redirectWithConversion(origin, await merge())
  }

  // ── Nothing usable arrived ────────────────────────────────────────────────
  // This is NOT an expired link. It means the callback was reached with no
  // token_hash and no code — which is what happens when an email points at
  // Supabase's /auth/v1/verify endpoint: that returns the session in the URL
  // FRAGMENT, and a fragment is never sent to the server, so this route sees
  // an empty query string.
  console.error(
    '[TunDee] auth callback received no token_hash and no code.',
    'Check that the email template links to this route with token_hash + type,',
    'not to Supabase /auth/v1/verify.',
    'params:', Array.from(searchParams.keys()).join(',') || '(none)',
  )
  return NextResponse.redirect(`${origin}/auth?error=no_credentials`)
}
