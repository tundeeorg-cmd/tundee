/**
 * POST /api/meta/capi — server-side mirror of browser Pixel conversions.
 *
 * DORMANT UNTIL CONFIGURED: with META_CAPI_ACCESS_TOKEN unset this returns 204
 * immediately and logs nothing. The browser pixel works on its own today, and
 * CAPI switches on the moment the token is added — no code change, no deploy
 * beyond picking up the env var.
 *
 * De-duplication: the client mints one event_id per event, passes it to
 * fbq(..., { eventID }) and sends the same id here. Meta collapses the browser
 * and server copies into a single conversion.
 *
 * PII: the client sends none. This route reads the session itself and hashes
 * the email server-side, so raw identifiers never pass through client code or
 * a request body. Reaching this route implies consent — lib/analytics/meta.ts
 * refuses to call it otherwise.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GRAPH_API_VERSION = 'v21.0';

/** Only conversions are mirrored — see CAPI_EVENTS in lib/analytics/meta.ts. */
const ALLOWED_EVENTS = new Set(['Lead', 'CompleteRegistration', 'SubmitApplication']);

interface CapiRequestBody {
  eventName?: string;
  eventId?: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
}

/** Meta requires lowercase, trimmed, SHA-256 hex for all identifiers. */
function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function clientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? undefined;
}

export async function POST(request: NextRequest) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;

  // The dormant path. Deliberately silent: this is the normal state until a
  // token exists, and warning on every conversion would be pure noise.
  if (!accessToken || !pixelId) {
    return new NextResponse(null, { status: 204 });
  }

  let body: CapiRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { eventName, eventId, eventSourceUrl, customData } = body;
  if (!eventName || !ALLOWED_EVENTS.has(eventName) || !eventId) {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  // fbp/fbc are the pixel's own first-party cookies and are the strongest
  // non-PII match signal available; email is included only when the visitor is
  // signed in, and only ever as a hash.
  const userData: Record<string, unknown> = {};

  const fbp = request.cookies.get('_fbp')?.value;
  const fbc = request.cookies.get('_fbc')?.value;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent');
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) userData.em = [hashIdentifier(user.email)];
    if (user?.phone) userData.ph = [hashIdentifier(user.phone)];
  } catch {
    // Anonymous visitor or an unreadable session — send what we have.
  }

  // ── Payload ────────────────────────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name:       eventName,
        event_time:       Math.floor(Date.now() / 1000),
        event_id:         eventId,
        event_source_url: eventSourceUrl,
        action_source:    'website',
        user_data:        userData,
        custom_data:      customData ?? {},
      },
    ],
  };

  const testEventCode = process.env.META_TEST_EVENT_CODE;
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      // One line, only on a real rejection — enough to debug a bad token
      // without flooding logs on transient failures.
      console.warn('[meta/capi] rejected:', res.status, (await res.text()).slice(0, 200));
      return NextResponse.json({ ok: false }, { status: 202 });
    }
  } catch (e) {
    console.warn('[meta/capi] request failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true });
}
