'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { persistAdParams, buildSignupHref, trackCTAClick, type AdParams } from '@/lib/adTracking';
import PreviewMatcher from './PreviewMatcher';

/** Where a visitor lands after logging in — their full matched results. */
const POST_LOGIN_DESTINATION = '/scholarships?from=preview';

/** Anchor for the in-page CTAs that send the visitor back up to the matcher. */
const MATCHER_ANCHOR = 'tundee-matcher';

const th = { fontFamily: "'Sarabun', system-ui, sans-serif" } as const;

const HOW_IT_WORKS = [
  { n: '1', title: 'บอกเราเกี่ยวกับตัวคุณ', sub: 'เกรด จังหวัด รายได้ครอบครัว' },
  { n: '2', title: 'เจอทุนที่คุณมีสิทธิ์จริง', sub: 'AI จัดอันดับให้คุณ ไม่ต้องนั่งไล่อ่านเอง' },
  { n: '3', title: 'สมัครอย่างมั่นใจ', sub: 'เราพาคุณเตรียมเอกสารและสมัครทีละขั้น' },
];

const WHY_TUNDEE = [
  { title: 'ตรวจสอบโดยคนจริงทุกทุน', desc: 'ไม่มีข้อมูลหมดอายุหรือข้อมูลลวง' },
  { title: 'ฟรีตลอดไป', desc: 'ไม่มีโฆษณาจากผู้ให้ทุน ผลลัพธ์จึงไม่มีอคติ' },
  { title: 'ในภาษาที่คุณเข้าใจ', desc: 'ในภาษาและสำเนียงที่คุณเข้าใจจริง' },
  { title: 'สร้างเพื่อคุณ', desc: 'สร้างเพื่อคนที่ไม่เคยมีใครคอยแนะแนว' },
];

const WHO_ITS_FOR = [
  'คุณเป็นนักเรียนไทยอายุ 15–25 ปี ที่กำลังหาทุนเรียนต่อ',
  'คุณอยู่ต่างจังหวัด หรือครอบครัวมีรายได้จำกัด',
  'คุณเป็นคนแรกในบ้านที่ได้เรียนต่อ และไม่รู้จะเริ่มยังไง',
];

const FAQ = [
  { q: 'ฟรีจริงไหม?', a: 'ฟรี 100% ไม่มีค่าใช้จ่ายแอบแฝง' },
  { q: 'ใช้เวลานานไหม?', a: 'กรอกข้อมูลแค่ ~3 นาที ก็เห็นทุนที่ใช่' },
  { q: 'ต้องเตรียมเอกสารก่อนไหม?', a: 'ไม่ต้อง เริ่มได้เลย เดี๋ยวเราบอกทีหลังว่าต้องใช้อะไร' },
  { q: 'ข้อมูลของฉันปลอดภัยไหม?', a: 'เราเก็บข้อมูลอย่างปลอดภัยและไม่ขายให้ใคร' },
];

function CtaButton({ href, location, children }: { href: string; location: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={() => trackCTAClick(location)}
      style={th}
      className="block w-full max-w-sm mx-auto text-center bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-4 px-8 rounded-2xl font-bold text-base transition-colors active:opacity-90"
    >
      {children}
    </Link>
  );
}

