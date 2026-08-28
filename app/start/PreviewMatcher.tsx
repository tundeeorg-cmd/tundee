'use client';

/**
 * "Taste before signup" matcher for /start.
 *
 * Three inputs, one screen, above the fold: ระดับชั้น / เกรดเฉลี่ย / จังหวัด.
 * Income is deliberately NOT asked here — the recommender falls back to the same
 * default it already uses for logged-in students without income on file, and
 * every extra field on a cold-traffic landing page costs conversions.
 *
 * Submitting calls the public /api/preview-match endpoint (no account needed)
 * and swaps the form for real matched cards.
 */

import { useEffect, useRef, useState } from 'react';
import { PREVIEW_LEVELS, type PreviewInput, type PreviewResponse } from '@/lib/preview/types';
import { PROVINCES_TH } from '@/lib/translations';
import { trackPreviewSearch } from '@/lib/adTracking';
import { logFunnelEvent } from '@/lib/research/funnel';
import PreviewResults from './PreviewResults';

const th = { fontFamily: "'Sarabun', system-ui, sans-serif" } as const;

/** Mirrors the answers locally so a back-navigation doesn't blank the form. */
const DRAFT_KEY = 'tundee_preview_draft';

/**
 * Monthly household income brackets — the SAME 1–7 scale as INCOME_OPTIONS in
 * app/profile/setup/page.tsx and INCOME_CEILING in lib/matching/engine.ts.
 * PREREG §5.2 defines income_bracket <= 3 as at or below THB 15,000/month.
 */
