/**
 * Shared shapes + pure helpers for the /admin Awards ("ผลการได้ทุน") section.
 * Kept out of the route handlers so the filter and rate logic is testable
 * without a live DB.
 */

export const OUTCOME_STATUSES = [
  'applied', 'awarded', 'waiting', 'not_applied', 'rejected', 'unknown',
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_SOURCES = ['self', 'line', 'admin', 'web', 'partner'] as const;
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number];

/** Bilingual labels — /admin has no TH/EN toggle, so both are shown inline. */
export const STATUS_LABELS: Record<OutcomeStatus, { th: string; en: string }> = {
  applied:     { th: 'สมัครแล้ว',      en: 'Applied' },
  awarded:     { th: 'ได้รับทุน',       en: 'Awarded' },
  waiting:     { th: 'รอผล',           en: 'Waiting' },
  not_applied: { th: 'ไม่ได้สมัคร',     en: 'Not applied' },
  rejected:    { th: 'ไม่ได้รับทุน',    en: 'Rejected' },
  unknown:     { th: 'ไม่ทราบ',        en: 'Unknown' },
};

export const SOURCE_LABELS: Record<OutcomeSource, { th: string; en: string }> = {
  self:    { th: 'นักเรียนแจ้งเอง', en: 'Self' },
  line:    { th: 'LINE',           en: 'LINE' },
  admin:   { th: 'แอดมิน',          en: 'Admin' },
  web:     { th: 'เว็บ',            en: 'Web' },
  partner: { th: 'พาร์ทเนอร์',       en: 'Partner' },
};

export interface AwardRow {
  id:               string;
  user_id:          string;
  scholarship_id:   string;
  scholarship_name: string | null;
  status:           OutcomeStatus;
  amount_thb:       number | null;
  consent_research: boolean;
  reported_at:      string;
  source:           OutcomeSource;
  note:             string | null;
  display_name:     string | null;
  province:         string | null;
  region:           string | null;
  education_level:  string | null;
  /** Joined in by the API route from auth.users — never stored in outcomes. */
  email?:           string | null;
}

export interface AwardStats {
  /** Rows in auth.users — every account that exists, however far it got. */
  total_accounts:     number;
  /** Rows in profiles — accounts that finished onboarding. Always ≤ total_accounts. */
  total_profiles:     number;
  /** profiles ÷ accounts, 0–1. Null when there are no accounts yet. */
  profile_completion_rate: number | null;
  total_apply_clicks: number;
  total_awarded:      number;
  total_thb_awarded:  number;
  /** awarded ÷ apply-clicks, 0–1. Null when there are no apply-clicks yet. */
  award_rate:         number | null;
}

export interface AwardFilters {
  status?:   string | null;
  province?: string | null;
  region?:   string | null;
  from?:     string | null;   // ISO date, inclusive
  to?:       string | null;   // ISO date, inclusive
  search?:   string | null;
}

/** awarded ÷ apply-clicks. Null rather than 0 or NaN when the denominator is 0. */
export function awardRate(awarded: number, applyClicks: number): number | null {
  if (!applyClicks) return null;
  return awarded / applyClicks;
}

/**
 * profiles ÷ accounts — what share of people who signed up finished onboarding.
 *
 * These were one tile reading "Signups", counting `profiles`. That silently reported
 * completed onboardings as signups and hid a third of the user base: 30 profiles
 * against 62 auth accounts. The drop-off is real data about the wizard, so it is
 * surfaced rather than reconciled away.
 *
 * Clamped at 1: a profile row whose auth user was deleted would otherwise produce a
 * completion rate above 100%, which is a data problem to investigate, not a number to
 * print on a dashboard.
 */
export function profileCompletionRate(profiles: number, accounts: number): number | null {
  if (!accounts) return null;
  return Math.min(profiles / accounts, 1);
}

export function formatAwardRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

/** Validate + normalise query-string filters. Unknown values are dropped, not rejected. */
export function normaliseFilters(params: URLSearchParams): AwardFilters {
  const pick = (k: string) => {
    const v = params.get(k)?.trim();
    return v ? v : null;
  };
  const status = pick('status');
  return {
    status:   status && (OUTCOME_STATUSES as readonly string[]).includes(status) ? status : null,
    province: pick('province'),
    region:   pick('region'),
    from:     /^\d{4}-\d{2}-\d{2}$/.test(pick('from') ?? '') ? pick('from') : null,
    to:       /^\d{4}-\d{2}-\d{2}$/.test(pick('to') ?? '')   ? pick('to')   : null,
    search:   pick('search'),
  };
}

/**
 * Free-text search across scholarship name/id and student display name.
 * Applied in TypeScript rather than SQL so it can also match the email, which
 * lives in auth.users and is merged in after the query.
 */
export function matchesSearch(row: AwardRow, search: string | null | undefined): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return [row.scholarship_name, row.scholarship_id, row.display_name, row.email]
    .some(v => (v ?? '').toLowerCase().includes(q));
}
