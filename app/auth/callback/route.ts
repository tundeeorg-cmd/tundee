import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PREVIEW_PARAM } from '@/lib/preview/types'
import { CONSENT_PARAM } from '@/lib/consent'
import { resolveRedirect, safeNext, redirectWithConversion } from '@/lib/auth/resolveRedirect'

/**
 * Auth callback handles:
 *  • Google OAuth:      URL contains code
 *  • LINE login:        app/api/auth/line/callback hands off a token_hash here
 *  • Password recovery: the "set your password" link carries a token_hash too
 *
 * It no longer handles magic-link sign-in, because there is no longer a magic
 * link: email accounts sign in with a password at /api/auth/password, with no
 * email round trip at all. The token_hash branch stays because two other flows
 * depend on it — the LINE bridge mints one internally, and password recovery
 * sends one by email.
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
