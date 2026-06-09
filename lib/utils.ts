// ── Shared utilities imported by pages, cards, and tracker ─────────────
// Keep this file free of React imports so it works in both client + server.

export type DeadlineColor = 'red' | 'orange' | 'yellow' | 'green' | 'gray';

export function getDeadlineInfo(
  dateStr: string | null,
  lang: 'th' | 'en' = 'th'
): { text: string; color: DeadlineColor } {
  if (!dateStr) {
    return { text: lang === 'th' ? 'ตรวจสอบเว็บไซต์' : 'Check website', color: 'gray' };
  }
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days < 0)  return { text: lang === 'th' ? 'หมดเขตแล้ว'     : 'Closed',            color: 'red'    };
  if (days === 0) return { text: lang === 'th' ? 'หมดเขตวันนี้'    : 'Closes today',      color: 'red'    };
  if (days <= 7)  return { text: lang === 'th' ? `อีก ${days} วัน ⚡` : `${days} days left ⚡`, color: 'red' };
  if (days <= 30) return { text: lang === 'th' ? `อีก ${days} วัน` : `${days} days left`, color: 'orange' };
  if (days <= 60) return { text: lang === 'th' ? `อีก ${days} วัน` : `${days} days left`, color: 'yellow' };

  // > 60 days: show the actual date
  const d = new Date(dateStr);
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const text = lang === 'th'
    ? `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return { text, color: 'green' };
}

// Deadline color → Tailwind classes
export const DEADLINE_CLASSES: Record<DeadlineColor, string> = {
  red:    'bg-red-50    text-red-600    border-red-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  green:  'bg-green-50  text-green-600  border-green-200',
  gray:   'bg-[#F5F5F7] text-[#6E6E73]  border-[#E5E5EA]',
};

export const TIER_CONFIG = {
  SAFETY: { th: '🟢 โอกาสสูง', en: '🟢 Safety', bg: '#EAFAF1', text: '#1E8449' },
  TARGET: { th: '🟡 เหมาะสม',  en: '🟡 Target', bg: '#EFF4FF', text: '#D35400' },
  REACH:  { th: '🔴 ท้าทาย',   en: '🔴 Reach',  bg: '#FDEDEC', text: '#C0392B' },
} as const;

export const FUNDER_TYPE_LABELS: Record<string, { th: string; en: string }> = {
  government:    { th: 'รัฐบาล',     en: 'Government' },
  corporate:     { th: 'เอกชน',      en: 'Corporate' },
  foundation:    { th: 'มูลนิธิ',    en: 'Foundation' },
  royal:         { th: 'พระราชทาน',  en: 'Royal' },
  university:    { th: 'มหาวิทยาลัย',en: 'University' },
  international: { th: 'ต่างประเทศ', en: 'International' },
};

export const GRADE_LABELS: Record<string, { th: string; en: string }> = {
  M4:       { th: 'ม.4',          en: 'Grade 10 (M4)' },
  M5:       { th: 'ม.5',          en: 'Grade 11 (M5)' },
  M6:       { th: 'ม.6',          en: 'Grade 12 (M6)' },
  uni:      { th: 'ปริญญาตรี',    en: 'Undergraduate' },
  graduate: { th: 'บัณฑิตศึกษา', en: 'Graduate' },
};

export const FIELD_TRANSLATIONS: Record<string, { th: string; en: string }> = {
  any:             { th: 'ทุกสาขา',             en: 'All fields' },
  engineering:     { th: 'วิศวกรรมศาสตร์',      en: 'Engineering' },
  medicine:        { th: 'แพทยศาสตร์',           en: 'Medicine' },
  science:         { th: 'วิทยาศาสตร์',          en: 'Science' },
  business:        { th: 'บริหารธุรกิจ',         en: 'Business' },
  computer_science:{ th: 'วิทยาการคอมพิวเตอร์', en: 'Computer Science' },
  data_science:    { th: 'วิทยาศาสตร์ข้อมูล',   en: 'Data Science' },
  agriculture:     { th: 'เกษตรศาสตร์',         en: 'Agriculture' },
  education:       { th: 'ศึกษาศาสตร์',          en: 'Education' },
  law:             { th: 'นิติศาสตร์',           en: 'Law' },
  arts:            { th: 'ศิลปะ',               en: 'Arts' },
  economics:       { th: 'เศรษฐศาสตร์',         en: 'Economics' },
  pharmacy:        { th: 'เภสัชศาสตร์',         en: 'Pharmacy' },
  nursing:         { th: 'พยาบาลศาสตร์',        en: 'Nursing' },
  architecture:    { th: 'สถาปัตยกรรมศาสตร์',   en: 'Architecture' },
};

export const DOC_LABELS: Record<string, { th: string; en: string }> = {
  transcript:           { th: 'ใบแสดงผลการเรียน',         en: 'Academic Transcript' },
  id_card:              { th: 'สำเนาบัตรประชาชน',          en: 'National ID Card' },
  house_registration:   { th: 'สำเนาทะเบียนบ้าน',         en: 'House Registration' },
  income_certificate:   { th: 'หนังสือรับรองรายได้',       en: 'Income Certificate' },
  welfare_card:         { th: 'สำเนาบัตรสวัสดิการแห่งรัฐ', en: 'Welfare Card Copy' },
  photo:                { th: 'รูปถ่าย',                   en: 'Passport Photo' },
  recommendation_letter:{ th: 'จดหมายแนะนำ',              en: 'Recommendation Letter' },
  personal_statement:   { th: 'เรียงความแนะนำตัว',         en: 'Personal Statement' },
  student_id:           { th: 'สำเนาบัตรนักเรียน/นักศึกษา',en: 'Student ID Copy' },
  enrollment_cert:      { th: 'หนังสือรับรองการเป็นนักเรียน',en: 'Enrollment Certificate' },
  portfolio:            { th: 'แฟ้มสะสมผลงาน',            en: 'Portfolio' },
};
