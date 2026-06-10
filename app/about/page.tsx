import type { Metadata } from 'next';
import AboutContent from './AboutContent';

export const metadata: Metadata = {
  title: 'เกี่ยวกับ TunDee ทุนดี',
  description:
    'TunDee รวมทุนการศึกษาไทยกว่า 90 รายการ ' +
    'กรอกข้อมูลของคุณและรับรายชื่อทุนที่เหมาะกับคุณ ' +
    'ฟรี ไม่มีค่าใช้จ่าย | ' +
    'TunDee aggregates 90+ Thai scholarships and ' +
    'matches them to your profile. Free.',
};

export default function AboutPage() {
  return <AboutContent />;
}
