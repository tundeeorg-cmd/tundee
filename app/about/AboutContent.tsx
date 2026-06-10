'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';

export default function AboutContent() {
  const { lang } = useLang();
  const th = lang === 'th';
  const [scholarshipCount, setScholarshipCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('scholarships')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (count !== null && count > 0) setScholarshipCount(count); });
  }, []);

  const countLabel = scholarshipCount !== null ? `${scholarshipCount}+` : '90+';

  return (
    <div className="bg-white dark:bg-[#07111F] min-h-screen">

      {/* ── SECTION 1: HERO ── */}
      <section className="bg-white dark:bg-[#07111F] px-6 py-20 md:py-28">
        <div className="max-w-[900px] mx-auto">
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 300,
              color: '#0A2342',
              lineHeight: th ? 1.3 : 1.15,
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="mb-6 dark:text-[#E8EDF5]"
          >
            {th ? (
              <>
                <span className="block">TunDee ทุนดี</span>
                <span className="block">ค้นหาทุนที่ใช่สำหรับคุณ</span>
              </>
            ) : (
              <>
                <span className="block">TunDee</span>
                <span className="block">Find the right scholarship for you</span>
              </>
            )}
          </h1>

          <p
            style={{
              fontSize: '1.0625rem',
              color: '#6E7A8A',
              lineHeight: 1.8,
              maxWidth: '520px',
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="mb-10 dark:text-[#7A8FA8]"
          >
            {th
              ? `รวมทุนการศึกษาไทยกว่า ${countLabel} รายการ กรอกข้อมูลของคุณ แล้วรับรายชื่อทุนที่เหมาะกับคุณ ฟรี ไม่มีค่าใช้จ่าย`
              : `${countLabel} Thai scholarships in one place. Tell us about yourself and get a list of scholarships matched to you. Free.`}
          </p>

          <Link
            href="/scholarships"
            className="inline-block font-medium text-white transition-colors hover:bg-[#2E5FA3]"
            style={{
              background: '#1B3A6B',
              borderRadius: '28px',
              padding: '13px 32px',
              fontSize: '14px',
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
          >
            {th ? 'ค้นหาทุนของฉัน' : 'Find my scholarships'}
          </Link>
        </div>
      </section>

      {/* ── SECTION 2: THE PROBLEM ── */}
      <section className="bg-[#F5F7FA] dark:bg-[#0A1628] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p
            className="mb-6"
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#8A96A8',
              fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
          >
            {th ? 'ปัญหาที่เราเห็น' : 'WHAT WE NOTICED'}
          </p>

          <h2
            style={{
              fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
              fontWeight: 300,
              color: '#0A2342',
              lineHeight: th ? 1.4 : 1.2,
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="mb-8 dark:text-[#E8EDF5]"
          >
            {th ? (
              <>
                <span className="block">ทุนการศึกษามีอยู่มาก</span>
                <span className="block">แต่หลายคนไม่รู้ว่ามี</span>
              </>
            ) : (
              <>
                <span className="block">Scholarships exist.</span>
                <span className="block">Most students just never hear about them.</span>
              </>
            )}
          </h2>

          <div
            style={{
              fontSize: '1rem',
              color: '#6E7A8A',
              lineHeight: 1.85,
              maxWidth: '600px',
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="space-y-5 dark:text-[#7A8FA8]"
          >
            <p>
              {th
                ? 'ประเทศไทยมีทุนการศึกษาให้นักเรียนและนักศึกษาหลายร้อยรายการ ตั้งแต่ทุนของรัฐบาล ทุนมหาวิทยาลัย ไปจนถึงทุนจากบริษัทเอกชนและมูลนิธิต่าง ๆ แต่ทุนเหล่านี้กระจัดกระจายอยู่ตามเว็บไซต์ต่าง ๆ ยากต่อการค้นหา และหลายทุนไม่เคยปรากฏในผลการค้นหาของ Google เลย'
                : 'Thailand has hundreds of scholarships for students at every level — from government grants to university programs to corporate foundations. But they are scattered across dozens of websites, hard to find, and many never appear in search results at all.'}
            </p>
            <p>
              {th
                ? 'นักเรียนในต่างจังหวัดมักเสียเปรียบ ไม่ใช่เพราะขาดความสามารถ แต่เพราะขาดข้อมูล TunDee สร้างขึ้นเพื่อแก้ปัญหานี้โดยตรง'
                : 'Students in rural areas are often left out — not because they are less capable, but because they have less access to information. TunDee was built to fix that directly.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: HOW IT WORKS ── */}
      <section className="bg-white dark:bg-[#07111F] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p
            className="mb-6"
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#8A96A8',
              fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
          >
            {th ? 'วิธีการทำงาน' : 'HOW IT WORKS'}
          </p>

          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 300,
              color: '#0A2342',
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="mb-10 dark:text-[#E8EDF5]"
          >
            {th ? 'ง่ายกว่าที่คิด' : 'Simpler than you think'}
          </h2>

          <div className="divide-y divide-[#E8ECF2] dark:divide-[#1A2E4A]">
            {[
              {
                num: '01',
                titleTh: 'กรอกข้อมูลของคุณ',
                titleEn: 'Tell us about yourself',
                descTh: 'ระบุระดับชั้น เกรดเฉลี่ย จังหวัดที่อยู่ รายได้ครัวเรือน และสาขาที่สนใจ ใช้เวลาไม่ถึง 3 นาที',
                descEn: 'Enter your grade, GPA, province, household income and field of interest. Takes under 3 minutes.',
              },
              {
                num: '02',
                titleTh: 'รับรายชื่อทุนที่เหมาะกับคุณ',
                titleEn: 'Get your matched scholarships',
                descTh: 'ระบบจะแสดงทุนที่คุณมีสิทธิ์สมัครจริง พร้อมอธิบายว่าเหมาะกับคุณอย่างไร ไม่มีทุนที่ไม่เกี่ยวข้องให้เสียเวลา',
                descEn: 'We show only scholarships you actually qualify for, and explain why each one matches your profile. No irrelevant results to wade through.',
              },
              {
                num: '03',
                titleTh: 'สมัครและติดตามได้เลย',
                titleEn: 'Apply and track your progress',
                descTh: 'กดสมัครที่เว็บไซต์ทุนโดยตรง แล้วใช้ TunDee ติดตามว่าส่งเอกสารครบแล้วหรือยัง ไม่มีทุนไหนตกหล่นอีก',
                descEn: 'Apply directly on the official scholarship website. Use TunDee to track your progress and make sure nothing slips through.',
              },
            ].map((step) => (
              <div key={step.num} className="py-6 flex gap-6 items-start">
                <span
                  className="shrink-0 mt-0.5"
                  style={{
                    fontSize: '11px',
                    color: '#DDE3EE',
                    fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
                    letterSpacing: '1px',
                    minWidth: '24px',
                  }}
                >
                  {step.num}
                </span>
                <div>
                  <p
                    className="mb-1"
                    style={{
                      fontSize: '15px',
                      fontWeight: 500,
                      color: '#0A2342',
                      fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                    }}
                  >
                    <span className="dark:text-[#E8EDF5]">{th ? step.titleTh : step.titleEn}</span>
                  </p>
                  <p
                    style={{
                      fontSize: '14px',
                      color: '#6E7A8A',
                      lineHeight: 1.75,
                      fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                    }}
                    className="dark:text-[#7A8FA8]"
                  >
                    {th ? step.descTh : step.descEn}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: WHAT MAKES IT DIFFERENT ── */}
      <section className="bg-[#F5F7FA] dark:bg-[#0A1628] px-6 py-16 md:py-20">
        <div className="max-w-[900px] mx-auto">
          <p
            className="mb-6"
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#8A96A8',
              fontFamily: 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
          >
            {th ? 'ทำไมต้อง TunDee' : 'WHY TUNDEE'}
          </p>

          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 300,
              color: '#0A2342',
              fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
            }}
            className="mb-10 dark:text-[#E8EDF5]"
          >
            {th ? 'ไม่ใช่แค่การค้นหา' : 'More than just a search'}
          </h2>

          <div className="divide-y divide-[#E8ECF2] dark:divide-[#1A2E4A]">
            {[
              {
                headingTh: 'เฉพาะทุนที่คุณมีสิทธิ์',
                headingEn: 'Only scholarships you qualify for',
                descTh: 'เราไม่แสดงทุนที่คุณสมัครไม่ได้ ทุกรายการที่เห็นผ่านเกณฑ์ของคุณแล้ว',
                descEn: 'We filter out scholarships you cannot apply for. Everything you see is relevant to you.',
              },
              {
                headingTh: 'ข้อมูลที่ตรวจสอบแล้ว',
                headingEn: 'Verified information',
                descTh: 'ทุนทุกรายการตรวจสอบจากแหล่งข้อมูลจริง และอัปเดตสม่ำเสมอ ไม่มีข้อมูลที่ล้าสมัย',
                descEn: 'Every scholarship is verified from its official source and updated regularly. No outdated deadlines.',
              },
              {
                headingTh: 'ฟรีตลอด ไม่มีเงื่อนไข',
                headingEn: 'Always free, no conditions',
                descTh: 'TunDee ฟรีสำหรับนักเรียนทุกคน ไม่ต้องสมัครสมาชิกก่อนก็ดูทุนได้',
                descEn: 'TunDee is free for every student. You can browse scholarships without even creating an account.',
              },
              {
                headingTh: 'ครอบคลุมทุกจังหวัด',
                headingEn: 'Covers all 77 provinces',
                descTh: 'รวมทั้งทุนระดับชาติและทุนเฉพาะจังหวัด ทุนท้องถิ่นที่ไม่ค่อยมีคนรู้จักก็มีอยู่ที่นี่',
                descEn: 'Including national scholarships and province-specific grants. Local scholarships that rarely get attention are here too.',
              },
            ].map((point, i) => (
              <div key={i} style={{ padding: '20px 0' }}>
                <p
                  className="mb-1"
                  style={{
                    fontSize: '15px',
                    fontWeight: 500,
                    color: '#0A2342',
                    fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                  }}
                >
                  <span className="dark:text-[#E8EDF5]">{th ? point.headingTh : point.headingEn}</span>
                </p>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#6E7A8A',
                    lineHeight: 1.75,
                    fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
                  }}
                  className="dark:text-[#7A8FA8]"
                >
                  {th ? point.descTh : point.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: FINAL CTA ── */}
      <section className="bg-[#0A2342] px-6 py-20 text-center">
        <h2
          style={{
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 300,
            color: 'white',
            fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
          }}
          className="mb-4"
        >
          {th ? 'เริ่มต้นได้เลยวันนี้' : 'Start today'}
        </h2>
        <p
          style={{
            fontSize: '15px',
            color: 'rgba(255,255,255,0.55)',
            fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
          }}
          className="mb-8"
        >
          {th ? 'ฟรี ไม่มีค่าใช้จ่าย ใช้เวลาไม่ถึง 3 นาที' : 'Free. No cost. Takes less than 3 minutes.'}
        </p>
        <Link
          href="/scholarships"
          className="inline-block transition-colors hover:bg-[#EBF2FF]"
          style={{
            background: 'white',
            color: '#0A2342',
            borderRadius: '28px',
            padding: '13px 32px',
            fontSize: '14px',
            fontWeight: 500,
            fontFamily: th ? 'Sarabun, system-ui, sans-serif' : 'var(--font-lato), Lato, system-ui, sans-serif',
          }}
        >
          {th ? 'ค้นหาทุนของฉัน' : 'Find my scholarships'}
        </Link>
      </section>

    </div>
  );
}
