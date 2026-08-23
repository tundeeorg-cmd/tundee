/**
 * The single source of truth for every scholarship count shown to the public.
 *
 * One rule: this uses the **same predicate as the public search page**
 * (`app/scholarships/page.tsx` → `td_scholarships` where `is_displayed = true`).
 * If a visitor cannot reproduce a number by counting search results, the number is
 * wrong — that is the failure mode TunDee exists to fix, so it must not appear in
 * TunDee's own marketing copy.
 *
 * Server-only. Counts are fetched with `head: true`, so no scholarship rows cross the
 * wire, and cached for an hour so the homepage does not query on every request.
 */

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

/** Must stay identical to the public browse query's filter. */
export const PUBLIC_SCHOLARSHIP_FILTER = { column: 'is_displayed', value: true } as const;

const CACHE_TAG = 'scholarship-counts';
const REVALIDATE_SECONDS = 60 * 60;   // hourly — well inside the "at least daily" rule

export interface ScholarshipStats {
  /** Scholarships a visitor can actually browse right now. */
  scholarships: number;
  /** Distinct funding organisations across those scholarships. */
  funders: number;
  /** False when the query failed, so callers can hide the numbers rather than show zero. */
  ok: boolean;
}

async function fetchStats(): Promise<ScholarshipStats> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // The anon key is correct here and the service role key would be wrong: these are
  // public numbers, and reading them through the same policy a visitor reads them
  // through is what keeps the count honest.
  if (!url || !key) return { scholarships: 0, funders: 0, ok: false };

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [countResult, funderResult] = await Promise.all([
    db.from('td_scholarships')
      .select('scholarship_id', { count: 'exact', head: true })
      .eq(PUBLIC_SCHOLARSHIP_FILTER.column, PUBLIC_SCHOLARSHIP_FILTER.value),
    // Distinct funders needs the values, not a count. Only this one column is read.
    db.from('td_scholarships')
      .select('funder, funder_th, funder_en')
      .eq(PUBLIC_SCHOLARSHIP_FILTER.column, PUBLIC_SCHOLARSHIP_FILTER.value),
  ]);

  if (countResult.error || funderResult.error || countResult.count === null) {
    return { scholarships: 0, funders: 0, ok: false };
  }

  return {
    scholarships: countResult.count,
    funders: countDistinctFunders(funderResult.data ?? []),
    ok: true,
  };
}

/** Exported for tests. A funder is named in up to three columns; the Thai name wins. */
export function countDistinctFunders(
  rows: Array<{ funder?: string | null; funder_th?: string | null; funder_en?: string | null }>,
): number {
  const names = new Set<string>();
  for (const row of rows) {
    const name = (row.funder_th ?? '').trim() || (row.funder ?? '').trim() || (row.funder_en ?? '').trim();
    if (name) names.add(name);
  }
  return names.size;
}

/**
 * Cached scholarship counts for public-facing copy.
 *
 * `unstable_cache` rather than a `fetch` revalidate: supabase-js does not go through
 * Next's fetch cache, so tagging the function is the only way the count is actually
 * cached rather than re-queried on every render.
 */
export const getScholarshipStats = unstable_cache(
  fetchStats,
  [CACHE_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
);
