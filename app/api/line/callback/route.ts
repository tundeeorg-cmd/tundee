/**
 * GET /api/line/callback — LINKS a LINE account to an existing signed-in user.
 *
 * NOT /api/auth/line/callback. There are two LINE callbacks in this app and they
 * are different features; someone tried to delete one as dead code on 31 Aug 2026.
 *
 *   this route                    /api/auth/line/callback
 *   ──────────────────────────    ──────────────────────────────────────────
 *   entry  /api/line/connect      entry  /api/auth/line/start
 *   from   the /tracker button    from   the sign-in page (AuthForm/AuthShell)
 *   needs  an existing session    needs  no session — it CREATES the account
 *   does   writes line_user_id    does   mints a Supabase user from a LINE sub,
 *          onto profiles                 with a synthetic @line.tundee.invalid
 *                                        address, then writes line_user_id too
 *   env    LINE_REDIRECT_URI      env    LINE_AUTH_REDIRECT_URI
 *
 * Both callback URLs must be registered separately in the LINE Developers
 * Console; LINE requires the redirect_uri to be byte-identical between the
 * authorize call and the token exchange.
 *
 * WHY THIS EXISTS WHEN LINE LOGIN ALREADY SETS line_user_id
 * ─────────────────────────────────────────────────────────
 * Because most users did not sign in with LINE. As of 31 Aug 2026, 12 of 79
 * accounts came from LINE login; the other 67 are Google or password accounts
 * with no LINE identity at all. app/api/cron/line-reminders pushes deadline
 * reminders to profiles.line_user_id, so this route is the only way that channel
 * can ever reach those 67. Deleting it would cap LINE reminders permanently at
 * the users who happened to sign in with LINE.
 *
 * It has no production usage yet — every line_user_id on file belongs to a
 * LINE-login account — which may mean nobody has found the button, or may mean
 * LINE_REDIRECT_URI was never registered in the LINE console. Worth confirming
 * before concluding the feature is unwanted.
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_LOGIN_CHANNEL_SECRET
 *   LINE_REDIRECT_URI       (registered as a Callback URL in the LINE console)
 *   NEXT_PUBLIC_SITE_URL
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getLineRedirectUri } from '@/lib/line/redirectUri';

const TOKEN_URL  = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export async function GET(request: NextRequest) {
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const redirect = (path: string) => NextResponse.redirect(`${siteUrl}${path}`);

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const err   = searchParams.get('error');
  const errDescription = searchParams.get('error_description');

  if (err) {
    console.error('[line/callback] LINE returned an error:', err, errDescription);
    return redirect(`/tracker?line_error=${encodeURIComponent(err)}`);
  }

  // Verify state
  const jar = await cookies();
  const savedState = jar.get('line_oauth_state')?.value;
  jar.delete('line_oauth_state');
  if (!state || state !== savedState) return redirect('/tracker?line_error=state_mismatch');
  if (!code) return redirect('/tracker?line_error=no_code');

  const channelId     = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return redirect('/tracker?line_error=not_configured');

  let redirectUri: string;
  try {
    redirectUri = getLineRedirectUri();
  } catch (e) {
    console.error('[line/callback] redirect_uri misconfigured:', e);
    return redirect('/tracker?line_error=redirect_uri_not_configured');
  }

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
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
    console.error('[line/callback] token exchange failed:', await tokenRes.text());
    return redirect('/tracker?line_error=token_exchange');
  }

  const tokens: { id_token?: string; access_token?: string } = await tokenRes.json();
  if (!tokens.id_token) return redirect('/tracker?line_error=no_id_token');

  // Verify ID token — returns the decoded payload including `sub` (LINE userId)
  const verifyRes = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: channelId }),
  });

  if (!verifyRes.ok) {
    console.error('[line/callback] id_token verify failed:', await verifyRes.text());
    return redirect('/tracker?line_error=verify_failed');
  }

  const payload: { sub?: string } = await verifyRes.json();
  const lineUserId = payload.sub;
  if (!lineUserId) return redirect('/tracker?line_error=no_sub');

  // Store line_user_id on the user's profile
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/auth?from=line-connect');

  const { error } = await supabase
    .from('profiles')
    .update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('[line/callback] profile update failed:', error);
    return redirect('/tracker?line_error=db_error');
  }

  return redirect('/tracker?line_connected=1');
}
