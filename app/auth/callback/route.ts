import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/scholarships'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // Check if user has a profile already
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.session.user.id)
        .maybeSingle()

      // New user → profile setup; returning user → scholarships or requested next
      const redirectTo = profile ? next : '/profile/setup'
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Something went wrong — send to auth with error hint
  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
}
