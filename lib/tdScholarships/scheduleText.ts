import { formatUserDate } from '../formatDate';
import type { TdDateConfidence, TdStatus } from './types';

export interface ScheduleText {
  text: string;
  daysUntil: number | null;
  kind: 'opening' | 'deadline' | 'rolling' | 'note' | 'none';
}

type ScheduleRow = {
  status_effective: TdStatus | null | undefined;
  open_date: string | null | undefined;
  deadline_date: string | null | undefined;
  deadline_is_rolling: boolean | null | undefined;
  deadline_note: string | null | undefined;
  date_confidence: TdDateConfidence | undefined;
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

/**
 * Resolve the date line shown to students, per §4 of the Status-only display spec:
 *  - Confirmed → exact date ("Opens 1 Aug 2026" / "Deadline 15 Sep 2026")
 *  - Estimated → softened ("Expected to open ~early Aug 2026")
 *  - blank     → no specific date; fall back to deadline_date, then deadline_note,
 *                then "Rolling / see details"
 *
 * Opening Soon rows lead with the open date; everything else leads with the deadline.
 */
export function resolveScheduleText(s: ScheduleRow, lang: 'th' | 'en'): ScheduleText {
  const isOpeningSoon = s.status_effective === 'Opening Soon';

  if (isOpeningSoon) {
    if (s.open_date && s.date_confidence) {
      const fmt = formatUserDate(s.open_date, lang);
      const text = s.date_confidence === 'Estimated'
        ? (lang === 'th' ? `คาดว่าเปิดรับ ~${fmt}` : `Expected to open ~${fmt}`)
        : (lang === 'th' ? `เปิดรับ ${fmt}` : `Opens ${fmt}`);
      return { text, daysUntil: daysUntil(s.open_date), kind: 'opening' };
    }
    if (s.deadline_date) {
      return {
        text: lang === 'th' ? `หมดเขต ${formatUserDate(s.deadline_date, lang)}` : `Deadline ${formatUserDate(s.deadline_date, lang)}`,
        daysUntil: null,
        kind: 'deadline',
      };
    }
    if (s.deadline_note) return { text: s.deadline_note, daysUntil: null, kind: 'note' };
    return { text: lang === 'th' ? 'เปิดรับเร็ว ๆ นี้ — ดูรายละเอียด' : 'Opening soon — see details', daysUntil: null, kind: 'none' };
  }

  if (s.deadline_date && s.date_confidence) {
    const fmt = formatUserDate(s.deadline_date, lang);
    const text = s.date_confidence === 'Estimated'
      ? (lang === 'th' ? `คาดว่าหมดเขต ~${fmt}` : `Expected deadline ~${fmt}`)
      : (lang === 'th' ? `หมดเขต ${fmt}` : `Deadline ${fmt}`);
    return { text, daysUntil: daysUntil(s.deadline_date), kind: 'deadline' };
  }
  if (s.deadline_date) {
    return {
      text: lang === 'th' ? `หมดเขต ${formatUserDate(s.deadline_date, lang)}` : `Deadline ${formatUserDate(s.deadline_date, lang)}`,
      daysUntil: daysUntil(s.deadline_date),
      kind: 'deadline',
    };
  }
  if (s.deadline_is_rolling) return { text: lang === 'th' ? 'เปิดรับตลอด' : 'Rolling / see details', daysUntil: null, kind: 'rolling' };
  if (s.deadline_note) return { text: s.deadline_note, daysUntil: null, kind: 'note' };
  return { text: lang === 'th' ? 'ดูเว็บไซต์' : 'See website', daysUntil: null, kind: 'none' };
}
