/**
 * GET /api/line/connect
 * Starts the LINE Login OAuth flow. Redirects the browser to LINE's
 * authorization endpoint. After the user authorizes, LINE redirects to
 * /api/line/callback with ?code=&state=.
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID   – your LINE Login channel ID
 *   NEXT_PUBLIC_SITE_URL    – e.g. https://tundee.org
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getLineRedirectUri, getLineBotPrompt } from '@/lib/line/redirectUri';

export const runtime = 'nodejs';

function randomHex(bytes = 16): string {
  // Use crypto.getRandomValues in edge, or crypto.randomBytes in node
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    return NextResponse.redirect(`${siteUrl}/auth?from=line-connect`);
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  if (!channelId) {
    return NextResponse.redirect(`${siteUrl}/tracker?line_error=not_configured`);
  }

  let callbackUrl: string;
  try {
    callbackUrl = getLineRedirectUri();
  } catch (e) {
    console.error('[line/connect] redirect_uri misconfigured:', e);
    return NextResponse.redirect(`${siteUrl}/tracker?line_error=redirect_uri_not_configured`);
  }

  const state = randomHex(16);
  const nonce = randomHex(16);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: callbackUrl,
    state,
    scope: 'profile openid',
    nonce,
    // bot_prompt=aggressive prompts the user to add the linked OA as a
    // friend — only has any effect if this Login channel has a Linked OA
    // configured; otherwise it's a silent no-op. See LINE_BOT_PROMPT.
    bot_prompt: getLineBotPrompt(),
  });

  const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?${params}`;

  // Store state in a short-lived cookie so the callback can verify it
  const jar = await cookies();
  jar.set('line_oauth_state', state, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });

  return NextResponse.redirect(lineUrl);
}
