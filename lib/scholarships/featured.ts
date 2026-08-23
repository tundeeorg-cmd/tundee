/**
 * The six scholarships shown on the homepage.
 *
 * This section rendered nothing at all until 2026-08-23. It queried the legacy
 * `scholarships` table — 102 rows, every one `is_active = false` since the migration to
 * `td_scholarships` — and then filtered client-side for active rows, so the grid was
 * always empty and silently so.
 *
 * **Selection rule: verified only, soonest deadline first.**
 *
 * `verification_status = 'verified'` is the filter. TunDee's claim is verified data, 72
 * of the 518 displayed rows carry it, and the homepage is the one place where showing
 * the checked ones rather than a random six is the honest choice.
 *
 * Deadline is the order. This was not available when the section was first rebuilt —
 * `deadline_date` was NULL on every row because the parser could not read the sheet's
 * "31-Aug-2026" format, so the section fell back to ranking by award size. With the
 * dates backfilled, urgency is the better axis by a distance: a scholarship closing in
 * five days is the one a student needs to see, and the section can now say so.
 *
 * **Thai funders still break ties.** Ranking on award size alone had filled all six slots
 * with international awards — Stanford, ETH Zurich, CUHK, Chevening — because full-ride
 * scholarships in this corpus are overwhelmingly foreign (451 of 518 displayed rows are
 * `International (open to Thais)`), and six foreign universities under the heading
 * ทุนแนะนำ, on a site whose eyebrow reads ทุนการศึกษาไทย, is the wrong first impression.
 * That ordering is a product decision confirmed by the project owner on 2026-08-23, so it
 * is kept — demoted below deadline rather than dropped. Urgency leads; among scholarships
 * closing on the same day, Thai funders come first. Four of the current candidates share
 * 2026-08-31, so the tiebreak does real work.
 *
 * Rows with **no** deadline sort last. A scholarship with no known closing date cannot
 * claim urgency, and putting it above one that closes this week would misinform the
 * reader the ordering exists to inform.
 *
 * `Opening Soon` rows are excluded — a student cannot act on them yet — and so is
 * anything whose deadline has already passed. `status_effective` is derived from the
 * sheet's text column rather than from dates (it needs both `open_date` and
 * `deadline_date`, and `open_date` is NULL corpus-wide), so it does not self-close: the
 * date filter is the only thing standing between a lapsed deadline and the homepage.
 */

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { PUBLIC_SCHOLARSHIP_FILTER } from './counts';

const CACHE_TAG = 'featured-scholarships';
const REVALIDATE_SECONDS = 60 * 60;
export const FEATURED_COUNT = 6;

/** Everything except `International (open to Thais)` is funded from within Thailand. */
const INTERNATIONAL_FUNDER = 'International (open to Thais)';

/** Biggest award first. Rows with no tier sort last rather than being dropped. */
const TIER_RANK: Record<string, number> = {
  full_ride:    0,
  full_tuition: 1,
  large:        2,
  medium:       3,
  small:        4,
  stipend_only: 5,
};

const COLUMNS = [
  'scholarship_id',
  'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
  'funder_en', 'funder_th', 'funder',
  'funder_type', 'level', 'field_of_study',
  'award_value_tier', 'award_amount_thb_numeric', 'award_type',
  'renewable', 'bond_obligation',
  'region_eligibility', 'targets_low_income', 'welfare_card_priority',
  'income_cap_thb', 'num_recipients', 'min_gpa', 'english_requirement',
  'open_date', 'date_confidence',
  'deadline_raw', 'deadline_date', 'deadline_is_rolling', 'deadline_note',
  'status', 'status_effective', 'application_url', 'application_link',
  'is_displayed', 'stale', 'source_language', 'translation_review',
].join(', ');

/**
 * Exported for tests. Sort keys, in order:
 *
 *   1. deadline, soonest first — undated rows last
 *   2. Thai funders before international, among rows closing the same day
 *   3. biggest award, as the final tiebreak
 *
 * The order of the keys is the whole design. Deadline leads because urgency is what a
 * featured slot is for; the other two only decide ties.
 */
export function rankForFeature(rows: TdScholarship[]): TdScholarship[] {
  // Sorts after every real date, so undated rows land at the end without needing a
  // separate pass or a sentinel date that could be mistaken for data.
  const NO_DEADLINE = '\uffff';
  const key = (row: TdScholarship): [string, number, number] => [
    row.deadline_date || NO_DEADLINE,
    row.funder_type === INTERNATIONAL_FUNDER ? 1 : 0,
    TIER_RANK[row.award_value_tier ?? ''] ?? Number.MAX_SAFE_INTEGER,
  ];
  return [...rows].sort((a, b) => {
    const [dateA, thaiA, tierA] = key(a);
    const [dateB, thaiB, tierB] = key(b);
    return dateA.localeCompare(dateB) || thaiA - thaiB || tierA - tierB;
  });
}

async function fetchFeatured(): Promise<TdScholarship[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Bangkok, not the server's timezone: a deadline is a local calendar date, and on a
  // UTC host "today" flips seven hours before it does for the student reading the page.
  const todayBkk = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await db
    .from('td_scholarships')
    .select(COLUMNS)
    .eq(PUBLIC_SCHOLARSHIP_FILTER.column, PUBLIC_SCHOLARSHIP_FILTER.value)
    .eq('verification_status', 'verified')
    .in('status_effective', ['Open', 'Closing Soon'])
    // A lapsed deadline must not be featured as urgent. `or` rather than a plain filter
    // because a NULL deadline is not an expired one — those rows stay eligible and simply
    // rank last.
    .or(`deadline_date.gte.${todayBkk},deadline_date.is.null`)
    .order('scholarship_id');

  // An empty list renders nothing, which is what this section did before. The difference
  // is that it is now the honest outcome of "no verified scholarship is open" rather than
  // a query pointed at the wrong table.
  if (error || !data) return [];

  return rankForFeature(data as unknown as TdScholarship[]).slice(0, FEATURED_COUNT);
}

export const getFeaturedScholarships = unstable_cache(
  fetchFeatured,
  [CACHE_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
);
