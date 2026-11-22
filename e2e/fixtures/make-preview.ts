/**
 * A /api/preview-match response with 10 realistic cards (plus a page 2), so the
 * visual spec can render results without Supabase. Shapes follow
 * lib/preview/types.ts PreviewResponse. Lengths vary on purpose: one very long
 * name, one card without an apply link, one rolling deadline.
 */
import type { PreviewMatchCard, PreviewResponse } from '../../lib/preview/types';

const NAMES: [string, string][] = [
  ['ทุนเรียนดี ป.ตรี มหาวิทยาลัยขอนแก่น', 'มหาวิทยาลัยขอนแก่น'],
  ['ทุนมูลนิธิเพื่อนักศึกษาภาคตะวันออกเฉียงเหนือ', 'มูลนิธิทดสอบ'],
  ['กองทุนเงินให้กู้ยืมเพื่อการศึกษา (กยศ.)', 'กองทุนเงินให้กู้ยืมเพื่อการศึกษา'],
  ['ทุนการศึกษาบริษัทตัวอย่าง จำกัด สำหรับนักศึกษาที่มีรายได้น้อย ระดับปริญญาตรี ทุกสาขาวิชา ประจำปีการศึกษา 2570', 'บริษัทตัวอย่าง จำกัด'],
  ['ทุนพระราชทาน (ตัวอย่าง)', 'มูลนิธิตัวอย่าง'],
  ['ทุนธนาคารตัวอย่าง', 'ธนาคารตัวอย่าง'],
  ['ทุนเพชรในตม (ตัวอย่าง)', 'มหาวิทยาลัยตัวอย่าง'],
  ['ทุนเด็กดีมีที่เรียน (ตัวอย่าง)', 'กระทรวงตัวอย่าง'],
  ['ทุนอาหารกลางวัน (ตัวอย่าง)', 'มูลนิธิอาหาร'],
  ['ทุนค่าครองชีพรายเดือน (ตัวอย่าง)', 'มูลนิธิค่าครองชีพ'],
];
const TIERS = ['full_ride', 'full_tuition', 'large', 'medium', 'small', 'stipend_only', null, 'medium', 'small', 'large'];

function card(i: number, page: number): PreviewMatchCard {
  const [name, funder] = NAMES[i];
  return {
    scholarship_id: `TD-E2E-${page}${i}`,
    name: page ? `${name} (หน้า ${page + 1})` : name,
    funder,
    award_tier: TIERS[i],
    award_amount: TIERS[i] ? null : '15000',
    deadline_date: i === 2 ? null : `2027-0${1 + (i % 9)}-15`,
    deadline_is_rolling: i === 2,
    status: 'Open',
    apply_url: i === 4 ? null : 'https://example.org/apply',
    explanation: i % 2 === 0
      ? 'ทุนนี้เปิดรับนักศึกษาปริญญาตรีจากภาคตะวันออกเฉียงเหนือ และให้ความสำคัญกับครอบครัวรายได้น้อย'
      : 'เหมาะกับคุณเพราะเปิดรับทุกสาขาและไม่กำหนดเกรดขั้นต่ำ',
    reasons: ['ภาคอีสาน', 'รายได้น้อย'],
    score: Number((0.9 - i * 0.03).toFixed(3)),
  };
}

export function previewPage(offset: number): PreviewResponse {
  const page = Math.floor(offset / 10);
  const n = page === 0 ? 10 : 4;
  return {
    preview: Array.from({ length: n }, (_, i) => card(i, page)),
    lockedCount: Math.max(0, 24 - offset - n),
    total: 24,
    broadened: false,
    offset,
  };
}
