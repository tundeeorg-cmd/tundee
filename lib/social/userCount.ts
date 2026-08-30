/**
 * How many students have signed up — for the social-proof line on /start.
 *
 * **Server-only.** It reads `auth.users` through the GoTrue admin API, which needs the
 * service role key. Importing this from a client component would bundle that key into
 * the browser, so it is only ever imported by a server component.
 *
 * Rounded DOWN to the nearest hundred, so the number on the page is always one the
 * database can defend: 1,340 renders as "1,300+", never 1,400. The "+" stands for a real
 * remainder we are choosing not to state.
 *
 * Nothing renders below MIN_DISPLAYABLE. With roughly 70 accounts today, a truthful
 * "70 students" is an argument against signing up, not for it — on a site whose problem
 * is being mistaken for a scam, a small real number reads as a small real operation. So
 * the line stays hidden until the count can carry its own weight, and returns null rather
 * than a placeholder when the count is unavailable.
 */

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const CACHE_TAG = 'registered-user-count';
const REVALIDATE_SECONDS = 60 * 60;

/**
 * Below this the line renders as nothing at all. The single knob: raise or lower it here
 * and every caller follows, because no caller has its own idea of "enough".
 */
export const MIN_DISPLAYABLE = 1_000;

/** Granularity of the published figure. Rounding DOWN is what keeps it defensible. */
export const ROUND_TO = 100;

/** Exported for tests. Rounds down to ROUND_TO; null when below MIN_DISPLAYABLE. */
export function roundForDisplay(count: number | null): number | null {
  if (count === null || !Number.isFinite(count) || count < MIN_DISPLAYABLE) return null;
  return Math.floor(count / ROUND_TO) * ROUND_TO;
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
