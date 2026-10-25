/**
 * The columns /start reads to render scholarship cards.
 *
 * Deliberately the card's own set — the same list /scholarships selects for the
 * same TdScholarshipCard — and NOT the recommender's. /start's default list is
 * not ranked by any model: it is every open scholarship ordered by deadline, the
 * same for every visitor, so nothing here may feed a score. (The /scholarships
 * list is pinned by scripts/analysis/matchFixtures.test.ts because the scorer
 * reads it; this one is read by no scorer.)
 */
export const START_CARD_COLUMNS = [
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

export const START_CARD_SELECT = START_CARD_COLUMNS.join(', ');
