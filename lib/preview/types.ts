/**
 * Shared contract for the logged-out /start preview matcher.
 *
 * The three inputs are deliberately the same three values /profile/setup stores
 * (`grade_level`, `gpa`, `province_id`) so a visitor's preview answers can be
 * replayed into the signup wizard without any re-typing.
 */

import { PROVINCES_TH } from '@/lib/translations';

/** Cookie carrying the visitor's answers across the signup redirect. */
export const PREVIEW_COOKIE = 'tundee_preview';

/**
 * 24 hours. Was 30 minutes, which expired mid-signup: an OAuth detour plus any
 * hesitation lost the answers, and /profile/setup then re-asked all three — the
 * bug this exists to remove. The payload is non-sensitive (education level, GPA,
 * province) and is re-validated through parsePreviewInput on every read, so a
 * forged value can only decode to something the visitor could have typed anyway.
 */
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 24;

/**
 * Query-param name carrying the same answers through an email magic link, which
 * is frequently opened in a different browser from the one that set the cookie.
 */
export const PREVIEW_PARAM = 'p';

/** How many full, unlocked cards a logged-out visitor sees. */
export const PREVIEW_TOP_N = 3;

/** Upper bound on matches computed per preview request. */
export const PREVIEW_LIMIT = 50;

/** How many near-miss scholarships to show when nothing matches exactly. */
export const PREVIEW_BROADENED_N = 5;

/**
 * Education levels offered on /start. Values are byte-identical to
 * GRADE_OPTIONS in app/profile/setup/page.tsx — do not diverge.
 */
export const PREVIEW_LEVELS = [
  { value: 'M1-M3',      th: 'ม.1–3' },
  { value: 'M4-M6',      th: 'ม.4–6' },
  { value: 'vocational', th: 'ปวช./ปวส.' },
  { value: 'uni',        th: 'ปริญญาตรี' },
  { value: 'graduate',   th: 'ปริญญาโท/เอก' },
] as const;

const VALID_LEVELS = new Set<string>(PREVIEW_LEVELS.map(l => l.value));
const VALID_PROVINCES = new Set<string>(PROVINCES_TH);

export interface PreviewInput {
  level: string;
  province: string;
  /**
   * Declared monthly household income bracket, 1–7 (PREREG §5.2).
   *
   * Previously the preview hardcoded income_bracket: 4 for everyone. That is
   * roughly THB 15–20k/month, so a low-income rural student was matched as if
   * they were middle-income — and the scholarships aimed squarely at them
   * (targets_low_income, income_cap_thb) were scored as if they did not
   * qualify. Asking is both a better preview and the stratification variable
   * the study needs.
   */
  income: number;
  /**
   * Optional. GPA gates scholarships through min_gpa, so when it is absent we
   * cannot honestly claim a student qualifies for a GPA-restricted award. The
   * route excludes those rather than assuming a passing grade, which keeps the
   * match count a floor rather than an overclaim.
   */
  gpa: number | null;
}

/** One preview card — a real, renderable scholarship. */
export interface PreviewMatchCard {
  scholarship_id: string;
  name: string;
  funder: string;
  award_tier: string | null;
  award_amount: string | null;
  deadline_date: string | null;
  deadline_is_rolling: boolean;
  status: string | null;
  /**
   * The funder's application page, or null when the row has neither URL.
   *
   * Deliberately exposed to logged-out visitors: a card that cannot be acted on is a
   * screenshot, not a match. It does mean a visitor can apply without ever signing up —
   * accepted, because a student who gets a scholarship without an account is still the
   * outcome this exists for.
   */
  apply_url: string | null;
  /** Thai "why you match" sentence straight from the recommender. */
  explanation: string;
  reasons: string[];
  score: number;
}

export interface PreviewResponse {
  preview: PreviewMatchCard[];
  /** Matches beyond the previewed ones — the number behind the signup gate. */
  lockedCount: number;
  /** Total eligible matches (preview + locked). */
  total: number;
  /**
   * True when no scholarship matched exactly and the list was widened by
   * relaxing the GPA rule, so the UI can label the results honestly.
   */
  broadened: boolean;
}

/**
 * Validates an untrusted request body. Returns null when anything is off —
 * callers respond 400 without echoing the input back.
 */
export function parsePreviewInput(raw: unknown): PreviewInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;

  const level = typeof body.level === 'string' ? body.level.trim() : '';
  if (!VALID_LEVELS.has(level)) return null;

  const province = typeof body.province === 'string' ? body.province.trim() : '';
  if (!VALID_PROVINCES.has(province)) return null;

  const incomeRaw = typeof body.income === 'number' ? body.income : parseInt(String(body.income ?? ''), 10);
  if (!Number.isInteger(incomeRaw) || incomeRaw < 1 || incomeRaw > 7) return null;

  // GPA is optional. An absent or unparseable value is null, NOT a default:
  // silently substituting a grade would make the match claim untrue.
  let gpa: number | null = null;
  if (body.gpa !== null && body.gpa !== undefined && body.gpa !== '') {
    const parsed = typeof body.gpa === 'number' ? body.gpa : parseFloat(String(body.gpa));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) return null;
    gpa = Math.round(parsed * 100) / 100;
  }

  return { level, province, income: incomeRaw, gpa };
}

/** Serializes the visitor's answers for the cookie (base64url-encoded JSON). */
export function encodePreviewInput(input: PreviewInput): string {
  const json = JSON.stringify([input.level, input.gpa, input.province, input.income]);
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of encodePreviewInput. Returns null on any tampering or drift. */
export function decodePreviewInput(value: string | null | undefined): PreviewInput | null {
  if (!value) return null;
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(b64, 'base64').toString('utf8')
      : decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    // Length 3 is the pre-income format. A cookie issued before this change is
    // still in some visitor's browser for up to PREVIEW_COOKIE_MAX_AGE, so it
    // is read rather than discarded — the income question is simply re-asked.
    if (parsed.length === 3) {
      return parsePreviewInput({ level: parsed[0], gpa: parsed[1], province: parsed[2], income: 4 });
    }
    if (parsed.length !== 4) return null;
    return parsePreviewInput({
      level: parsed[0], gpa: parsed[1], province: parsed[2], income: parsed[3],
    });
  } catch {
    return null;
  }
}