export default function StartLanding({
  adParams,
  scholarshipCount,
}: {
  adParams: AdParams;
  /** Live count from lib/scholarships/counts.ts; null when the query failed. */
  scholarshipCount: number | null;
}) {
  const ctaHref = buildSignupHref(adParams, POST_LOGIN_DESTINATION);

  useEffect(() => {
    persistAdParams(adParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F]">
      {/* ── Minimal top bar: logo only, not linked ─────────────────────────── */}
      <div className="max-w-[600px] mx-auto px-5 pt-5">
        <span className="text-[18px] font-semibold text-[#0A2342] dark:text-white" style={th}>
          ทุนดี
        </span>
      </div>

      {/* ── A) Hero + matcher ────────────────────────────────────────────────── */}
      {/* The matcher sits directly under the headline so it stays above the fold
          on a phone — cold ad traffic sees real matches before any signup ask. */}
      <section id={MATCHER_ANCHOR} className="px-5 pt-6 pb-10 text-center scroll-mt-4">
        <p
          className="inline-block bg-[#EBF2FF] dark:bg-[#0D1F35] text-[#1B3A6B] dark:text-[#8FB4FF] text-xs font-semibold px-3 py-1.5 rounded-full mb-4"
          style={th}
        >
          ฟรี · ไม่ต้องสมัครสมาชิกก่อนดู
        </p>
        <h1
          className="font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-3 mx-auto"
          style={{ ...th, fontSize: 'clamp(1.5rem, 6vw, 2.2rem)', lineHeight: 1.4, maxWidth: 480 }}
        >
          ดูทุนที่คุณ &ldquo;มีสิทธิ์จริง&rdquo; ใน 30 วินาที
        </h1>
        <p
          className="text-[#6E7A8A] dark:text-[#8e9bb0] mb-6 mx-auto leading-relaxed"
          style={{ ...th, fontSize: 'clamp(0.95rem, 3.5vw, 1.05rem)', maxWidth: 420 }}
        >
          ตอบแค่ 3 ข้อ แล้วดูผลลัพธ์ทันที — ไม่ต้องสมัครสมาชิก ไม่ต้องจ่ายอะไรเลย
        </p>

        <PreviewMatcher signupHref={ctaHref} />
      </section>

      {/* ── B) Trust bar ─────────────────────────────────────────────────────── */}
      <section className="px-5 pb-10">
        <div className="max-w-[500px] mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center">
          {['ตรวจสอบโดยคนจริงทุกทุน', 'ฟรีตลอดไป', 'ในภาษาที่คุณเข้าใจ'].map((item) => (
            <span key={item} className="text-xs text-[#6E7A8A] dark:text-[#8e9bb0]" style={th}>
              ✓ {item}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={th}>
          {/* Was "ทุนที่ตรวจสอบแล้วกว่า 90 รายการ". Two problems: the count was a
              literal, and "ตรวจสอบแล้ว" (verified) described all of them when 72 of
              518 carry verification_status = 'verified'. "กว่า" is a "+" in words and
              overstates a number the database knows exactly. */}
          {scholarshipCount !== null && `ทุนการศึกษา ${scholarshipCount.toLocaleString('th-TH')} ทุน`}
        </p>
      </section>

      {/* ── C) Problem ───────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#0A1628] px-5 py-12">
        <div className="max-w-[500px] mx-auto text-center">
          <h2
            className="font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-4"
            style={{ ...th, fontSize: 'clamp(1.3rem, 5vw, 1.6rem)', lineHeight: 1.4 }}
          >
            ทุกปี ทุนหลายล้านบาท…ไม่มีใครมารับ
          </h2>
          <p className="text-[#6E7A8A] dark:text-[#8e9bb0] leading-relaxed" style={{ ...th, fontSize: '0.95rem' }}>
            ไม่ใช่เพราะนักเรียนไม่เก่งพอ แต่เพราะไม่มีใครบอกว่าโอกาสนั้นมีอยู่จริง
            คนที่พลาดบ่อยที่สุดคือคนที่ต้องการมันที่สุด — เด็กต่างจังหวัด ครอบครัวรายได้น้อย
            และคนแรกในบ้านที่ได้เรียนต่อ อย่าให้คุณเป็นคนต่อไปที่พลาดทุนที่ควรได้
          </p>
        </div>
      </section>

      {/* ── D) How it works ──────────────────────────────────────────────────── */}
      <section className="px-5 py-12">
        <div className="max-w-[500px] mx-auto">
          <h2
            className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-8"
            style={{ ...th, fontSize: 'clamp(1.3rem, 5vw, 1.6rem)' }}
          >
            ใช้งานง่ายแค่ 3 ขั้นตอน
          </h2>
          <div className="flex flex-col gap-5">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.n} className="flex items-start gap-4">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-[#1B3A6B] text-white"
                  style={th}
                >
                  {step.n}
                </div>
                <div>
                  <p className="font-semibold text-[#0A2342] dark:text-[#E8EDF5]" style={{ ...th, fontSize: '0.95rem' }}>
                    {step.title}
                  </p>
                  <p className="text-[#6E7A8A] dark:text-[#8e9bb0] text-sm mt-0.5" style={th}>
                    {step.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── E) Why TunDee ─────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#0A1628] px-5 py-12">
        <div className="max-w-[560px] mx-auto">
          <h2
            className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-8"
            style={{ ...th, fontSize: 'clamp(1.3rem, 5vw, 1.6rem)' }}
          >
            ทำไมต้อง TunDee
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WHY_TUNDEE.map((card) => (
              <div
                key={card.title}
                className="bg-[#F5F7FA] dark:bg-[#0D1F35] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-card p-5"
              >
                <p className="font-semibold text-[#0A2342] dark:text-[#E8EDF5] mb-1" style={{ ...th, fontSize: '0.95rem' }}>
                  {card.title}
                </p>
                <p className="text-[#6E7A8A] dark:text-[#8e9bb0] text-sm leading-relaxed" style={th}>
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── F) Who it's for ──────────────────────────────────────────────────── */}
      <section className="px-5 py-12">
        <div className="max-w-[500px] mx-auto">
          <h2
            className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-6"
            style={{ ...th, fontSize: 'clamp(1.3rem, 5vw, 1.6rem)' }}
          >
            TunDee เหมาะกับคุณ ถ้า…
          </h2>
          <ul className="flex flex-col gap-3">
            {WHO_ITS_FOR.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="text-[#1B3A6B] dark:text-[#8FB4FF] font-bold shrink-0" style={th}>✓</span>
                <span className="text-[#6E7A8A] dark:text-[#8e9bb0] text-sm leading-relaxed" style={th}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── G) FAQ ────────────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#0A1628] px-5 py-12">
        <div className="max-w-[500px] mx-auto">
          <h2
            className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center mb-6"
            style={{ ...th, fontSize: 'clamp(1.3rem, 5vw, 1.6rem)' }}
          >
            คำถามที่พบบ่อย
          </h2>
          <div className="divide-y divide-[#E8ECF2] dark:divide-[#1A2E4A]">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4 [&::-webkit-details-marker]:hidden">
                <summary
                  className="flex items-center justify-between gap-3 cursor-pointer list-none font-semibold text-[#0A2342] dark:text-[#E8EDF5]"
                  style={{ ...th, fontSize: '0.95rem' }}
                >
                  {item.q}
                  <svg
                    className="w-4 h-4 text-[#8A96A8] shrink-0 transition-transform group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-2 text-[#6E7A8A] dark:text-[#8e9bb0] text-sm leading-relaxed" style={th}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── H) Final CTA ─────────────────────────────────────────────────────── */}
      <section className="px-5 py-14 text-center">
        <h2
          className="font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-6 mx-auto"
          style={{ ...th, fontSize: 'clamp(1.3rem, 5.5vw, 1.7rem)', maxWidth: 420, lineHeight: 1.4 }}
        >
          โอกาสของคุณรออยู่แล้ว เริ่มเลยวันนี้
        </h2>
        {/* Sends the visitor back to the matcher, not to signup — they should
            see their own matches before we ask for an account. */}
        <CtaButton href={`#${MATCHER_ANCHOR}`} location="final">
          ดูทุนที่ฉันมีสิทธิ์ (ฟรี) →
        </CtaButton>
      </section>

      {/* ── Minimal footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E8ECF2] dark:border-[#1A2E4A]">
        <div className="max-w-[500px] mx-auto px-5 py-8 flex flex-col items-center gap-4 text-center">
          <span className="text-base font-semibold text-[#0A2342] dark:text-white" style={th}>
            ทุนดี
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://line.me/R/ti/p/@tundee"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LINE"
              className="text-[#8A96A8] hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/tundee_thailand"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="text-[#8A96A8] hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/tundeeth/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="text-[#8A96A8] hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={th}>
            <span>© TunDee</span>
            <span>·</span>
            <span>tundee.org</span>
            <span>·</span>
            <Link href="/privacy" className="hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
