/**
 * GET /api/auth/line/callback — completes one-tap LINE login.
 *
 * Supabase Auth has no native LINE provider, so this route bridges the two:
 *
 *   LINE code → LINE token → verified id_token (sub = LINE user id)
 *     → find-or-create the matching Supabase auth user (service role)
 *     → admin.generateLink() mints a one-time token
 *     → hand that token to /auth/callback, which establishes the session
 *
 * generateLink only *generates* — it never sends mail — so the synthetic address
 * used when LINE withholds the real one is never actually emailed.
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET
 *   LINE_AUTH_REDIRECT_URI
 *   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLineAuthRedirectUri } from '@/lib/line/redirectUri';
import { LINE_AUTH_STATE_COOKIE, LINE_AUTH_NEXT_COOKIE } from '@/lib/line/authCookies';

const TOKEN_URL  = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * Placeholder address for LINE users whose email we can't see. `.invalid` is
 * reserved by RFC 2606 and can never resolve, so these addresses are inert.
 * Once the LINE channel's Email address permission is approved, new logins pick
 * up the real address; existing rows keep working and can be migrated later.
 */
function syntheticEmail(lineUserId: string): string {
  return `line_${lineUserId.replace(/[^A-Za-z0-9_-]/g, '')}@line.tundee.invalid`;
}

interface LineIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Paginated lookup — supabase-js has no admin.getUserByEmail. */
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('[auth/line/callback] listUsers failed:', error.message);
      return null;
    }
    const hit = data.users.find(u => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  console.warn('[auth/line/callback] listUsers exhausted 20 pages without a match');
  return null;
}

/** Returns the Supabase user id for this LINE identity, creating one if needed. */
async function resolveUser(
  admin: SupabaseClient,
  identity: LineIdentity,
): Promise<{ id: string; email: string } | null> {
  // 1. Already linked? profiles.line_user_id is written on every LINE login and
  //    by the existing bot-linking flow, so returning users resolve in one hop.
  const { data: linked } = await admin
    .from('profiles')
    .select('id')
    .eq('line_user_id', identity.sub)
    .maybeSingle();

  if (linked?.id) {
    const { data, error } = await admin.auth.admin.getUserById(linked.id);
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email ?? syntheticEmail(identity.sub) };
    }
    // Auth user was deleted but the profile row lingered — fall through and
    // create a fresh account rather than failing the login.
    console.warn('[auth/line/callback] profile referenced a missing auth user:', linked.id);
  }

  // 2. Same email as an existing account (only possible once LINE grants email)
  const email = identity.email?.toLowerCase() ?? syntheticEmail(identity.sub);
  if (identity.email) {
    const existingId = await findUserIdByEmail(admin, email);
    if (existingId) return { id: existingId, email };
  }

  // 3. New account
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name:     identity.name ?? undefined,
      avatar_url:    identity.picture ?? undefined,
      provider:      'line',
      line_user_id:  identity.sub,
    },
  });

  if (error || !data.user) {
    // Race: another request created it between the lookup and this call.
    const existingId = await findUserIdByEmail(admin, email);
    if (existingId) return { id: existingId, email };
    console.error('[auth/line/callback] createUser failed:', error?.message);
    return null;
  }

  return { id: data.user.id, email };
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/auth?error=${encodeURIComponent(reason)}`);

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const err   = searchParams.get('error');

  const jar = await cookies();
  const savedState = jar.get(LINE_AUTH_STATE_COOKIE)?.value;
  const next = jar.get(LINE_AUTH_NEXT_COOKIE)?.value || '/scholarships';
  jar.delete(LINE_AUTH_STATE_COOKIE);
  jar.delete(LINE_AUTH_NEXT_COOKIE);

  if (err) {
    // Includes the ordinary "user tapped cancel" case
    console.error('[auth/line/callback] LINE returned an error:', err, searchParams.get('error_description'));
    return fail('line_cancelled');
  }
  if (!state || state !== savedState) return fail('line_state_mismatch');
  if (!code) return fail('line_no_code');

  const channelId     = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!channelId || !channelSecret || !supabaseUrl || !serviceKey) {
    console.error('[auth/line/callback] required env vars are missing');
    return fail('line_not_configured');
  }

  let redirectUri: string;
  try {
    redirectUri = getLineAuthRedirectUri();
  } catch (e) {
    console.error('[auth/line/callback] redirect_uri misconfigured:', e);
    return fail('line_not_configured');
  }

  // ── Exchange the code ──────────────────────────────────────────────────────
  const tokenRes = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     channelId,
      client_secret: channelSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[auth/line/callback] token exchange failed:', await tokenRes.text());
    return fail('line_token_exchange');
  }

  const tokens: { id_token?: string } = await tokenRes.json();
  if (!tokens.id_token) return fail('line_no_id_token');

  // ── Verify the ID token (LINE validates signature, issuer and audience) ────
  const verifyRes = await fetch(VERIFY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: channelId }),
  });

  if (!verifyRes.ok) {
    console.error('[auth/line/callback] id_token verify failed:', await verifyRes.text());
    return fail('line_verify_failed');
  }

  const payload: { sub?: string; email?: string; name?: string; picture?: string } = await verifyRes.json();
  if (!payload.sub) return fail('line_no_sub');

  const identity: LineIdentity = {
    sub:     payload.sub,
    email:   payload.email ?? null,
    name:    payload.name ?? null,
    picture: payload.picture ?? null,
  };

  // ── Find or create the Supabase user ───────────────────────────────────────
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = await resolveUser(admin, identity);
  if (!user) return fail('line_user_provisioning');

  // Remember the link so the next login resolves in one query, and so the
  // existing LINE reminder/bot pipeline can reach this student.
  const { error: linkError } = await admin
    .from('profiles')
    .upsert(
      { id: user.id, line_user_id: identity.sub, line_linked_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (linkError) {
    // Non-fatal: the user still gets a session, they just resolve by email next time.
    console.error('[auth/line/callback] profile link failed:', linkError.message);
  }

  // ── Mint a one-time token and hand off to the shared auth callback ────────
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type:  'magiclink',
    email: user.email,
  });

  if (linkErr || !link.properties?.hashed_token) {
    console.error('[auth/line/callback] generateLink failed:', linkErr?.message);
    return fail('line_session_failed');
  }

  const handoff = new URL(`${siteUrl}/auth/callback`);
  handoff.searchParams.set('token_hash', link.properties.hashed_token);
  handoff.searchParams.set('type', 'email');
  handoff.searchParams.set('next', next);

  return NextResponse.redirect(handoff.toString());
}
