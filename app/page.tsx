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
      <section className="section-pad bg-white dark:bg-[#0A1628]">
        <div className="max-w-[1200px] mx-auto px-6">
          <p className="text-[11px] font-semibold tracking-[3px] uppercase text-[#1B3A6B] mb-12"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {th ? 'วิธีการทำงาน' : 'HOW IT WORKS'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {steps.map((step) => (
              <div key={step.num} className="flex flex-col gap-4">
                <span
                  className="text-[0.7rem] text-[#DDE4EF] dark:text-[#232B3E] tracking-[1px]"
                  style={{ fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif' }}
                >
                  {step.num}
                </span>
                <h3
                  className="text-[1.125rem] font-semibold text-[#0F1C33] dark:text-[#EEF2FF]"
                  style={{ fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif' }}
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

      {/* Our Mission */}
      <section className="section-pad bg-[#F5F7FA] dark:bg-[#07111F]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-[720px]">
            <p
              className="text-[11px] font-semibold tracking-[3px] uppercase text-[#1B3A6B] mb-2"
              style={{ fontFamily: 'Inter, Sarabun, system-ui, sans-serif' }}
            >
              OUR MISSION / พันธกิจของเรา
            </p>
            <h2
              className="text-2xl md:text-3xl text-[#0F1C33] dark:text-[#EEF2FF] mb-6"
              style={{
                fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                fontWeight: 700,
              }}
            >
              {th
                ? 'โอกาสเหล่านี้มีอยู่แล้ว ทุนดีจะทำให้คุณไม่พลาดมันอีกต่อไป'
                : 'The opportunities are already out there. TunDee makes sure you know about them.'}
            </h2>

            <div
              className="space-y-4 text-[#4A5568] dark:text-[#8892A4] mb-6"
              style={{
                fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'Inter, system-ui, sans-serif',
                fontSize: '0.9375rem',
                lineHeight: th ? 1.85 : 1.7,
              }}
            >
              {th ? (
                <>
                  <p>
                    ทุกปี มีทุนการศึกษามูลค่ามหาศาลที่ไม่มีใครมารับ ไม่ใช่เพราะนักเรียนไม่มีคุณสมบัติ แต่เพราะพวกเขาไม่เคยรู้ว่าโอกาสนั้นมีอยู่จริง
                  </p>
                  <p>
                    TunDee เกิดขึ้นเพื่อให้นักเรียนทุกคน — ไม่ว่าจะอยู่จังหวัดไหน มีรายได้เท่าไหร่ หรือเป็นคนแรกในครอบครัวที่ได้เรียนต่อ — ได้เห็นโอกาสที่รอพวกเขาอยู่ และคว้ามันไว้
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Every year, scholarships worth millions of baht go unclaimed — not because students aren't qualified, but because they never knew the opportunity existed. The students who miss out most are the ones who need it most: those in rural provinces, from low-income families, or the first in their family to reach for higher education.
                  </p>
                  <p>
                    TunDee was built to close that gap. We believe no student should lose their future simply because no one told them the door was open. Our job is to make sure every student — no matter their province, their income, or their connections — can see the opportunities that are already there waiting for them, and take their shot.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Scholarships */}
      <section className="section-pad bg-[#F5F7FA] dark:bg-[#07111F]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[11px] font-semibold tracking-[3px] uppercase text-[#1B3A6B] mb-2"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {th ? 'ทุนแนะนำ' : 'FEATURED'}
              </p>
              <h2
                className="text-2xl md:text-3xl text-[#0F1C33] dark:text-[#EEF2FF]"
                style={{
                  fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                  fontWeight: th ? 600 : 300,
                }}
              >
                {f.title[lang]}
              </h2>
            </div>
            <Link href="/scholarships"
              className="text-sm text-[#1B3A6B] font-medium hover:underline hidden md:block"
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
          ) : scholarships.length === 0 ? null : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scholarships.map((s) => (
                <ScholarshipCard key={s.id} scholarship={s} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center md:hidden">
            <Link href="/scholarships"
              className="inline-block text-sm text-[#1B3A6B] font-medium hover:underline">
              {f.viewAll[lang]}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA band — dark navy */}
      <section className="bg-[#0A2342]">
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2
            className="text-white mb-4"
            style={{
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
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
              className="px-7 py-3 rounded-full text-sm font-semibold bg-white text-[#0F1C33] hover:bg-[#EBF2FF] hover:text-[#1B3A6B] transition-colors"
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
