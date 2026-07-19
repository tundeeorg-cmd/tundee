/**
 * GET /api/line/callback
 * LINE Login OAuth callback. Exchanges the code for tokens, verifies the
 * ID token, and stores line_user_id on the authenticated user's profile.
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_LOGIN_CHANNEL_SECRET
 *   NEXT_PUBLIC_SITE_URL
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

const TOKEN_URL  = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export async function GET(request: NextRequest) {
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const redirect = (path: string) => NextResponse.redirect(`${siteUrl}${path}`);

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const err   = searchParams.get('error');

  if (err) return redirect(`/tracker?line_error=${encodeURIComponent(err)}`);

  // Verify state
  const jar = await cookies();
  const savedState = jar.get('line_oauth_state')?.value;
  jar.delete('line_oauth_state');
  if (!state || state !== savedState) return redirect('/tracker?line_error=state_mismatch');
  if (!code) return redirect('/tracker?line_error=no_code');

  const channelId     = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return redirect('/tracker?line_error=not_configured');

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${siteUrl}/api/line/callback`,
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
