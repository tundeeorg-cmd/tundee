'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

// ── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: number;
  th: string;
  en: string;
  desc_th: string;
  desc_en: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    th: 'ยืนยันคุณสมบัติ',
    en: 'Confirm Eligibility',
    desc_th: 'ตรวจสอบว่าคุณตรงตามเกณฑ์ทุกข้อ เกรด รายได้ สาขา และจังหวัด',
    desc_en: 'Check that you meet all requirements: GPA, income, field, and province.',
    icon: '✓',
  },
  {
    id: 2,
    th: 'รวบรวมเอกสาร',
    en: 'Gather Documents',
    desc_th: 'เตรียมเอกสารทุกอย่างที่ต้องใช้ เช่น ใบแสดงผลการเรียน บัตรประชาชน หนังสือรับรองรายได้',
    desc_en: 'Prepare all required documents: transcript, ID card, income certificate, etc.',
    icon: '📄',
  },
  {
    id: 3,
    th: 'เขียนเรียงความแนะนำตัว',
    en: 'Write Personal Statement',
    desc_th: 'เขียนแนะนำตัว เป้าหมาย และเหตุผลที่ต้องการทุนนี้ ตรวจทานความถูกต้อง',
    desc_en: 'Write about yourself, your goals, and why you need this scholarship. Proofread carefully.',
    icon: '✏️',
  },
  {
    id: 4,
    th: 'ขอจดหมายแนะนำ',
    en: 'Get Recommendation Letter',
    desc_th: 'ขอจดหมายแนะนำจากครูหรืออาจารย์ที่ปรึกษา แจ้งเส้นตายล่วงหน้าอย่างน้อย 2 สัปดาห์',
    desc_en: 'Ask a teacher or advisor for a recommendation letter. Give at least 2 weeks notice.',
    icon: '📬',
  },
  {
    id: 5,
    th: 'สมัครบนเว็บไซต์ทุน',
    en: 'Submit Application Online',
    desc_th: 'กรอกใบสมัครบนเว็บไซต์ทุนให้ครบถ้วน อัปโหลดเอกสารทุกอย่าง และส่งใบสมัคร',
    desc_en: 'Fill out the application form on the scholarship website, upload all documents, and submit.',
    icon: '🌐',
  },
  {
    id: 6,
    th: 'ยืนยันการส่งใบสมัคร',
    en: 'Confirm Submission',
    desc_th: 'ตรวจสอบว่าได้รับอีเมลยืนยันการส่งใบสมัคร หรือ screenshot หน้าการยืนยัน',
    desc_en: 'Check that you received a confirmation email or screenshot the confirmation page.',
    icon: '✅',
  },
  {
    id: 7,
    th: 'รายงานผล',
    en: 'Report Outcome',
    desc_th: 'แจ้งผลการสมัครเมื่อทราบ ไม่ว่าจะผ่านหรือไม่ผ่าน เพื่อช่วยพัฒนา TunDee',
    desc_en: 'Report the outcome when you know it, win or lose. Helps TunDee improve.',
    icon: '📊',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string, lang: 'th' | 'en'): string {
  const d = new Date(isoString);
  if (lang === 'th') {
    const thMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function deriveStatus(completed: number[]): string {
  if (completed.length === 0) return 'viewing';
  if (completed.includes(6)) return 'submitted';
  if (completed.length >= 5) return 'in_progress';
  if (completed.length > 0) return 'started';
  return 'viewing';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChecklistProps {
  scholarshipId: string;
  scholarshipName: string;
  applicationUrl: string | null;
  lang: 'th' | 'en';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ApplicationChecklist({
  scholarshipId,
  scholarshipName: _scholarshipName, // reserved for future use (logging/display)
  applicationUrl,
  lang,
}: ChecklistProps) {
  const supabase = createClient();

  const [user, setUser]               = useState<User | null>(null);
  const [applicationId, setAppId]     = useState<string | null>(null);
  const [completed, setCompleted]     = useState<number[]>([]);
  const [dates, setDates]             = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState<number | null>(null);
  const [expanded, setExpanded]       = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);
  const [outcome, setOutcome]         = useState<string>('');
  const [showOutcome, setShowOutcome] = useState(false);
  const expandRefs = useRef<Record<number, boolean>>({});

  // ── Load progress on mount ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!mounted) return;
        if (!u) { setLoading(false); return; }
        setUser(u);

        const { data: app, error } = await supabase
          .from('applications')
          .select('id, status, checklist_progress, checklist_dates')
          .eq('user_id', u.id)
          .eq('scholarship_id', scholarshipId)
          .maybeSingle();

        if (!mounted) return;

        if (!error && app) {
          setAppId(app.id as string);
          setCompleted((app.checklist_progress as number[] | null) ?? []);
          setDates((app.checklist_dates as Record<string, string> | null) ?? {});
          const st = app.status as string ?? '';
          if (!['viewing','started','in_progress','submitted'].includes(st)) {
            setOutcome(st);
          }
        }
      } catch {
        /* silently ignore — checklist_dates column may not exist yet */
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  // ── Toggle a step ─────────────────────────────────────────────────────────
  async function toggleStep(stepId: number) {
    if (!user) return;
    setSaving(stepId);

    const isNowDone = !completed.includes(stepId);
    const newCompleted = isNowDone
      ? [...completed, stepId].sort((a, b) => a - b)
      : completed.filter((s) => s !== stepId);

    const newDates = { ...dates };
    if (isNowDone) {
      newDates[stepId.toString()] = new Date().toISOString();
    } else {
      delete newDates[stepId.toString()];
    }

    const status = deriveStatus(newCompleted);

    const extraFields: Record<string, string> = {};
    if (stepId === 5 && isNowDone) extraFields.clicked_through_at = new Date().toISOString();
    if (stepId === 6 && isNowDone) extraFields.submitted_at = new Date().toISOString();

    try {
      const { data: upserted, error } = await supabase
        .from('applications')
        .upsert(
          {
            user_id: user.id,
            scholarship_id: scholarshipId,
            status,
            checklist_progress: newCompleted,
            checklist_dates: newDates,
            ...extraFields,
          },
          { onConflict: 'user_id,scholarship_id' }
        )
        .select('id')
        .single();

      if (!error) {
        setCompleted(newCompleted);
        setDates(newDates);
        if (upserted && !applicationId) {
          setAppId((upserted as { id: string }).id);
        }
        if (stepId === 6 && isNowDone) {
          setShowOutcome(true);
        }
      } else {
        console.error('[TunDee] Checklist save error:', error.message);
      }
    } catch (err) {
      console.error('[TunDee] Checklist unexpected error:', err);
    } finally {
      setSaving(null);
    }
  }

  // ── Update outcome ────────────────────────────────────────────────────────
  async function updateOutcome(newOutcome: string) {
    if (!user) return;
    try {
      await supabase
        .from('applications')
        .upsert(
          {
            user_id: user.id,
            scholarship_id: scholarshipId,
            status: newOutcome,
            outcome_at: new Date().toISOString(),
            outcome_source: 'self_report',
          },
          { onConflict: 'user_id,scholarship_id' }
        );
      setOutcome(newOutcome);
    } catch (err) {
      console.error('[TunDee] Outcome update error:', err);
    } finally {
      setShowOutcome(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const completedCount = completed.length;
  const progress = (completedCount / 7) * 100;
  const allDone = completedCount === 7;
  const canApply = applicationUrl && applicationUrl !== 'CHECK_WEBSITE';

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-14 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Section title */}
      <h2
        className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-1"
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
      >
        {lang === 'th' ? '7 ขั้นตอนการสมัครทุน' : '7-Step Application Guide'}
      </h2>
      <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-5">
        {lang === 'th'
          ? 'ทำตามขั้นตอนเพื่อให้การสมัครสำเร็จ'
          : 'Follow these steps to maximise your chances of success'}
      </p>

      {/* Progress bar */}
      {user && (
        <div className="mb-5 bg-[#FFF8E7] dark:bg-[#2C1F00] border border-[#F0A500]/20 rounded-[12px] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
              {lang === 'th' ? 'ความคืบหน้า' : 'Progress'}
            </span>
            <span className={`text-sm font-bold ${allDone ? 'text-green-600 dark:text-green-400' : 'text-[#F0A500]'}`}>
              {completedCount}/7 {lang === 'th' ? 'ขั้นตอน' : 'steps'}
            </span>
          </div>
          <div className="h-2 bg-[#F5F5F7] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: allDone ? '#22C55E' : '#F0A500',
              }}
            />
          </div>
          {allDone && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-semibold">
              🎉 {lang === 'th' ? 'ครบทุกขั้นตอนแล้ว!' : 'All steps complete!'}
            </p>
          )}
        </div>
      )}

      {/* Steps */}
      <ol className="space-y-2">
        {STEPS.map((step) => {
          const isDone     = completed.includes(step.id);
          const isOpen     = expanded === step.id;
          const isSaving   = saving === step.id;
          const dateStr    = dates[step.id.toString()];
          const isLocked   = !user;

          return (
            <li key={step.id}>
              <div
                className={`rounded-[12px] border transition-all duration-200 ${
                  isDone
                    ? 'border-[#F0A500]/40 bg-[#FFF8E7] dark:bg-[#2C1F00]/50'
                    : isOpen
                    ? 'border-[#E5E5EA] dark:border-[#38383A] bg-[#F9F9F9] dark:bg-[#2C2C2E]'
                    : 'border-[#E5E5EA] dark:border-[#38383A] bg-white dark:bg-[#1C1C1E]'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start gap-3 p-4">
                  {/* Checkbox circle */}
                  <button
                    type="button"
                    onClick={() => !isLocked && toggleStep(step.id)}
                    disabled={isLocked || saving !== null}
                    aria-label={isDone ? `Uncheck step ${step.id}` : `Check step ${step.id}`}
                    className={`mt-0.5 w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                      transition-all duration-200
                      ${isLocked
                        ? 'border-[#E5E5EA] dark:border-[#38383A] cursor-default'
                        : isDone
                        ? 'bg-[#F0A500] border-[#F0A500] text-white cursor-pointer'
                        : 'bg-white dark:bg-[#1C1C1E] border-[#E5E5EA] dark:border-[#38383A] text-[#6E6E73] cursor-pointer hover:border-[#F0A500]'
                      }`}
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : isDone ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="text-[11px] font-bold text-[#ADADB8]">{step.id}</span>
                    )}
                  </button>

                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs font-semibold ${isDone ? 'text-[#F0A500]' : 'text-[#ADADB8]'}`}>
                        {lang === 'th' ? `ขั้นที่ ${step.id}` : `Step ${step.id}`}
                      </span>
                      {isDone && dateStr && (
                        <span className="text-xs text-[#ADADB8]">· {formatDate(dateStr, lang)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        expandRefs.current[step.id] = !isOpen;
                        setExpanded(isOpen ? null : step.id);
                      }}
                      className="w-full text-left mt-0.5"
                    >
                      <span
                        className={`text-sm font-medium ${
                          isDone
                            ? 'line-through text-[#6E6E73] dark:text-[#8E8E93]'
                            : 'text-[#1D1D1F] dark:text-white'
                        }`}
                        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                      >
                        {lang === 'th' ? step.th : step.en}
                      </span>
                    </button>
                  </div>

                  {/* Expand chevron */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : step.id)}
                    aria-label="Toggle details"
                    className="flex-shrink-0 p-0.5 mt-1 text-[#ADADB8] hover:text-[#6E6E73] dark:hover:text-[#8E8E93] transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded body */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="pl-10 space-y-3">
                      <p
                        className="text-sm text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed"
                        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                      >
                        {lang === 'th' ? step.desc_th : step.desc_en}
                      </p>

                      {/* Step 5: direct apply link */}
                      {step.id === 5 && canApply && (
                        <a
                          href={applicationUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => { if (!completed.includes(5)) void toggleStep(5); }}
                          className="inline-flex items-center gap-2 bg-[#F0A500] hover:bg-[#D4920A] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          {lang === 'th' ? 'ไปสมัครที่เว็บไซต์ทุน →' : 'Apply on official website →'}
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7h8M7 3l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      )}

                      {/* Mark as done / Undo */}
                      {user && !isDone && (
                        <button
                          type="button"
                          onClick={() => void toggleStep(step.id)}
                          disabled={saving !== null}
                          className="text-sm text-[#F0A500] font-semibold hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 7l4 4 6-6" stroke="#F0A500" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {lang === 'th' ? 'ทำขั้นตอนนี้เสร็จแล้ว' : 'Mark as done'}
                        </button>
                      )}
                      {user && isDone && (
                        <button
                          type="button"
                          onClick={() => void toggleStep(step.id)}
                          disabled={saving !== null}
                          className="text-xs text-[#ADADB8] hover:text-red-400 hover:underline transition-colors"
                        >
                          {lang === 'th' ? 'ยกเลิกขั้นตอนนี้' : 'Undo this step'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Not logged in banner */}
      {!user && (
        <div className="mt-5 p-4 border border-[#F0A500]/30 rounded-[12px] bg-[#FFF8E7] dark:bg-[#2C1F00]/40 text-center">
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-3">
            {lang === 'th'
              ? 'เข้าสู่ระบบเพื่อบันทึกความคืบหน้าของคุณ'
              : 'Sign in to save your progress'}
          </p>
          <Link
            href="/auth"
            className="inline-block text-sm font-semibold text-white bg-[#F0A500] hover:bg-[#D4920A] px-5 py-2 rounded-full transition-colors"
          >
            {lang === 'th' ? 'เข้าสู่ระบบ →' : 'Sign in →'}
          </Link>
        </div>
      )}

      {/* Outcome selector (shown after step 6 is checked) */}
      {showOutcome && (
        <div className="mt-5 p-4 bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#38383A] rounded-[12px]">
          <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-3">
            🎉 {lang === 'th' ? 'ส่งใบสมัครแล้ว! ผลเป็นยังไงบ้าง?' : 'Application submitted! What was the outcome?'}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { val: 'won',      th: '🏆 ได้รับทุน',          en: '🏆 I won!',          cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700' },
              { val: 'no_reply', th: '⏳ รอผล',               en: '⏳ Still waiting',    cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700' },
              { val: 'lost',     th: '✗ ไม่ผ่านการคัดเลือก', en: '✗ Not selected',     cls: 'bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-[#8E8E93] border-[#E5E5EA] dark:border-[#38383A]' },
            ].map((o) => (
              <button
                key={o.val}
                type="button"
                onClick={() => void updateOutcome(o.val)}
                className={`px-3 py-2 rounded-[10px] border text-sm font-semibold transition-colors hover:opacity-80 ${o.cls}`}
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {lang === 'th' ? o.th : o.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Outcome banner (persistent) */}
      {outcome &&
       !['', 'viewing', 'started', 'in_progress', 'submitted'].includes(outcome) &&
       !showOutcome && (
        <div
          className={`mt-5 p-3 rounded-[12px] border text-sm font-semibold text-center ${
            outcome === 'won'
              ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
              : outcome === 'lost'
              ? 'bg-[#F5F5F7] dark:bg-[#2C2C2E] border-[#E5E5EA] dark:border-[#38383A] text-[#6E6E73] dark:text-[#8E8E93]'
              : 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-400'
          }`}
        >
          {outcome === 'won'      && (lang === 'th' ? '🏆 ได้รับทุนนี้แล้ว' : '🏆 You won this scholarship!')}
          {outcome === 'lost'     && (lang === 'th' ? '✗ ไม่ผ่านการคัดเลือก' : '✗ Not selected this time')}
          {outcome === 'no_reply' && (lang === 'th' ? '⏳ รอผลอยู่' : '⏳ Waiting for result')}
        </div>
      )}
    </div>
  );
}
