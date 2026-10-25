/**
 * The acquisition funnel as the admin sees it. Pure.
 *
 * Counts only, and only totals: this module has no notion of an experiment arm,
 * and must not grow one. A funnel split by ranking_variant is an outcome-by-arm
 * view, and the pre-registration forbids any such interface before the stopping
 * point (PREREG §8, §12.8; PART 2 step 8). Arm-level analysis is done in SQL,
 * deliberately, at the registered time.
 */

/** In order. `event` is the funnel_events.event_type the step is counted from. */
export const FUNNEL_STEPS = [
  { key: 'landed',            th: 'เข้าหน้า /start',                  event: 'landing_view' },
  { key: 'browsed',           th: 'เลื่อนดู / ค้นหา / กรอง',           event: 'browsed' },
  { key: 'engaged',           th: 'เปิดดูรายละเอียดทุน',               event: 'view_detail' },
  { key: 'personalize_shown', th: 'เห็นคำเชิญตอบคำถาม',               event: 'personalize_shown' },
  { key: 'personalized',      th: 'ตอบคำถามเสร็จ',                    event: 'quiz_completed' },
  { key: 'signed_up',         th: 'สร้างบัญชีสำเร็จ',                  event: 'signup_completed' },
  { key: 'tracked',           th: 'กดติดตามทุน',                      event: 'track_add' },
  { key: 'applied_clicked',   th: 'กดลิงก์ไปเว็บผู้ให้ทุน',            event: 'click_apply' },
  { key: 'returned',          th: 'กลับมาใช้งานอีกวัน',                event: null },
] as const;

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key'];

export interface StepCount { step: string; n: number }

export interface FunnelRow {
  key: FunnelStepKey;
  th: string;
  count: number | null;
  /** Share of the step before, 0–1; null when either count is missing or the previous is 0. */
  ofPrevious: number | null;
  /** Share lost since the step before, 0–1 (never negative); null as above. */
  droppedFromPrevious: number | null;
  /** Share of the first step, 0–1. */
  ofFirst: number | null;
}

/**
 * Steps are counted independently, so a later step can exceed an earlier one — a
 * visitor can sign up without ever having "browsed", or return on a new device.
 * That shows as a share above 100% and a drop of 0, which is true, not an error.
 */
export function buildFunnel(counts: StepCount[]): FunnelRow[] {
  const byStep = new Map(counts.map((c) => [c.step, Number(c.n)]));
  const first = byStep.get(FUNNEL_STEPS[0].key);

  const rows: FunnelRow[] = [];
  let prev: number | null = null;

  for (const s of FUNNEL_STEPS) {
    const count = byStep.has(s.key) ? (byStep.get(s.key) as number) : null;
    const ofPrevious = count !== null && prev !== null && prev > 0 ? count / prev : null;
    rows.push({
      key: s.key,
      th: s.th,
      count,
      ofPrevious,
      droppedFromPrevious: ofPrevious === null ? null : Math.max(0, 1 - ofPrevious),
      ofFirst: count !== null && first !== undefined && first > 0 ? count / first : null,
    });
    prev = count;
  }
  return rows;
}

export const FUNNEL_WINDOWS_DAYS = [7, 30] as const;
