/**
 * POST /api/client-log — a way to see what the browser saw.
 *
 * We have no visibility into failures that happen entirely in the browser, and
 * that gap has now cost two multi-hour debugging sessions. The save button on
 * /profile/setup works on a Mac and spins forever on Android Chrome, same user,
 * same profile, same deployment — and the only evidence either way lives in a
 * console on a phone in another country.
 *
 * This route is that evidence, forwarded. Everything it receives is written to
 * stderr with a stable prefix so it shows up in Vercel Logs alongside the
 * server-side lines, in the same stream, in order.
 *
 * ─── THIS IS A PUBLIC, UNAUTHENTICATED WRITE INTO OUR LOGS ──────────────────
 *
 * Which is exactly as dangerous as it sounds, so:
 *
 *   • the body is capped before it is parsed, not after;
 *   • every string is truncated individually — one 2KB field cannot crowd out
 *     the others;
 *   • per-IP rate limiting, matching app/api/preview-match;
 *   • newlines are stripped from `message` and `level`, so a crafted payload
 *     cannot forge extra log lines around itself;
 *   • `userId` is echoed as given and must be read as a claim, not a fact. It
 *     is a debugging hint, never an identity. Nothing here is trusted, stored,
 *     or acted on.
 *
 * It logs and returns 204. It never reads or writes the database.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';

/** Anything larger is a mistake or an attack; either way we do not want it. */
const MAX_BODY_BYTES = 8 * 1024;

const MAX_MESSAGE = 500;
const MAX_URL = 300;
const MAX_UA = 300;
const MAX_CONTEXT_CHARS = 2_000;

const RATE_LIMIT_WINDOW_MS = 60_000;
/** Generous: a page hitting a real error loop should still be able to report a
 *  burst, and a browser reporting 40 errors a minute is itself the signal. */
const RATE_LIMIT_MAX = 40;

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5_000) {
    hits.forEach((times: number[], key: string) => {
      if (times.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    });
  }
  return recent.length > RATE_LIMIT_MAX;
}

/** One line, no newlines, bounded. Control characters go too — a log reader
 *  should never receive an escape sequence from a stranger. */
function oneLine(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, max);
}

const LEVELS = new Set(['error', 'warn', 'info']);

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    // 204 rather than 429 on purpose. The client fires these from an error
    // handler; answering with an error invites a retry loop that reports the
    // failure to report, which is how a logging endpoint becomes the outage.
    return new NextResponse(null, { status: 204 });
  }

  // Checked before parsing. Reading an unbounded body into memory to discover
  // it is too big defeats the limit.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  const raw = await request.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const level   = LEVELS.has(String(body.level)) ? String(body.level) : 'error';
  const message = oneLine(body.message, MAX_MESSAGE);
  if (!message) return new NextResponse(null, { status: 204 });

  // The UA the browser reports, not the header: inside a webview they can
  // differ, and which webview this is happens to be the whole question.
  const userAgent = oneLine(body.userAgent, MAX_UA) || oneLine(request.headers.get('user-agent'), MAX_UA);
  const url       = oneLine(body.url, MAX_URL);
  const userId    = oneLine(body.userId, 64);

  let context = '';
  if (body.context !== undefined && body.context !== null) {
    try {
      context = JSON.stringify(body.context).slice(0, MAX_CONTEXT_CHARS);
    } catch {
      context = '[uncloneable]';
    }
  }

  // One line per report, prefix first, so `[client]` finds every one of them in
  // Vercel's search box and nothing else.
  console.error('[client]', JSON.stringify({
    level,
    message,
    userId: userId || null,
    url:    url || null,
    ua:     userAgent || null,
    context: context || null,
    ip,
    at: new Date().toISOString(),
  }));

  // 204: the browser has nothing to do with the answer, and a body would only
  // be something else to go wrong inside an error handler.
  return new NextResponse(null, { status: 204 });
}
