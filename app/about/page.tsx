import type { Metadata } from 'next';
import AboutContent from './AboutContent';
import { scholarshipCountLabel } from '@/lib/scholarships/publicRule';
import { getScholarshipStats } from '@/lib/scholarships/counts';

export const revalidate = 1800;

/**
 * The description is what Google prints under the result, so it is held to the same
 * rule as on-page copy: the count is live, and when the query fails the sentence drops
 * the number rather than falling back to a literal.
 */
export async function generateMetadata(): Promise<Metadata> {
  const stats = await getScholarshipStats();
  const n = stats.ok ? stats.scholarships : null;
  return {
    title: 'เกี่ยวกับ TunDee ทุนดี',
    description:
      `TunDee รวมทุนการศึกษาไทย ${scholarshipCountLabel(n, 'th')} ทุน ` +
      'กรอกข้อมูลของคุณและรับรายชื่อทุนที่เหมาะกับคุณ ฟรี ไม่มีค่าใช้จ่าย | ' +
      `TunDee aggregates ${scholarshipCountLabel(n, 'en')} Thai scholarships and matches them to your profile. Free.`,
  };
}

export default async function AboutPage() {
  const stats = await getScholarshipStats();
  return <AboutContent scholarshipCount={stats.ok ? stats.scholarships : null} />;
}
