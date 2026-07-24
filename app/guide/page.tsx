import type { Metadata } from 'next';
import GuideContent from './GuideContent';

export const metadata: Metadata = {
  title: 'วิธีใช้งาน TunDee',
  description:
    'คู่มือการใช้งาน TunDee ฉบับเต็ม ตั้งแต่สมัครสมาชิกจนถึงยื่นใบสมัครทุน สำหรับนักเรียนไทยทุกคน | ' +
    'A complete guide to using TunDee, from creating an account to submitting your first scholarship application.',
};

export default function GuidePage() {
  return <GuideContent />;
}
