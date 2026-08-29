/**
 * How many students have signed up — for the social-proof line on /start.
 *
 * **Server-only.** It reads `auth.users` through the GoTrue admin API, which needs the
 * service role key. Importing this from a client component would bundle that key into
 * the browser, so it is only ever imported by a server component.
 *
 * Rounded DOWN to the nearest ten, so the number on the page is always one the database
 * can defend: 74 renders as "70+", never 80. The "+" is honest here in a way it was not
 * on the scholarship count — it stands for a real remainder we are choosing not to state.
 *
 * Returns null rather than a placeholder when the count is unavailable or below the
 * rounding floor. A social-proof line that says "0+" or "10+" argues against itself; the
 * caller hides the line entirely instead.
 */

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const CACHE_TAG = 'registered-user-count';
const REVALIDATE_SECONDS = 60 * 60;

/** Below this the rounded figure is not worth showing. */
export const MIN_DISPLAYABLE = 20;

/** Exported for tests. Rounds down to the nearest ten; null when too small to show. */
export function roundForDisplay(count: number | null): number | null {
  if (count === null || !Number.isFinite(count) || count < MIN_DISPLAYABLE) return null;
  return Math.floor(count / 10) * 10;
}

async function fetchCount(): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // perPage: 1 — only `total` is wanted, so one user record crosses the wire instead
    // of all of them. These are minors' accounts; the smaller the payload the better.
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return null;
    const total = (data as { total?: number } | null)?.total;
    return typeof total === 'number' ? total : null;
  } catch {
    return null;
  }
}

/** Cached, rounded signup count. Null means "show nothing". */
export const getRegisteredUserCount = unstable_cache(
  async () => roundForDisplay(await fetchCount()),
  [CACHE_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
);
