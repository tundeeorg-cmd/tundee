'use client'

/**
 * Client component for /students
 *
 * On mount: stores ?src= in localStorage so the signup/profile flow
 * can write it to profiles.acquisition_source.
 */

import { useEffect } from 'react'
import Link from 'next/link'

const STEPS = [
  {
    n: '1',
    th: 'เข้าเว็บ tundee.org',
    sub: 'บนมือถือหรือคอมพิวเตอร์',
  },
  {
    n: '2',
    th: 'กรอกข้อมูลของน้อง',
    sub: 'เกรด GPA จังหวัด รายได้ครัวเรือน',
  },
  {
    n: '3',
    th: 'ดูทุนที่มีสิทธิ์ พร้อมเหตุผล',
    sub: 'ระบบบอกว่าทำไมน้องถึงมีสิทธิ์ทุนนั้น',
  },
]

export default function StudentsLanding({ src }: { src: string }) {
  // Persist acquisition source through the signup flow
  useEffect(() => {
    try {
      localStorage.setItem('tundee_src', src)
    } catch {
      // localStorage unavailable (private browsing, etc.) — fail silently
    }
  }, [src])

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0A2342 0%, #0D2D54 100%)' }}
    >
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center px-5 pt-14 pb-8 text-center">

        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-10">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold text-white shrink-0"
            style={{ background: '#2E5FA3' }}
          >
            ท
          </div>
          <div className="flex flex-col items-start leading-none gap-0.5">
            <span className="text-white font-bold text-2xl" style={{ fontFamily: 'Sarabun, sans-serif' }}>
              ทุนดี
            </span>
            <span
              className="text-white/40 text-[10px] tracking-[0.18em] font-light"
              style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
            >
              TUNDEE
            </span>
          </div>
        </div>

        {/* Headline */}
        <h1
          className="text-white font-bold leading-snug mb-4"
          style={{
            fontFamily: 'Sarabun, sans-serif',
            fontSize: 'clamp(1.65rem, 6vw, 2.5rem)',
            maxWidth: 480,
          }}
        >
          ทุนที่น้องสมัครได้
          <br />
          อาจอยู่ตรงหน้าโดยไม่รู้ตัว
        </h1>

        {/* Sub */}
        <p
          className="text-white/70 mb-10 leading-relaxed"
          style={{
            fontFamily: 'Sarabun, sans-serif',
            fontSize: 'clamp(1rem, 3.5vw, 1.2rem)',
            maxWidth: 360,
          }}
        >
          เช็กฟรีใน 2 นาที ว่าน้องมีสิทธิ์ทุนไหนบ้าง
        </p>

        {/* CTA */}
        <Link
          href="/auth?from=signup"
          className="block w-full max-w-xs font-bold text-white text-center py-4 px-8 rounded-2xl transition-opacity active:opacity-80"
          style={{
            background: 'linear-gradient(135deg, #2E5FA3, #1B3A6B)',
            fontFamily: 'Sarabun, sans-serif',
            fontSize: '1.1rem',
            boxShadow: '0 4px 20px rgba(46,95,163,0.5)',
          }}
        >
          เช็กทุนของฉัน →
        </Link>

        {/* Trust */}
        <p
          className="mt-5 text-white/40 text-xs text-center"
          style={{ fontFamily: 'Sarabun, sans-serif' }}
        >
          ฟรีสำหรับนักเรียนเสมอ&nbsp;•&nbsp;แสดงเฉพาะทุนจริงที่ตรวจสอบแล้ว
        </p>
      </section>

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <section className="px-5 pb-10">
        <div
          className="rounded-2xl overflow-hidden divide-y divide-white/[0.07]"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {STEPS.map((step) => (
            <div key={step.n} className="flex items-center gap-4 px-5 py-4">
              {/* Step number */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: '#1B3A6B', color: '#A8C4FF' }}
              >
                {step.n}
              </div>
              <div>
                <p
                  className="text-white font-semibold leading-tight"
                  style={{ fontFamily: 'Sarabun, sans-serif', fontSize: '0.95rem' }}
                >
                  {step.th}
                </p>
                <p
                  className="text-white/45 text-xs mt-0.5 leading-snug"
                  style={{ fontFamily: 'Sarabun, sans-serif' }}
                >
                  {step.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer CTA repeat (for users who scroll) ──────────────────────── */}
      <section className="px-5 pb-12 text-center">
        <Link
          href="/auth?from=signup"
          className="inline-block font-semibold text-white/80 underline underline-offset-4 text-sm"
          style={{ fontFamily: 'Sarabun, sans-serif' }}
        >
          สมัครฟรี ไม่ต้องติดตั้งแอป →
        </Link>
      </section>
    </main>
  )
}
