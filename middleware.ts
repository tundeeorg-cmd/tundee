import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { forwardQuery, trackingCookiesToSet } from '@/lib/tracking/clickIds'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session keeps the user logged in across page navigations
  const { data: { session } } = await supabase.auth.getSession()

  // getSession() only reads the cookie; it never asks Supabase whether that
  // session is still alive. On /auth that matters: trusting a dead cookie
  // bounced the student to `next`, where the page (which does ask) showed them
  // signed out with a "เข้าสู่ระบบ" link back to /auth — a loop with no way to
  // sign in (seen on a phone, 15 Nov 2026). So on /auth only, confirm with
  // getUser(), and clear a dead session instead of redirecting on it.
  let signedIn = !!session
  if (session && request.nextUrl.pathname === '/auth') {
    const { data: { user } } = await supabase.auth.getUser()
    signedIn = !!user
    if (!user) await supabase.auth.signOut({ scope: 'local' })
  }

  /**
   * A redirect that keeps whatever cookies the Supabase client just set on
   * `response` (a refreshed session, or the clearing above). A bare
   * NextResponse.redirect() dropped them: the browser kept a refresh token
   * Supabase had already rotated, and the session died on its next use.
   */
  const redirectTo = (url: URL) => {
    const r = NextResponse.redirect(url)
    for (const c of response.cookies.getAll()) r.cookies.set(c)
    return r
  }

  // Every branch below forwards the original query string onto its
  // destination — an ad click that happens to land on a guarded route (e.g.
  // /tracker before signing in) must not lose fbclid/utm_* on the bounce to
  // /auth. forwardQuery() never overwrites a param the branch sets on
  // purpose (like `from=tracker`), it only fills in what's missing.
  if (signedIn && request.nextUrl.pathname === '/auth') {
    // Redirect logged-in users away from /auth — honouring ?next= so someone
    // who matched on /start and is already signed in still lands on their
    // results.
    const next = request.nextUrl.searchParams.get('next')
    const destination = next && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/scholarships'
    // `next` has already served its purpose above (chosen the destination, or
    // been rejected as unsafe) — forward everything else, but never carry the
    // raw value forward too, or a rejected off-site `next` would still land
    // in the redirect's own query string.
    const paramsToForward = new URLSearchParams(request.nextUrl.searchParams)
    paramsToForward.delete('next')
    const url = forwardQuery(new URL(destination, request.url), paramsToForward)
    response = redirectTo(url)
  } else if (!session && request.nextUrl.pathname.startsWith('/admin')) {
    // Protect /admin — must be logged in (email check happens client-side)
    const url = forwardQuery(new URL('/auth', request.url), request.nextUrl.searchParams)
    response = redirectTo(url)
  } else if (!session && request.nextUrl.pathname.startsWith('/tracker')) {
    // Protect /tracker — redirect to /auth if not logged in
    const url = new URL('/auth', request.url)
    url.searchParams.set('from', 'tracker')
    response = redirectTo(forwardQuery(url, request.nextUrl.searchParams))
  }

  // Capture fbclid/ttclid into first-party cookies on every request, whether
  // it passes through or gets redirected above — see lib/tracking/clickIds.ts
  // for why this has to happen here rather than in the pixel script.
  for (const cookie of trackingCookiesToSet(request.nextUrl, Date.now())) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
