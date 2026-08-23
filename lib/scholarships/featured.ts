/**
 * The six scholarships shown on the homepage.
 *
 * This section rendered nothing at all until 2026-08-23. It queried the legacy
 * `scholarships` table — 102 rows, every one `is_active = false` since the migration to
 * `td_scholarships` — and then filtered client-side for active rows, so the grid was
 * always empty and silently so.
 *
 * **Selection rule: verified first, then by award size.** Two options were unavailable.
 * Sorting by deadline is impossible because `deadline_date` is NULL on all 518 displayed
 * rows (the dates exist only as unparsed text in `deadline_raw`, e.g. "31-Aug-2026").
 * Sorting by amount is nearly as bad: `award_amount_thb_numeric` is populated on 11 rows.
 *
 * Verification is what is left, and it is also the right axis. TunDee's claim is verified
 * data, 72 of the 518 displayed rows carry `verification_status = 'verified'`, and the
 * homepage is the one place where showing the checked ones rather than a random six is
 * the honest choice. A featured section is curated by definition; this is the curation
 * rule, stated.
 *
 * **Thai funders first.** Ranking on award size alone filled all six slots with
 * international awards — Stanford, ETH Zurich, CUHK, Chevening — because full-ride
 * scholarships in this corpus are overwhelmingly foreign (451 of 518 displayed rows are
 * `International (open to Thais)`). Six foreign universities under the heading ทุนแนะนำ,
 * on a site whose eyebrow reads ทุนการศึกษาไทย, is the wrong first impression and buries
 * the awards the mission statement is about: 31 verified, currently-open Thai-funded
 * scholarships exist, including Chulalongkorn's rural scholarship and Teacher Return to
 * Hometown. International awards still fill any slot Thai funders leave empty.
 *
 * `Opening Soon` rows are excluded — a student cannot act on them yet.
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
 * Exported for tests: Thai funders first, then biggest award, unranked last.
 *
 * The two keys are ordered deliberately. Funder origin outranks award size, so a medium
 * Thai award appears above a foreign full-ride — on this site that is the right trade.
 */
export function rankByAward(rows: TdScholarship[]): TdScholarship[] {
  const key = (row: TdScholarship): [number, number] => [
    row.funder_type === INTERNATIONAL_FUNDER ? 1 : 0,
    TIER_RANK[row.award_value_tier ?? ''] ?? Number.MAX_SAFE_INTEGER,
  ];
  return [...rows].sort((a, b) => {
    const [thaiA, tierA] = key(a);
    const [thaiB, tierB] = key(b);
    return thaiA - thaiB || tierA - tierB;
  });
}

async function fetchFeatured(): Promise<TdScholarship[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await db
    .from('td_scholarships')
    .select(COLUMNS)
    .eq(PUBLIC_SCHOLARSHIP_FILTER.column, PUBLIC_SCHOLARSHIP_FILTER.value)
    .eq('verification_status', 'verified')
    .in('status_effective', ['Open', 'Closing Soon'])
    .order('scholarship_id');

  // An empty list renders nothing, which is what this section did before. The difference
  // is that it is now the honest outcome of "no verified scholarship is open" rather than
  // a query pointed at the wrong table.
  if (error || !data) return [];

  return rankByAward(data as unknown as TdScholarship[]).slice(0, FEATURED_COUNT);
}

export const getFeaturedScholarships = unstable_cache(
  fetchFeatured,
  [CACHE_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
);
