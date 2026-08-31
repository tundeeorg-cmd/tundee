/**
 * GET /api/auth/line/callback — completes one-tap LINE login.
 *
 * NOT /api/line/callback, which links a LINE account to a user who is ALREADY
 * signed in (entry: /api/line/connect, from the /tracker button, env
 * LINE_REDIRECT_URI). This route creates the account; that one decorates it.
 * Both write profiles.line_user_id, which is why the two are easy to confuse —
 * see the table in app/api/line/callback/route.ts.
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
import {
  LINE_AUTH_STATE_COOKIE,
  LINE_AUTH_NEXT_COOKIE,
  LINE_AUTH_NONCE_COOKIE,
  LINE_AUTH_VERIFIER_COOKIE,
  LINE_AUTH_PREVIEW_COOKIE,
  LINE_AUTH_UTM_COOKIE,
  LINE_AUTH_RETRY_COOKIE,
} from '@/lib/line/authCookies';
import { syntheticEmail } from '@/lib/line/syntheticEmail';
import { PREVIEW_PARAM } from '@/lib/preview/types';
import { CONSENT_PARAM, CONSENT_VERSION } from '@/lib/consent';
import { findUserByEmail } from '@/lib/auth/adminUsers';

const TOKEN_URL  = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';



interface LineIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
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
    const existing = await findUserByEmail(admin, email);
    if (existing) return { id: existing.id, email };
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
    const existing = await findUserByEmail(admin, email);
    if (existing) return { id: existing.id, email };
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
  const savedState    = jar.get(LINE_AUTH_STATE_COOKIE)?.value;
  const savedNonce    = jar.get(LINE_AUTH_NONCE_COOKIE)?.value;
  const savedVerifier = jar.get(LINE_AUTH_VERIFIER_COOKIE)?.value;
  const savedPreview  = jar.get(LINE_AUTH_PREVIEW_COOKIE)?.value;
  const savedUtm      = jar.get(LINE_AUTH_UTM_COOKIE)?.value;
  const next = jar.get(LINE_AUTH_NEXT_COOKIE)?.value || '/scholarships';
  jar.delete(LINE_AUTH_STATE_COOKIE);
  jar.delete(LINE_AUTH_NEXT_COOKIE);
  jar.delete(LINE_AUTH_NONCE_COOKIE);
  jar.delete(LINE_AUTH_VERIFIER_COOKIE);
  jar.delete(LINE_AUTH_PREVIEW_COOKIE);
  jar.delete(LINE_AUTH_UTM_COOKIE);

  // From the cookie, not the query string: LINE returns to the Callback URL
  // registered in its console exactly as registered, so nothing we appended on
  // the way out comes back.
  const isRetry = jar.get(LINE_AUTH_RETRY_COOKIE)?.value === '1';
  jar.delete(LINE_AUTH_RETRY_COOKIE);

  if (err) {
    // Includes the ordinary "user tapped cancel" case
    console.error('[auth/line/callback] LINE returned an error:', err, searchParams.get('error_description'));
    return fail('line_cancelled');
  }

  /*
   * A state mismatch is the documented symptom of auto login failing part-way:
   * LINE returns a code that does not work and a state that does not match, and
   * says outright that this is indistinguishable from a CSRF attempt.
   *
   * Both readings get the same safe response — throw the credentials away and
   * start over — but the previous version stopped there, sending the student
   * back to /auth with "LINE sign-in failed, please try again". Tapping LINE
   * again reissued exactly the same request, which failed exactly the same way.
   * A closed loop, on the method that is supposed to be one tap.
   *
   * The retry is LINE's own prescribed remedy: go round once more with auto
   * login disabled. Once only — `retry=1` on the way in means we have already
   * spent it, and a second failure is a real failure.
   */
  if (!state || state !== savedState) {
    if (!isRetry) {
      const again = new URL(`${siteUrl}/api/auth/line/start`);
      again.searchParams.set('next', next);
      again.searchParams.set('retry', '1');
      again.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);
      if (savedPreview) again.searchParams.set(PREVIEW_PARAM, savedPreview);
      if (savedUtm) again.searchParams.set('utm_campaign', savedUtm);
      console.warn('[auth/line/callback] state mismatch — retrying with disable_auto_login');
      return NextResponse.redirect(again.toString());
    }
    return fail('line_state_mismatch');
  }

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
      // The authorization code crosses a redirect chain we do not control.
      // PKCE binds it to the browser that started the flow, so a code captured
      // in transit cannot be exchanged from anywhere else.
      ...(savedVerifier ? { code_verifier: savedVerifier } : {}),
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
    // LINE checks the nonce itself when we supply it, and rejects the token if
    // it does not match. Without this nothing tied the identity LINE returns to
    // the request that asked for it.
    body: new URLSearchParams({
      id_token:  tokens.id_token,
      client_id: channelId,
      ...(savedNonce ? { nonce: savedNonce } : {}),
    }),
  });

  if (!verifyRes.ok) {
    console.error('[auth/line/callback] id_token verify failed:', await verifyRes.text());
    return fail('line_verify_failed');
  }

  const payload: { sub?: string; email?: string; name?: string; picture?: string; nonce?: string } = await verifyRes.json();
  if (!payload.sub) return fail('line_no_sub');

  // Belt and braces: LINE has already rejected a mismatched nonce above, but an
  // echoed value that disagrees with ours means something is wrong that we
  // should not sign a session over.
  if (savedNonce && payload.nonce && payload.nonce !== savedNonce) {
    console.error('[auth/line/callback] nonce mismatch');
    return fail('line_nonce_mismatch');
  }

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
  // The guest session and campaign, forwarded rather than left to the cookie
  // jar. /auth/callback prefers the param for exactly this reason: a student who
  // escaped a webview into Chrome has no TunDee cookies in that browser, and
  // without these the merge would re-ask their grade, GPA and province and
  // record the signup as 'organic'.
  if (savedPreview) handoff.searchParams.set(PREVIEW_PARAM, savedPreview);
  if (savedUtm) handoff.searchParams.set('utm_campaign', savedUtm);
  handoff.searchParams.set(CONSENT_PARAM, CONSENT_VERSION);

  return NextResponse.redirect(handoff.toString());
}
