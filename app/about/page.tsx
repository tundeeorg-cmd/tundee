'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { supabase } from '@/lib/supabase';

export default function AboutPage() {
  const { lang } = useLang();
  const th = lang === 'th';
  const font = { fontFamily: th ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' };
  const [scholarshipCount, setScholarshipCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('scholarships')
      .select('*', { count: 'exact', head: true })
      .neq('is_active', false)
      .then(({ count }) => { if (count !== null) setScholarshipCount(count); });
  }, []);

  return (
    <div className="bg-white dark:bg-[#1C1C1E] min-h-screen" style={font}>

      {/* ── SECTION 1 — Mission Hero ── */}
      <section className="bg-[#1D1D1F] dark:bg-[#000000] px-6 py-20 md:py-28">
        <div className="max-w-[900px] mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            <span className="text-white block">
              {th ? 'สร้างขึ้นเพื่อนักเรียนไทย' : 'Built for every Thai student'}
            </span>
            <span className="text-[#F0A500] block">
              {th ? 'ทุกคน ทุกจังหวัด' : 'in every province'}
            </span>
          </h1>
          <p className="max-w-lg text-white/70 text-lg leading-relaxed">
            {th
              ? 'TunDee เชื่อว่านักเรียนที่มีความสามารถทุกคนสมควรได้รับโอกาส ไม่ว่าจะอยู่ที่ไหนในประเทศไทย'
              : 'TunDee believes every talented student deserves opportunity, no matter where in Thailand they live.'}
          </p>
        </div>
      </section>

      {/* ── SECTION 2 — The Problem ── */}
      <section className="bg-white dark:bg-[#1C1C1E] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p className="text-xs font-semibold text-[#F0A500] uppercase tracking-wider mb-10">
            {th ? 'ปัญหาที่เราแก้' : 'The Problem We Solve'}
          </p>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {[
              {
                num: scholarshipCount !== null ? `${scholarshipCount}+` : '90+',
                line1: th ? 'ทุนการศึกษา' : 'Scholarships',
                line2: th ? 'บน TunDee ตอนนี้' : 'on TunDee right now',
              },
              {
                num: '3',
                line1: th ? 'จำนวนทุนเฉลี่ย' : 'Average scholarships',
                line2: th ? 'ที่นักเรียนชนบทรู้จัก' : 'rural students know about',
              },
              {
                num: '97%',
                line1: th ? 'ทุนที่นักเรียนชนบท' : 'Of scholarships rural',
                line2: th ? 'ไม่เคยได้ยิน' : 'students never hear about',
              },
            ].map((s) => (
              <div
                key={s.num}
                className="border border-[#E5E5EA] dark:border-[#38383A] rounded-xl p-6 text-center"
              >
                <div
                  className="text-5xl font-bold text-[#F0A500] mb-3"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {s.num}
                </div>
                <p className="text-sm text-[#1D1D1F] dark:text-white leading-snug">{s.line1}</p>
                <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] leading-snug">{s.line2}</p>
              </div>
            ))}
          </div>

          {/* Quote block */}
          <blockquote className="border-l-4 border-[#F0A500] pl-5 py-1">
            <p className="text-base text-[#1D1D1F] dark:text-white leading-relaxed italic">
              {th
                ? 'Google ไม่ช่วย — ทุนที่สำคัญที่สุดสำหรับนักเรียนยากจนมักไม่ปรากฏในผลการค้นหาเลย'
                : "Google doesn't help — the most important scholarships for underprivileged students rarely appear in search results."}
            </p>
          </blockquote>
        </div>
      </section>

      {/* ── SECTION 3 — How TunDee is Different ── */}
      <section className="bg-[#F5F5F7] dark:bg-[#111111] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p className="text-xs font-semibold text-[#F0A500] uppercase tracking-wider mb-10">
            {th ? 'ทำไม TunDee ถึงต่างจาก Google' : 'Why TunDee is Different'}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-3 px-4 text-[#6E6E73] dark:text-[#8E8E93] font-semibold border-b border-[#E5E5EA] dark:border-[#38383A] w-1/3">
                    {th ? 'คุณสมบัติ' : 'Feature'}
                  </th>
                  <th className="text-center py-3 px-4 text-[#6E6E73] dark:text-[#8E8E93] font-semibold border-b border-[#E5E5EA] dark:border-[#38383A] w-1/3">
                    Google / ChatGPT
                  </th>
                  <th className="text-center py-3 px-4 text-[#1D1D1F] dark:text-white font-semibold border-b border-[#E5E5EA] dark:border-[#38383A] w-1/3 bg-[#FFF8E7] dark:bg-[#2A2200] rounded-t-lg">
                    TunDee
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    feature: th ? 'ข้อมูลปัจจุบัน' : 'Up-to-date info',
                    google: th ? '❌ ข้อมูลเก่า' : '❌ Outdated',
                    tundee: th ? '✓ อัปเดตทุก 90 วัน' : '✓ Updated every 90 days',
                  },
                  {
                    feature: th ? 'การจับคู่ส่วนตัว' : 'Personalised',
                    google: th ? '❌ ผลทั่วไป' : '❌ Generic results',
                    tundee: th ? '✓ ตาม GPA/จังหวัด/รายได้' : '✓ By GPA/province/income',
                  },
                  {
                    feature: th ? 'ความเท่าเทียม' : 'Equity',
                    google: th ? '❌ เอื้อนักเรียนกรุงเทพ' : '❌ Favours Bangkok',
                    tundee: '✓ Fairness Algorithm (Hardt 2016)',
                  },
                ].map((row, i) => (
                  <tr key={i}>
                    <td className="py-3 px-4 text-[#1D1D1F] dark:text-white border-b border-[#E5E5EA] dark:border-[#38383A]">
                      {row.feature}
                    </td>
                    <td className="py-3 px-4 text-center border-b border-[#E5E5EA] dark:border-[#38383A]">
                      <span className="text-red-500">{row.google}</span>
                    </td>
                    <td className="py-3 px-4 text-center border-b border-[#E5E5EA] dark:border-[#38383A] bg-[#FFF8E7] dark:bg-[#2A2200]">
                      <span className="text-green-600 dark:text-green-400">{row.tundee}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── SECTION 4 — Fairness Technology ── */}
      <section className="bg-white dark:bg-[#1C1C1E] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p className="text-xs font-semibold text-[#F0A500] uppercase tracking-wider mb-8">
            {th ? 'เทคโนโลยีความเท่าเทียม' : 'Fairness Technology'}
          </p>

          {/* Main card */}
          <div className="border-l-4 border-[#F0A500] bg-[#FFF8E7] dark:bg-[#2A2200] rounded-r-xl px-6 py-5 mb-8">
            <p className="text-[#1D1D1F] dark:text-white leading-relaxed">
              {th
                ? 'TunDee ใช้ Equalized Odds Algorithm ตาม Hardt, Price & Srebro (2016) เพื่อให้นักเรียนจากจังหวัดห่างไกลได้เห็นทุนที่เหมาะสมในอัตราเดียวกับนักเรียนกรุงเทพที่มีคุณสมบัติเท่ากัน'
                : 'TunDee uses an Equalized Odds algorithm (Hardt, Price & Srebro, NeurIPS 2016) so rural students see relevant scholarships at the same rate as Bangkok students with identical qualifications.'}
            </p>
            <p className="text-xs text-[#ADADB8] mt-3">
              Hardt, M., Price, E., &amp; Srebro, N. (2016). Equality of Opportunity in Supervised Learning.{' '}
              NeurIPS 2016. arXiv:1610.02413
            </p>
          </div>

          {/* Equity chips */}
          <div className="flex flex-wrap items-center gap-3 justify-center">
            <span className="bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white text-sm px-4 py-2 rounded-full border border-[#E5E5EA] dark:border-[#38383A]">
              🏙️ {th ? 'นักเรียนกรุงเทพ' : 'Bangkok student'}
            </span>
            <span className="text-[#6E6E73] dark:text-[#8E8E93] font-bold text-xl">=</span>
            <span className="bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-white text-sm px-4 py-2 rounded-full border border-[#E5E5EA] dark:border-[#38383A]">
              🌾 {th ? 'นักเรียนชนบท' : 'Rural student'}
            </span>
            <span className="text-[#6E6E73] dark:text-[#8E8E93] font-bold text-xl">=</span>
            <span className="bg-[#FFF8E7] dark:bg-[#2A2200] text-[#F0A500] text-sm px-4 py-2 rounded-full border border-[#F0A500]/40">
              {th ? 'โอกาสเท่ากัน' : 'Equal chances'}
            </span>
          </div>
        </div>
      </section>

      {/* ── SECTION 5 — Ploy's Story ── */}
      <section className="bg-[#F5F5F7] dark:bg-[#111111] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <div className="max-w-lg mx-auto bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] rounded-2xl p-8 text-center shadow-sm">
            <div className="text-5xl mb-4">🎓</div>
            <p className="text-lg font-bold text-[#1D1D1F] dark:text-white mb-1">
              {th ? 'พลอย' : 'Ploy'}
            </p>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-8">
              {th
                ? 'อายุ 17 • จ.สุรินทร์ • GPA 3.4 • พ่อแม่เป็นชาวนา • บัตรสวัสดิการแห่งรัฐ'
                : 'Age 17 • Surin • GPA 3.4 • Rice farmer family • Welfare card'}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Before */}
              <div className="flex-1 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl p-4">
                <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-1">
                  {th ? 'ก่อน TunDee' : 'Before TunDee'}
                </p>
                <p className="text-sm text-[#1D1D1F] dark:text-white">
                  {th ? 'รู้จักทุน' : 'knew'}
                </p>
                <p
                  className="text-4xl font-bold text-[#6E6E73] dark:text-[#8E8E93]"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  2
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
                  {th ? 'รายการ' : 'scholarships'}
                </p>
              </div>

              <div className="text-2xl text-[#F0A500] font-bold">→</div>

              {/* After */}
              <div className="flex-1 bg-[#FFF8E7] dark:bg-[#2A2200] rounded-xl p-4 border border-[#F0A500]/30">
                <p className="text-xs text-[#F0A500] mb-1">
                  {th ? 'หลัง TunDee' : 'After TunDee'}
                </p>
                <p className="text-sm text-[#1D1D1F] dark:text-white">
                  {th ? 'พบทุน' : 'found'}
                </p>
                <p
                  className="text-4xl font-bold text-[#F0A500]"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  23
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
                  {th ? 'รายการที่เหมาะสม' : 'she qualified for'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 6 — Founder ── */}
      <section className="bg-white dark:bg-[#1C1C1E] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p className="text-xs font-semibold text-[#F0A500] uppercase tracking-wider mb-10 text-center">
            {th ? 'ผู้สร้าง' : 'Creator'}
          </p>

          <div className="max-w-sm mx-auto bg-white dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#38383A] rounded-2xl p-8 text-center shadow-sm">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold mx-auto mb-4"
              style={{ background: '#F0A500' }}
            >
              J
            </div>

            <p className="text-lg font-bold text-[#1D1D1F] dark:text-white mb-2">
              Jenissa Vichiansin
            </p>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed">
              {th
                ? 'นักเรียนชั้น ม.5 โรงเรียนนานาชาติกรุงเทพ (ISB) สร้าง TunDee เพื่อให้นักเรียนไทยทุกคนได้รับโอกาสที่พวกเขาสมควรได้รับ'
                : 'Grade 11, International School Bangkok (ISB). Built TunDee so every Thai student gets the opportunity they deserve.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 7 — CTA Gold Band ── */}
      <section className="bg-[#F0A500] px-6 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
          {th ? 'เริ่มค้นหาทุนของคุณวันนี้' : 'Start finding your scholarship today'}
        </h2>
        <Link
          href="/scholarships"
          className="inline-block bg-white text-[#F0A500] font-semibold px-8 py-3 rounded-full hover:bg-[#FFF8E7] transition-colors duration-200 text-sm"
        >
          {th ? 'ค้นหาทุนฟรี →' : 'Browse Scholarships →'}
        </Link>
      </section>

    </div>
  );
}
