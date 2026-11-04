/**
 * The list behind /scholarships: every displayed scholarship, fetched ON THE
 * SERVER and cached, so the page's first paint already has cards.
 *
 * WHY (measured 2026-11-04 on production, signed out):
 *   • the HTML arrived in 0.14 s from Vercel's cache — but held only skeletons;
 *   • the cards waited for 18 JavaScript files, 268 KB gzipped, to download and
 *     run, and only THEN did the browser start this query;
 *   • the query itself was fast: 240 rows, 37 KB gzipped, 0.3–0.9 s.
 * So the wait was the JavaScript in front of the query, not the query. On a
 * low-end phone on mobile data that is several seconds of empty skeleton.
 * Fetching here moves the query off the critical path entirely.
 *
 * Not paginated, deliberately: search, every filter, the sort and the
 * recommender (matches tab) all run over the full list in the browser, and the
 * full list is 37 KB. Paging it would turn each keystroke into a round trip.
 *
 * Cached for an hour and refreshed sooner on change: the nightly status cron and
 * the admin edit/import routes call revalidateBrowseList().
 */

import { unstable_cache, revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { TdScholarship } from './types';

// The column list and the browser timeout live in browseColumns.ts, which has no
// server imports, so the client half can use them without pulling next/cache in.
export { TD_BROWSE_COLUMNS, BROWSE_FETCH_TIMEOUT_MS } from './browseColumns';
import { TD_BROWSE_COLUMNS } from './browseColumns';

export const BROWSE_LIST_TAG = 'browse-scholarships';
export const BROWSE_REVALIDATE_SECONDS = 60 * 60;

async function fetchBrowseList(): Promise<TdScholarship[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  // The anon key, not the service role: this is the public list, read through
  // the same row-level policy a visitor reads it through.
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from('td_scholarships')
    .select(TD_BROWSE_COLUMNS.join(', '))
    .eq('is_displayed', true)
    .order('scholarship_name_en');
  // Throwing keeps a failed fetch OUT of the cache, so the next request retries
  // instead of serving an empty list for an hour.
  if (error) throw new Error(`browse list: ${error.message}`);
  return (data ?? []) as unknown as TdScholarship[];
}

const cachedBrowseList = unstable_cache(fetchBrowseList, ['browse-scholarships-v1'], {
  tags: [BROWSE_LIST_TAG],
  revalidate: BROWSE_REVALIDATE_SECONDS,
});

/**
 * For the server page. Never throws: on failure it returns [] and the page's
 * client half fetches the list itself (with a timeout and a retry button).
 */
export async function getBrowseList(): Promise<TdScholarship[]> {
  try {
    return await cachedBrowseList();
  } catch (e) {
    console.error('[scholarships] server fetch failed, client will retry:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** Call after anything changes which scholarships are displayed, or what they say. */
export function revalidateBrowseList(): void {
  try {
    revalidateTag(BROWSE_LIST_TAG);
    revalidatePath('/scholarships');
  } catch {
    // Outside a request (a script, a test): nothing cached to clear.
  }
}
