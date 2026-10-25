/**
 * Reading and issuing the anonymous id on a request. SERVER ONLY.
 *
 * The cookie is httpOnly and set by the server, so the page never sees or chooses
 * its own id. Domain=.tundee.org in production so tundee.org and www.tundee.org
 * (which redirect to each other) share one id; no Domain locally, where a cookie
 * for tundee.org would simply be refused.
 */

import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, isAnonId } from './anonAssignment';

export function anonIdFromRequest(request: NextRequest): string | null {
  const v = request.cookies.get(ANON_COOKIE)?.value;
  return isAnonId(v) ? v : null;
}

export function mintAnonId(): string {
  return randomUUID();
}

export function setAnonCookie<T extends NextResponse>(response: T, anonId: string, host: string): T {
  const onTundee = /(^|\.)tundee\.org$/i.test(host.split(':')[0]);
  response.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   ANON_COOKIE_MAX_AGE,
    ...(onTundee ? { domain: '.tundee.org' } : {}),
  });
  return response;
}
