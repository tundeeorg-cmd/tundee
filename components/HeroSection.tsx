'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';

export default function HeroSection() {
  const { lang } = useLang();
  const th = lang === 'th';

  return (
    <section className="bg-white pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="max-w-[720px]">
          {/* Eyebrow */}
          <p
            className="text-sm font-semibold tracking-[0.08em] uppercase text-[#1B3A6B] mb-5"
            style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
          >
            {th ? 'ทุนการศึกษาไทย' : 'Thai Scholarships'}
          </p>

          {/* Heading */}
          <h1
            className="text-[#0A2342] dark:text-white"
            style={{
              fontFamily: th ? "'Sarabun', system-ui, sans-serif" : "var(--font-lato), Lato, system-ui, sans-serif",
              fontWeight: th ? 600 : 700,
              fontSize: 'clamp(2.75rem, 6vw, 4.5rem)',
              lineHeight: th ? 1.3 : 1.1,
              letterSpacing: th ? '-0.01em' : '-0.03em',
            }}
          >
            {th ? (
              <>
                ค้นหาทุนที่ใช่<br />
                <span style={{ color: '#2E5FA3' }}>สำหรับคุณ</span>
              </>
            ) : (
              <>
                Find the right<br />
                <span style={{ color: '#2E5FA3' }}>scholarship for you</span>
              </>
            )}
          </h1>

          {/* Sub */}
          <p
            className="mt-5 text-[17px] text-[#6E7A8A] leading-relaxed max-w-[520px]"
            style={{ fontFamily: th ? "'Sarabun', sans-serif" : "var(--font-lato), Lato, sans-serif" }}
          >
            {th
              ? 'รวมทุนการศึกษาไทยกว่า 90 รายการ จับคู่ตรงตามโปรไฟล์ของคุณ ฟรีตลอด'
              : '90+ verified Thai scholarships matched to your profile. Always free.'}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/scholarships"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[15px] font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] transition-colors"
              style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
            >
              {th ? 'ค้นหาทุนของคุณ' : 'Find My Scholarships'}
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/scholarships"
              className="inline-flex items-center px-6 py-3 rounded-full text-[15px] font-semibold text-[#0A2342] border border-[#C8D0DC] hover:bg-[#EBF2FF] hover:border-[#1B3A6B] transition-colors"
              style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
            >
              {th ? 'ดูทุนทั้งหมด' : 'Browse All'}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
