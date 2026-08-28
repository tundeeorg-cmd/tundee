/**
 * Landing-page headline variants, selected by /start?v=<key>.
 *
 * RESEARCH BOUNDARY — read this before wiring anything to it.
 *
 * landing_variant is a RECRUITMENT-side manipulation and nothing more. It is
 * recorded as a covariate (PREREG §5.8) and must never influence, or be
 * influenced by, ranking_variant — the study's actual treatment. Two separate
 * things that would quietly destroy the experiment if they touched:
 *
 *   landing_variant  — which headline a visitor saw before signing up
 *   ranking_variant  — which ranking they were randomized into afterwards
 *
 * Concretely: nothing in this file may read a user's arm, and nothing in the
 * assignment path may read a landing variant. Randomization happens at profile
 * completion from user_id and stratum alone (lib/research/assignment.ts).
 *
 * Copy for additional variants is supplied by the researcher. Adding one is a
 * new entry here — no component changes.
 */

export const DEFAULT_LANDING_VARIANT = 'default';

export interface LandingCopy {
  /** Small pill above the headline. */
  badge: string;
  h1: string;
  sub: string;
  cta: string;
  /**
   * Trust line. Takes the live scholarship count so the number can never be a
   * literal — it is rendered from the same query the rest of the page uses,
   * and the count segment is omitted entirely when that query failed.
   */
  trust: (count: number | null) => string;
}

const DEFAULT_COPY: LandingCopy = {
  badge: 'ฟรี · ไม่ต้องสมัครสมาชิกก่อนดู',
  h1:    'หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที',
  sub:   'ตอบ 3 คำถาม แล้วดูรายชื่อทุนที่ตรงกับคุณทันที ไม่ต้องสมัครสมาชิกก่อน',
  cta:   'เริ่มเลย ฟรี',
  trust: (count) =>
    [
      count !== null ? `ทุน ${count.toLocaleString('th-TH')} รายการ` : null,
      'ตรวจสอบแหล่งที่มาทุกทุน',
      'ไม่มีค่าใช้จ่าย',
    ].filter(Boolean).join(' · '),
};

/**
 * The registry. 'default' is what unrecognised and absent values resolve to,
 * so a mistyped or stale ad URL degrades to the standard page rather than a
 * blank headline.
 */
export const LANDING_VARIANTS: Record<string, LandingCopy> = {
  [DEFAULT_LANDING_VARIANT]: DEFAULT_COPY,
};

/**
 * Resolve ?v= to a known variant key.
 *
 * Validated against the registry rather than passed through: the value reaches
 * an event log and a covariate column, so an open string would let anyone
 * write arbitrary values into the research data.
 */
export function resolveLandingVariant(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return DEFAULT_LANDING_VARIANT;
  const key = raw.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LANDING_VARIANTS, key)
    ? key
    : DEFAULT_LANDING_VARIANT;
}

/** Copy for a variant key. Always returns something renderable. */
export function landingCopy(variant: string): LandingCopy {
  return LANDING_VARIANTS[variant] ?? DEFAULT_COPY;
}