const PREVIEW_INCOME_OPTIONS: { value: number; th: string }[] = [
  { value: 1, th: 'ต่ำกว่า 5,000' },
  { value: 2, th: '5,000 – 10,000' },
  { value: 3, th: '10,000 – 15,000' },
  { value: 4, th: '15,000 – 20,000' },
  { value: 5, th: '20,000 – 30,000' },
  { value: 6, th: '30,000 – 50,000' },
  { value: 7, th: 'มากกว่า 50,000' },
];

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function PreviewMatcher({ signupHref }: { signupHref: string }) {
  const [level,    setLevel]    = useState('');
  const [province, setProvince] = useState('');
  const [income,   setIncome]   = useState<number | null>(null);
  // Optional. Left blank, GPA-gated scholarships are excluded from the results
  // rather than assumed away, so the count stays honest.
  const [gpa,      setGpa]      = useState('');

  // quiz_started fires once per session, on the first field the visitor
  // actually touches — not on render. A view is landing_view; this event is
  // meant to mean "they engaged", so the drop-off between the two is readable.
  const quizStarted = useRef(false);
  function markQuizStarted() {
    if (quizStarted.current) return;
    quizStarted.current = true;
    logFunnelEvent({ eventType: 'quiz_started' });
  }

  const [status,  setStatus]  = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<PreviewResponse | null>(null);

  // Restore a previous draft (e.g. the visitor tapped back from /auth)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved) as Partial<PreviewInput>;
      if (typeof draft.level === 'string') setLevel(draft.level);
      if (typeof draft.province === 'string') setProvince(draft.province);
      if (typeof draft.income === 'number') setIncome(draft.income);
      if (typeof draft.gpa === 'number') setGpa(String(draft.gpa));
    } catch {
      // sessionStorage unavailable or corrupt draft — start fresh
    }
  }, []);

  function validate(): PreviewInput | null {
    if (!level) {
      setMessage('กรุณาเลือกระดับชั้นของคุณ');
      return null;
    }
    if (!province) {
      setMessage('กรุณาเลือกจังหวัดของคุณ');
      return null;
    }
    if (income === null) {
      setMessage('กรุณาเลือกรายได้ครัวเรือนต่อเดือน');
      return null;
    }

    // GPA is optional — blank is a valid answer, not a validation failure.
    // A value that IS supplied still has to be a real grade.
    let gpaNum: number | null = null;
    if (gpa.trim() !== '') {
      const parsed = parseFloat(gpa);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) {
        setMessage('เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00 – 4.00');
        return null;
      }
      gpaNum = parsed;
    }

    setMessage('');
    return { level, province, income, gpa: gpaNum };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = validate();
    if (!input) return;

    setStatus('loading');

    // Search fires on intent, before the result is known — a visitor who
    // searched and got nothing is still a signal worth optimizing against.
    trackPreviewSearch({
      educationLevel: input.level,
      gpa:            input.gpa ?? 0,
      province:       input.province,
    });

    logFunnelEvent({
      eventType: 'quiz_completed',
      context: {
        level:          input.level,
        province:       input.province,
        income_bracket: input.income,
        gave_gpa:       input.gpa !== null,
      },
    });

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    } catch {
      // non-fatal — the server cookie is the source of truth through signup
    }

    try {
      const res = await fetch('/api/preview-match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      });

      if (!res.ok) {
        setStatus('error');
        setMessage(
          res.status === 429
            ? 'มีการค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
            : 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง'
        );
        return;
      }

      setResults((await res.json()) as PreviewResponse);
      setStatus('done');
    } catch {
      setStatus('error');
      setMessage('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    }
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (status === 'done' && results) {
    return (
      <div className="max-w-[500px] mx-auto">
        <PreviewResults
          results={results}
          signupHref={signupHref}
          onReset={() => { setStatus('idle'); setResults(null); }}
        />
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="max-w-[500px] mx-auto">
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="w-5 h-5 border-2 border-[#1B3A6B]/30 border-t-[#1B3A6B] rounded-full animate-spin" />
          <p className="text-sm font-semibold text-[#0A2342] dark:text-[#E8EDF5]" style={th}>
            กำลังค้นหาทุนที่ตรงกับคุณ…
          </p>
        </div>
        <div className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#0A1628] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-2xl p-5 animate-pulse"
            >
              <div className="h-4 w-3/4 rounded bg-[#E8ECF2] dark:bg-[#16263F]" />
              <div className="h-3 w-1/2 rounded bg-[#E8ECF2] dark:bg-[#16263F] mt-3" />
              <div className="h-12 rounded-xl bg-[#F0F4F9] dark:bg-[#0D1F35] mt-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Form (idle / error) ────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-[500px] mx-auto text-left">
      <div className="bg-white dark:bg-[#0A1628] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-2xl p-5">

        {/* ระดับชั้น */}
        <label className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-2.5" style={th}>
          ระดับชั้นของคุณ
        </label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {PREVIEW_LEVELS.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { markQuizStarted(); setLevel(opt.value); setMessage(''); }}
              aria-pressed={level === opt.value}
              style={th}
              className={`min-h-[52px] px-3 rounded-xl border-2 font-semibold text-sm transition-colors ${
                i === PREVIEW_LEVELS.length - 1 ? 'col-span-2' : ''
              } ${
                level === opt.value
                  ? 'border-[#1B3A6B] bg-[#EBF2FF] dark:bg-[#162552] text-[#1B3A6B] dark:text-[#8FB4FF]'
                  : 'border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0D1F35] text-[#6E7A8A] dark:text-[#8e9bb0]'
              }`}
            >
              {opt.th}
            </button>
          ))}
        </div>

        {/* จังหวัด */}
        <label htmlFor="preview-province" className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-2.5" style={th}>
          จังหวัดของคุณ
        </label>
        <select
          id="preview-province"
          value={province}
          onChange={(e) => { markQuizStarted(); setProvince(e.target.value); setMessage(''); }}
          style={{ ...th, fontSize: '16px' }}
          className="w-full min-h-[52px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] focus:outline-none focus:border-[#1B3A6B] transition-colors mb-5"
        >
          <option value="">เลือกจังหวัด</option>
          {PROVINCES_TH.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* รายได้ครัวเรือนต่อเดือน — the third question. Buttons rather than a
            select: one tap, no keyboard, and the brackets are visible at a
            glance on a small screen. Values are the 1–7 scale used everywhere
            else (INCOME_OPTIONS, app/profile/setup/page.tsx). */}
        <label className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-2.5" style={th}>
          รายได้ครัวเรือนต่อเดือน
        </label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {PREVIEW_INCOME_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { markQuizStarted(); setIncome(opt.value); setMessage(''); }}
              aria-pressed={income === opt.value}
              style={th}
              className={`min-h-[52px] px-3 rounded-xl border-2 font-semibold text-sm transition-colors ${
                i === PREVIEW_INCOME_OPTIONS.length - 1 ? 'col-span-2' : ''
              } ${
                income === opt.value
                  ? 'border-[#1B3A6B] bg-[#EBF2FF] dark:bg-[#162552] text-[#1B3A6B] dark:text-[#8FB4FF]'
                  : 'border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0D1F35] text-[#6E7A8A] dark:text-[#8e9bb0]'
              }`}
            >
              {opt.th}
            </button>
          ))}
        </div>

        {/* GPA — optional, and last. Leaving it blank costs the visitor only
            the GPA-restricted scholarships, which are excluded rather than
            guessed at, so the count they see stays true. */}
        <label htmlFor="preview-gpa" className="block text-sm font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-1" style={th}>
          เกรดเฉลี่ย (GPA){' '}
          <span className="font-normal text-[#6E7A8A] dark:text-[#8e9bb0]">— ไม่ใส่ก็ได้</span>
        </label>
        <p className="text-xs text-[#6E7A8A] dark:text-[#8e9bb0] mb-2.5" style={th}>
          ใส่เกรดแล้วจะเห็นทุนที่กำหนดเกรดขั้นต่ำเพิ่มขึ้น
        </p>
        <input
          id="preview-gpa"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          max="4"
          value={gpa}
          onChange={(e) => { markQuizStarted(); setGpa(e.target.value); setMessage(''); }}
          placeholder="เช่น 3.25"
          style={{ ...th, fontSize: '16px' }}
          className="w-full min-h-[52px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0] focus:outline-none focus:border-[#1B3A6B] transition-colors mb-5"
        />

        {message && (
          <p className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-600 dark:text-red-400" style={th} role="alert">
            {message}
          </p>
        )}

        <button
          type="submit"
          style={th}
          className="w-full min-h-[56px] bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white rounded-2xl font-bold text-base transition-colors active:opacity-90"
        >
          ดูทุนที่ฉันมีสิทธิ์ →
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={th}>
        ไม่ต้องสมัครสมาชิก · เห็นผลลัพธ์ทันทีใน 10 วินาที
      </p>
    </form>
  );
}
