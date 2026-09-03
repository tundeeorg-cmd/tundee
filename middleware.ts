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

  // Every branch below forwards the original query string onto its
  // destination — an ad click that happens to land on a guarded route (e.g.
  // /tracker before signing in) must not lose fbclid/utm_* on the bounce to
  // /auth. forwardQuery() never overwrites a param the branch sets on
  // purpose (like `from=tracker`), it only fills in what's missing.
  if (session && request.nextUrl.pathname === '/auth') {
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
    response = NextResponse.redirect(url)
  } else if (!session && request.nextUrl.pathname.startsWith('/admin')) {
    // Protect /admin — must be logged in (email check happens client-side)
    const url = forwardQuery(new URL('/auth', request.url), request.nextUrl.searchParams)
    response = NextResponse.redirect(url)
  } else if (!session && request.nextUrl.pathname.startsWith('/tracker')) {
    // Protect /tracker — redirect to /auth if not logged in
    const url = new URL('/auth', request.url)
    url.searchParams.set('from', 'tracker')
    response = NextResponse.redirect(forwardQuery(url, request.nextUrl.searchParams))
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
