// ── Deadline utility — shared across Tracker, Browse, Detail pages ────────

export interface DeadlineInfo {
  label: string;        // Thai label e.g. "อีก 14 วัน"
  labelEn: string;      // English label e.g. "14 days left"
  color: 'red' | 'orange' | 'yellow' | 'green' | 'gray';
  days: number | null;
}

export function getDeadlineInfo(deadlineDate: string | null): DeadlineInfo {
  if (!deadlineDate) {
    return { label: 'ตรวจสอบเว็บไซต์', labelEn: 'Check website', color: 'gray', days: null };
  }
  const days = Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0)  return { label: 'หมดเขตแล้ว',       labelEn: 'Expired',          color: 'red',    days };
  if (days === 0) return { label: 'หมดเขตวันนี้',     labelEn: 'Closes today',     color: 'red',    days };
  if (days <= 7)  return { label: `อีก ${days} วัน`, labelEn: `${days} days left`, color: 'red',    days };
  if (days <= 30) return { label: `อีก ${days} วัน`, labelEn: `${days} days left`, color: 'orange', days };
  if (days <= 60) return { label: `อีก ${days} วัน`, labelEn: `${days} days left`, color: 'yellow', days };
  return              { label: `อีก ${days} วัน`,    labelEn: `${days} days left`, color: 'green',  days };
}

export const DEADLINE_COLOR_MAP: Record<
  DeadlineInfo['color'],
  { bg: string; text: string; border: string }
> = {
  red:    { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  orange: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  yellow: { bg: '#FEFCE8', text: '#CA8A04', border: '#FEF08A' },
  green:  { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  gray:   { bg: '#F5F5F7', text: '#6E6E73', border: '#E5E5EA' },
};
