/**
 * POST /api/auth/reset — send the "set your password" email.
 *
 * Two callers: the forgot-password form at /auth/reset, and — automatically —
 * app/api/auth/password when someone fails to sign in to an account that
 * already exists. The second is the important one: it means a student who
 * cannot get in never has to find this page at all.
 *
 * Always answers ok:true. Whether an address has an account is not disclosed
 * here — unlike the signup form, which necessarily reveals it, this endpoint
 * has no reason to and the users are minors.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sendSetPasswordEmail } from '@/lib/auth/recovery';
import { safeNext } from '@/lib/auth/resolveRedirect';

/** Per-instance sliding window, keyed by address. Mail leaves the building. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  let email = '';
  let next = '/scholarships';
  try {
    const body = await request.json();
    email = (body?.email ?? '').toString().trim().toLowerCase();
    next  = safeNext((body?.next ?? '').toString());
  } catch {
    // Falls through to the same ok:true below — a malformed body is not
    // something to explain to a student, and explaining it would leak shape.
  }

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !rateLimited(email)) {
    await sendSetPasswordEmail(email, siteUrl, next);
  }

  return NextResponse.json({ ok: true });
}
