/**
 * POST /api/profile/baseline
 *
 * Writes an IMMUTABLE baseline snapshot to profile_baselines.
 * Called once when a user completes the profile setup wizard.
 * Subsequent calls are silently ignored (ON CONFLICT DO NOTHING).
 *
 * Uses service_role key to bypass RLS — the only way to write to a table
 * with no user-facing INSERT policy, enforcing immutability at the DB level.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // ── Auth: verify the caller is a logged-in user ───────────────────────────
  const userClient = await createServerSupabaseClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Build the admin client (bypasses RLS) ─────────────────────────────────
  const serviceUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const adminClient = createClient(serviceUrl, serviceKey)

  // ── Fetch the current profile to snapshot ────────────────────────────────
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('grade_level, gpa, province_id, income_bracket, fields_of_interest, welfare_card, ab_arm, research_opt_in')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // ── Write baseline — ON CONFLICT DO NOTHING ensures immutability ──────────
  const { error: insertErr } = await adminClient
    .from('profile_baselines')
    .insert({
      user_id:            user.id,
      grade_level:        profile.grade_level        ?? null,
      gpa:                profile.gpa                ?? null,
      province_id:        profile.province_id        ?? null,
      income_bracket:     profile.income_bracket     ?? null,
      fields_of_interest: profile.fields_of_interest ?? null,
      welfare_card:       profile.welfare_card       ?? false,
      ab_arm:             profile.ab_arm             ?? null,
      research_opt_in:    profile.research_opt_in    ?? false,
      snapshotted_at:     new Date().toISOString(),
    })

  // UNIQUE constraint violation = baseline already exists — that's fine
  if (insertErr && insertErr.code !== '23505') {
    console.error('[baseline] insert error:', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: user.id })
}
