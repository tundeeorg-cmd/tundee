'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import HeroSection from '@/components/HeroSection';
import StatsBar from '@/components/StatsBar';
import ScholarshipCard from '@/components/ScholarshipCard';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { useScholarshipCount } from '@/lib/useScholarshipCount';
import { translations } from '@/lib/translations';
import type { Scholarship } from '@/lib/types';

const steps = [
  { num: '01', th_title: 'ค้นหา', en_title: 'Browse', th_desc: 'กรองทุนตามเกรด รายได้ จังหวัด และสาขาวิชา', en_desc: 'Filter by GPA, income, province and field of study' },
  { num: '02', th_title: 'จับคู่', en_title: 'Match', th_desc: 'AI จับคู่ทุนที่เหมาะสมพร้อมการปรับความเป็นธรรม', en_desc: 'AI matches scholarships with fairness correction' },
  { num: '03', th_title: 'สมัคร', en_title: 'Apply', th_desc: 'ทำตาม 7 ขั้นตอนและสมัครบนเว็บไซต์ทุน', en_desc: 'Follow 7 steps and apply on the official scholarship site' },
];

export default function HomePage() {
  const { lang } = useLang();
  const th = lang === 'th';
  const totalCount = useScholarshipCount(90);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const f = translations.featured;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('scholarships')
      .select('*')
      .order('amount_thb', { ascending: false, nullsFirst: false })
      .limit(6)
      .then(({ data }) => {
        const active = (data ?? []).filter((s) => s.is_active !== false) as Scholarship[];
        setScholarships(active.slice(0, 6));
        setLoading(false);
      });
  }, []);

  return (
    <>
      <HeroSection />
      <StatsBar scholarshipCount={totalCount} />

      {/* How It Works */}
      <section className="section-pad bg-white dark:bg-[#161B27]">
        <div className="max-w-[1200px] mx-auto px-6">
          <p className="text-[11px] font-semibold tracking-[3px] uppercase text-[#2E6BE6] mb-12"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {th ? 'วิธีการทำงาน' : 'HOW IT WORKS'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {steps.map((step) => (
              <div key={step.num} className="flex flex-col gap-4">
                <span
                  className="text-[0.7rem] text-[#DDE4EF] dark:text-[#232B3E] tracking-[1px]"
                  style={{ fontFamily: 'var(--font-display, Cormorant Garamond, Georgia, serif)' }}
                >
                  {step.num}
                </span>
                <h3
                  className="text-[1.125rem] font-semibold text-[#0F1C33] dark:text-[#EEF2FF]"
                  style={{ fontFamily: th ? 'Noto Serif Thai, serif' : 'var(--font-display, Cormorant Garamond, Georgia, serif)' }}
                >
                  {th ? step.th_title : step.en_title}
                </h3>
                <p className="text-[0.875rem] text-[#4A5568] dark:text-[#8892A4] leading-relaxed"
                  style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                  {th ? step.th_desc : step.en_desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Scholarships */}
      <section className="section-pad bg-[#F7F9FC] dark:bg-[#0D1117]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[11px] font-semibold tracking-[3px] uppercase text-[#2E6BE6] mb-2"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {th ? 'ทุนแนะนำ' : 'FEATURED'}
              </p>
              <h2
                className="text-2xl md:text-3xl text-[#0F1C33] dark:text-[#EEF2FF]"
                style={{
                  fontFamily: th ? 'Noto Serif Thai, serif' : 'var(--font-display, Cormorant Garamond, Georgia, serif)',
                  fontWeight: th ? 600 : 300,
                }}
              >
                {f.title[lang]}
              </h2>
            </div>
            <Link href="/scholarships"
              className="text-sm text-[#2E6BE6] font-medium hover:underline hidden md:block"
              style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
              {f.viewAll[lang]}
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-52 bg-[#DDE4EF] dark:bg-[#232B3E] rounded-[12px] animate-pulse" />
              ))}
            </div>
          ) : scholarships.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-5xl mb-4">🎓</div>
              <h3 className="text-lg font-semibold text-[#0F1C33] dark:text-[#EEF2FF] mb-2"
                style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                {translations.browse.emptyHeading[lang]}
              </h3>
              <p className="text-sm text-[#4A5568] max-w-sm leading-relaxed"
                style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                {translations.browse.emptyBody[lang]}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scholarships.map((s) => (
                <ScholarshipCard key={s.id} scholarship={s} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center md:hidden">
            <Link href="/scholarships"
              className="inline-block text-sm text-[#2E6BE6] font-medium hover:underline">
              {f.viewAll[lang]}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA band — dark navy */}
      <section className="bg-[#0F1C33]">
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2
            className="text-white mb-4"
            style={{
              fontFamily: th ? 'Noto Serif Thai, serif' : 'var(--font-display, Cormorant Garamond, Georgia, serif)',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
              fontWeight: th ? 600 : 300,
              lineHeight: th ? 1.3 : 1.1,
            }}
          >
            {th ? 'เริ่มต้นวันนี้' : 'Start today'}
          </h2>
          <p
            className="text-[#8892A4] mb-10 max-w-md mx-auto"
            style={{
              fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif',
              fontSize: '0.9375rem',
              lineHeight: th ? 1.8 : 1.6,
            }}
          >
            {th
              ? 'ฟรีตลอด ไม่ต้องลงทะเบียนก่อนก็ดูทุนได้'
              : 'Free forever. Browse scholarships without signing up.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth"
              className="px-7 py-3 rounded-full text-sm font-semibold bg-white text-[#0F1C33] hover:bg-[#EFF4FF] hover:text-[#2E6BE6] transition-colors"
              style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {th ? 'สร้างบัญชีฟรี' : 'Create Free Account'}
            </Link>
            <Link
              href="/scholarships"
              className="px-7 py-3 rounded-full text-sm font-semibold border border-[#232B3E] text-[#8892A4] hover:border-white hover:text-white transition-colors"
              style={{ fontFamily: th ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {th ? 'ดูทุนทั้งหมด' : 'Browse All'}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
