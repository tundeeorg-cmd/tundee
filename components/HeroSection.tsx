'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';

export default function HeroSection() {
  const { lang } = useLang();
  const th = lang === 'th';

  return (
    <section className="relative bg-[#F7F9FC] dark:bg-[#0D1117] min-h-[92vh] flex items-center overflow-hidden">
      <div className="absolute inset-0 hero-grid pointer-events-none" />
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#2E6BE6] opacity-[0.04] rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-[1200px] mx-auto px-6 py-24 md:py-32 w-full">
        <div className="max-w-[680px]">
          <p
            className="text-[11px] font-semibold tracking-[3px] uppercase text-[#2E6BE6] mb-8"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {th ? 'ทุนการศึกษาไทย · ฟรี' : 'THAI SCHOLARSHIPS · FREE'}
          </p>

          <h1
            className="text-[#0F1C33] dark:text-[#EEF2FF] mb-6"
            style={{
              fontFamily: th
                ? 'Noto Serif Thai, serif'
                : 'var(--font-display, Cormorant Garamond, Georgia, serif)',
              fontSize: 'clamp(3rem, 7vw, 5.5rem)',
              fontWeight: th ? 600 : 300,
              lineHeight: th ? 1.2 : 1.05,
              letterSpacing: th ? 0 : '-0.02em',
            }}
          >
            <span className="block">{th ? 'หาทุนที่ใช่' : 'Find the scholarship'}</span>
            <span className="block" style={{ marginLeft: 'clamp(0px, 2rem, 3rem)' }}>
              {th ? 'สำหรับคุณ' : 'you deserve'}
            </span>
          </h1>

          <p
            className="text-[#4A5568] dark:text-[#8892A4] mb-10 max-w-[480px]"
            style={{
              fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif',
              fontSize: '1rem',
              lineHeight: th ? 1.8 : 1.7,
            }}
          >
            {th
              ? 'รวมทุนการศึกษาไทยกว่า 90 รายการ จับคู่ตรงตามโปรไฟล์ของคุณ ฟรีตลอด'
              : '90+ verified Thai scholarships matched to your profile. Always free.'}
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/scholarships"
              className="inline-flex items-center gap-2 bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-semibold px-7 py-3.5 rounded-full transition-colors duration-200 text-sm"
              style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {th ? 'ค้นหาทุนของคุณ' : 'Find My Scholarships'}
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/scholarships"
              className="inline-flex items-center border border-[#DDE4EF] dark:border-[#232B3E] text-[#0F1C33] dark:text-[#EEF2FF] hover:border-[#2E6BE6] hover:text-[#2E6BE6] font-medium px-7 py-3.5 rounded-full transition-colors duration-200 text-sm"
              style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {th ? 'ดูทุนทั้งหมด' : 'Browse All'}
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-1 opacity-25">
          <div className="w-px h-10 bg-[#DDE4EF]" />
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="#DDE4EF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}
