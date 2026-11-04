/**
 * Shared by the server fetch (browseList.ts) and the browser fallback
 * (app/scholarships/ScholarshipsClient.tsx). No imports, on purpose: the client
 * bundle must not pull in next/cache or anything server-only through this file.
 */

/**
 * Exactly the union of three sets: every field the recommender scores on, every
 * field the card renders, and every field browse filters or sorts by.
 *
 * Dropping a column the SCORER reads would not throw — it would score as null
 * and quietly reorder the results, which in an experiment is indistinguishable
 * from a real treatment effect. So this list is not reasoned about, it is
 * proven: scripts/analysis/matchFixtures.test.ts ranks ten profiles across both
 * arms against the full column set and this one and asserts the ids AND scores
 * are identical. Run `npm run analyze` before changing anything here.
 *
 * `source_url` and `last_verified` are read by the provenance line on the card.
 */
export const TD_BROWSE_COLUMNS = [
  'scholarship_id',
  'scholarship_name_en', 'scholarship_name_th', 'scholarship_name',
  'funder_en', 'funder_th', 'funder',
  'funder_type', 'level', 'field_of_study',
  'award_value_tier',
  'renewable', 'bond_obligation',
  'region_eligibility', 'targets_low_income', 'welfare_card_priority',
  'income_cap_thb', 'num_recipients', 'min_gpa',
  'deadline_raw', 'deadline_date', 'deadline_is_rolling',
  'status', 'status_effective', 'application_url', 'application_link',
  'source_url', 'last_verified',
  'is_displayed',
] as const;

/** The browser fallback gives up after this, and shows an error with a retry. */
export const BROWSE_FETCH_TIMEOUT_MS = 8_000;
