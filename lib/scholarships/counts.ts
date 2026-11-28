/**
 * The single source of truth for every scholarship count shown to the public:
 * homepage hero and stats bar, /about, /start, and the site-wide meta description.
 *
 * One rule, shared with the Browse page and the Admin "Displayed" card:
 * status_effective ∈ PUBLIC_STATUSES (lib/scholarships/publicRule.ts). If a visitor
 * cannot reproduce a number by counting search results, the number is wrong.
 *
 * Counted in SQL by get_public_scholarship_stats() (scripts/20261128_public_scholarship_stats.sql).
 * Until that function exists the fallback counts with head:true and pages through the
 * funder column, so it is never capped at PostgREST's 1000-row limit.
 *
 * Freshness: cached under SCHOLARSHIP_STATS_TAG for 30 minutes, and invalidated at once
 * by revalidateBrowseList(), which the import, the nightly status recompute and the
 * admin edit/bulk routes all call.
 */

import { unstable_cache } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_STATUSES } from './publicRule';

export const SCHOLARSHIP_STATS_TAG = 'scholarship-stats';
const REVALIDATE_SECONDS = 30 * 60;   // + the pages' own 30 min ⇒ at most 1 h stale
const PAGE_SIZE = 1000;

export interface ScholarshipStats {
  /** Scholarships a visitor can actually browse right now. */
  scholarships: number;
  /** Distinct funding organisations across those scholarships. */
  funders: number;
  /** False when the query failed, so callers show the fallback copy rather than zero. */
  ok: boolean;
}

const FAILED: ScholarshipStats = { scholarships: 0, funders: 0, ok: false };

async function fetchStats(): Promise<ScholarshipStats> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // The anon key, not the service role: these are public numbers, read through the
  // same row-level policy a visitor reads them through.
  if (!url || !key) return FAILED;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rpc = await db.rpc('get_public_scholarship_stats');
  if (!rpc.error) {
    const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { scholarships?: number | string; funders?: number | string } | null;
    const scholarships = Number(row?.scholarships);
    const funders = Number(row?.funders);
    if (Number.isFinite(scholarships) && scholarships > 0 && Number.isFinite(funders)) {
      return { scholarships, funders, ok: true };
    }
    return FAILED;
  }
  return fetchStatsWithoutRpc(db);
}

/** Used only until the SQL function is applied. Same rule, same funder key. */
async function fetchStatsWithoutRpc(db: SupabaseClient): Promise<ScholarshipStats> {
  const countResult = await db.from('td_scholarships')
    .select('scholarship_id', { count: 'exact', head: true })
    .in('status_effective', [...PUBLIC_STATUSES]);
  if (countResult.error || !countResult.count) return FAILED;

  const rows: FunderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('td_scholarships')
      .select('funder, funder_th, funder_en')
      .in('status_effective', [...PUBLIC_STATUSES])
      .order('scholarship_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return FAILED;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { scholarships: countResult.count, funders: countDistinctFunders(rows), ok: true };
}

type FunderRow = { funder?: string | null; funder_th?: string | null; funder_en?: string | null };

/**
 * Exported for tests. Mirrors the SQL function's key: Funder EN, else Funder TH, else
 * the legacy column; trimmed, case-insensitive; blanks ignored.
 */
export function countDistinctFunders(rows: FunderRow[]): number {
  const names = new Set<string>();
  for (const row of rows) {
    const name = (row.funder_en ?? '').trim() || (row.funder_th ?? '').trim() || (row.funder ?? '').trim();
    if (name) names.add(name.toLowerCase());
  }
  return names.size;
}

/**
 * Cached scholarship counts for public-facing copy.
 *
 * `unstable_cache` rather than a `fetch` revalidate: supabase-js does not go through
 * Next's fetch cache, so tagging the function is the only way it is cached at all.
 * Throwing would keep a failure out of the cache; returning FAILED is cached, so the
 * cache key below is wrapped to retry failures on the next request instead.
 */
const cachedStats = unstable_cache(
  async () => {
    const stats = await fetchStats();
    if (!stats.ok) throw new Error('scholarship stats unavailable');
    return stats;
  },
  ['scholarship-stats-v2'],
  { revalidate: REVALIDATE_SECONDS, tags: [SCHOLARSHIP_STATS_TAG] },
);

export async function getScholarshipStats(): Promise<ScholarshipStats> {
  try {
    return await cachedStats();
  } catch {
    return FAILED;
  }
}
