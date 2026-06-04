'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import Link from 'next/link';

// ── Static step definitions ───────────────────────────────────────────────

interface Step {
  number: number;
  th: string;
  en: string;
  desc_th: string;
  desc_en: string;
}

const STEPS: Step[] = [
  { number: 1, th: 'ยืนยันคุณสมบัติ',       en: 'Confirm Eligibility',
    desc_th: 'ตรวจสอบเกรด รายได้ครอบครัว และเงื่อนไขทุกข้อก่อนสมัคร',
    desc_en: 'Check that you meet the GPA, income, and all other requirements.' },
  { number: 2, th: 'รวบรวมเอกสาร',          en: 'Gather Documents',
    desc_th: 'เตรียมใบแสดงผลการเรียน สำเนาบัตรประชาชน และหนังสือรับรองรายได้',
    desc_en: 'Prepare your transcript, ID copy, income certificate, and other required docs.' },
  { number: 3, th: 'เขียนเรียงความ',         en: 'Write Personal Statement',
    desc_th: 'เขียนเรียงความสะท้อนความตั้งใจ เป้าหมาย และเหตุผลที่ต้องการทุนนี้',
    desc_en: 'Write an essay reflecting your motivation, goals, and why you need this scholarship.' },
  { number: 4, th: 'ขอจดหมายแนะนำ',         en: 'Get Recommendation Letter',
    desc_th: 'ติดต่ออาจารย์หรือที่ปรึกษาล่วงหน้าอย่างน้อย 2 สัปดาห์',
    desc_en: 'Contact your teacher or advisor at least 2 weeks before the deadline.' },
  { number: 5, th: 'สมัครบนเว็บไซต์ทุน',    en: 'Submit Application Online',
    desc_th: 'กรอกใบสมัครและอัปโหลดเอกสารทั้งหมดบนระบบออนไลน์ของผู้ให้ทุน',
    desc_en: "Fill in the application form and upload all documents on the funder's portal." },
  { number: 6, th: 'ยืนยันการส่งใบสมัคร',   en: 'Confirm Submission',
    desc_th: 'บันทึกหมายเลขอ้างอิงและตรวจสอบอีเมลยืนยันจากผู้ให้ทุน',
    desc_en: 'Save your reference number and check for a confirmation email.' },
  { number: 7, th: 'รายงานผล',               en: 'Report Outcome',
    desc_th: 'แจ้งผลการสมัครให้ครอบครัวและโรงเรียนทราบ และเตรียมเอกสารสำหรับขั้นตอนถัดไป',
    desc_en: 'Let your family and school know the result, and prepare for next steps.' },
];

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  scholarshipId: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function InteractiveChecklist({ scholarshipId }: Props) {
  const { lang } = useLang();
  const supabase = createClient();

  const [userId, setUserId]             = useState<string | null>(null);
  const [completedSteps, setCompleted]  = useState<number[]>([]);
  const [expanded, setExpanded]         = useState<number | null>(null);
  const [saving, setSaving]             = useState(false);

  // ── Load user + existing progress ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) return;
      const uid = session.user.id;
      setUserId(uid);

      try {
        const { data } = await supabase
          .from('applications')
          .select('checklist_progress')
          .eq('user_id', uid)
          .eq('scholarship_id', scholarshipId)
          .maybeSingle();
        if (mounted && data?.checklist_progress) {
          setCompleted(data.checklist_progress);
        }
      } catch { /* silent — table may not exist yet */ }
    };
    init();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  // ── Toggle step ────────────────────────────────────────────────────────
  async function toggleStep(stepNum: number) {
    if (!userId) return;

    const newCompleted = completedSteps.includes(stepNum)
      ? completedSteps.filter((s) => s !== stepNum)
      : [...completedSteps, stepNum].sort((a, b) => a - b);

    setCompleted(newCompleted); // optimistic

    setSaving(true);
    try {
      await supabase.from('applications').upsert(
        {
          user_id: userId,
          scholarship_id: scholarshipId,
          status: newCompleted.length > 0 ? 'in_progress' : 'started',
          checklist_progress: newCompleted,
        },
        { onConflict: 'user_id,scholarship_id' }
      );
      console.log('[TunDee] Checklist saved:', newCompleted);
    } catch {
      // Roll back on error
      setCompleted(completedSteps);
    } finally {
      setSaving(false);
    }
  }

  const doneCount = completedSteps.length;
  const progress  = Math.round((doneCount / 7) * 100);

  return (
    <div>
      {/* Section header */}
      <h2
        className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-1"
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
      >
        {lang === 'th' ? '7 ขั้นตอนการสมัครทุน' : '7-Step Application Guide'}
      </h2>
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-4">
        {lang === 'th'
          ? 'ทำตามขั้นตอนเพื่อให้การสมัครสำเร็จ'
          : 'Follow these steps to maximise your chances'}
      </p>

      {/* Progress bar (for logged-in users) */}
      {userId && (
        <div className="mb-6 p-4 bg-[#FFF8E7] dark:bg-[#2C1F00] border border-[#F0A500]/20 rounded-[12px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#1D1D1F] dark:text-white">
              {lang === 'th' ? 'ความคืบหน้า' : 'Progress'}
            </span>
            <span className="text-sm font-semibold text-[#F0A500]">
              {doneCount}/7 {lang === 'th' ? 'ขั้นตอน' : 'steps'}
              {saving && <span className="ml-2 text-xs text-[#6E6E73]">⏳</span>}
            </span>
          </div>
          <div className="h-2 bg-[#F5F5F7] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: '#F0A500' }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      <ol className="space-y-2">
        {STEPS.map((step) => {
          const isDone    = completedSteps.includes(step.number);
          const isOpen    = expanded === step.number;
          const name      = lang === 'th' ? step.th   : step.en;
          const desc      = lang === 'th' ? step.desc_th : step.desc_en;
          const isLocked  = !userId;

          return (
            <li key={step.number}>
              <div
                className={`flex items-start gap-3 p-4 rounded-[12px] border transition-all duration-200 ${
                  isDone
                    ? 'border-[#F0A500]/40 bg-[#FFF8E7] dark:bg-[#2C1F00]/50'
                    : isOpen
                    ? 'border-[#E5E5EA] dark:border-[#38383A] bg-[#F5F5F7] dark:bg-[#2C2C2E]'
                    : 'border-[#E5E5EA] dark:border-[#38383A] bg-white dark:bg-[#1C1C1E]'
                }`}
              >
                {/* Step circle / checkbox */}
                <button
                  type="button"
                  onClick={() => !isLocked && toggleStep(step.number)}
                  disabled={isLocked || saving}
                  aria-label={`${isDone ? 'Uncheck' : 'Check'} step ${step.number}`}
                  className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                    isDone
                      ? 'bg-[#F0A500] border-[#F0A500] text-white'
                      : 'bg-white dark:bg-[#1C1C1E] border-[#E5E5EA] dark:border-[#38383A] text-[#6E6E73]'
                  } ${!isLocked ? 'cursor-pointer hover:border-[#F0A500]' : 'cursor-default'}`}
                >
                  {isDone ? '✓' : step.number}
                </button>

                {/* Name + expand */}
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : step.number)}
                    className="w-full text-left"
                  >
                    <span
                      className={`text-sm font-medium ${
                        isDone ? 'line-through text-[#6E6E73] dark:text-[#8E8E93]' : 'text-[#1D1D1F] dark:text-white'
                      }`}
                      style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                    >
                      {name}
                    </span>
                  </button>
                  {isOpen && (
                    <p
                      className="mt-1.5 text-xs text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed"
                      style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                    >
                      {desc}
                    </p>
                  )}
                </div>

                {/* Expand chevron */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : step.number)}
                  className="flex-shrink-0 text-[#ADADB8] hover:text-[#6E6E73] transition-colors"
                  aria-label="Toggle description"
                >
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Login CTA for guests */}
      {!userId && (
        <div className="mt-5 p-4 border border-[#F0A500]/30 rounded-[12px] bg-[#FFF8E7] dark:bg-[#2C1F00]/40 text-center">
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-3">
            {lang === 'th'
              ? 'เข้าสู่ระบบเพื่อบันทึกความคืบหน้าของคุณ'
              : 'Log in to track your progress'}
          </p>
          <Link
            href="/auth"
            className="inline-block text-sm font-semibold text-white bg-[#F0A500] hover:bg-[#D4920A] px-5 py-2 rounded-full transition-colors"
          >
            {lang === 'th' ? 'เข้าสู่ระบบ →' : 'Log in →'}
          </Link>
        </div>
      )}
    </div>
  );
}
