/**
 * GET /api/auth/line/start — begins one-tap LINE *login*.
 *
 * Distinct from /api/line/connect, which links a LINE account to an already
 * signed-in user for the messaging bot. This route is public: it turns a LINE
 * identity into a TunDee session (see ./callback).
 *
 * Required env vars:
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_AUTH_REDIRECT_URI
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { getLineAuthRedirectUri, getLineBotPrompt } from '@/lib/line/redirectUri';
import {
  LINE_AUTH_STATE_COOKIE,
  LINE_AUTH_NEXT_COOKIE,
  LINE_AUTH_COOKIE_MAX_AGE,
} from '@/lib/line/authCookies';

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';

/** Only same-origin paths may be used as a post-login destination. */
function safeNext(raw: string | null): string {
  if (!raw) return '/scholarships';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/scholarships';
  return raw;
}

export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    console.error('[auth/line/start] LINE_LOGIN_CHANNEL_ID is not set');
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

  let redirectUri: string;
  try {
    redirectUri = getLineAuthRedirectUri();
  } catch (e) {
    console.error('[auth/line/start] redirect_uri misconfigured:', e);
    return NextResponse.redirect(`${siteUrl}/auth?error=line_not_configured`);
  }

  const state = randomBytes(24).toString('base64url');

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', channelId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  // `email` is requested but only granted once the channel's Email address
  // permission is approved; the callback handles its absence.
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('bot_prompt', getLineBotPrompt());

  const response = NextResponse.redirect(authorizeUrl.toString());

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   LINE_AUTH_COOKIE_MAX_AGE,
  };
  response.cookies.set(LINE_AUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(LINE_AUTH_NEXT_COOKIE, next, cookieOptions);

  return response;
}
