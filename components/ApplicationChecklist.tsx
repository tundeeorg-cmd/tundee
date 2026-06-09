'use client';

/**
 * ApplicationChecklist 7-step scholarship application progress tracker.
 *
 * Key fixes (Jun 2026):
 *  - Removed .select().single() from upsert (caused silent failure when
 *    unique index was missing the real root cause of "does nothing")
 *  - Optimistic UI: state updates instantly, reverts on DB error
 *  - Actual error shown in UI so failures are diagnosable
 *  - No emojis SVG only
 *  - Full Thai/English support via lang prop
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: number;
  th: string;
  en: string;
  desc_th: string;
  desc_en: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    th: 'ยืนยันคุณสมบัติ',
    en: 'Confirm Eligibility',
    desc_th: 'ตรวจสอบว่าคุณตรงตามเกณฑ์ทุกข้อ ได้แก่ เกรดเฉลี่ย รายได้ครัวเรือน สาขาวิชา และจังหวัดที่อยู่',
    desc_en: 'Verify that you meet all requirements: GPA, household income, field of study, and province.',
  },
  {
    id: 2,
    th: 'รวบรวมเอกสาร',
    en: 'Gather Documents',
    desc_th: 'เตรียมเอกสารที่ต้องใช้ทั้งหมด เช่น ใบแสดงผลการเรียน สำเนาบัตรประชาชน หนังสือรับรองรายได้ครัวเรือน และรูปถ่าย',
    desc_en: 'Prepare all required documents: transcripts, national ID copy, income certificate, and photographs.',
  },
  {
    id: 3,
    th: 'เขียนเรียงความแนะนำตัว',
    en: 'Write Personal Statement',
    desc_th: 'เขียนแนะนำตัวเอง เป้าหมายการศึกษา และเหตุผลที่ต้องการทุนนี้ ตรวจทานความถูกต้องและความสมบูรณ์',
    desc_en: 'Write about yourself, your academic goals, and why you are applying. Proofread carefully.',
  },
  {
    id: 4,
    th: 'ขอจดหมายแนะนำ',
    en: 'Request Recommendation Letter',
    desc_th: 'ติดต่อครูหรืออาจารย์ที่ปรึกษาเพื่อขอจดหมายแนะนำ แจ้งกำหนดส่งล่วงหน้าอย่างน้อย 2 สัปดาห์',
    desc_en: 'Contact a teacher or advisor for a recommendation letter. Give at least 2 weeks notice.',
  },
  {
    id: 5,
    th: 'ส่งใบสมัครบนเว็บไซต์',
    en: 'Submit Application Online',
    desc_th: 'กรอกแบบฟอร์มใบสมัครบนเว็บไซต์ทุนให้ครบถ้วน อัปโหลดเอกสารทุกอย่าง แล้วกดส่งใบสมัคร',
    desc_en: 'Complete the application form on the scholarship website, upload all documents, and submit.',
  },
  {
    id: 6,
    th: 'ยืนยันการรับใบสมัคร',
    en: 'Confirm Receipt',
    desc_th: 'ตรวจสอบว่าได้รับอีเมลยืนยันจากผู้ให้ทุน หรือบันทึกหน้าจอการยืนยันการส่งใบสมัครเก็บไว้',
    desc_en: 'Confirm you received a confirmation email or screenshot the submission confirmation page.',
  },
  {
    id: 7,
    th: 'รายงานผลการสมัคร',
    en: 'Report Application Outcome',
    desc_th: 'เมื่อทราบผลการพิจารณา ไม่ว่าจะผ่านหรือไม่ผ่าน กรุณาแจ้งผลเพื่อช่วยปรับปรุงระบบ TunDee',
    desc_en: 'Once you receive a decision, please report the outcome to help improve TunDee.',
  },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  scholarshipId: string;
  applicationUrl: string | null;
  lang: 'th' | 'en';
  // kept for backward compat not used internally
  scholarshipName?: string;
}

// ─── SVG helpers ───────────────────────────────────────────────────────────────

function Checkmark() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2.5 6.5L5 9L10.5 3.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={`flex-shrink-0 text-[#aeaeb2] transition-transform duration-200 ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ApplicationChecklist({
  scholarshipId,
  applicationUrl,
  lang,
}: Props) {
  const supabase = createClient();

  const [user,        setUser]        = useState<{ id: string } | null>(null);
  const [completed,   setCompleted]   = useState<number[]>([]);
  const [dates,       setDates]       = useState<Record<string, string>>({});
  const [expanded,    setExpanded]    = useState<number | null>(null);
  const [savingStep,  setSavingStep]  = useState<number | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [outcome,     setOutcome]     = useState('');
  const [showOutcome, setShowOutcome] = useState(false);
  const [saveError,   setSaveError]   = useState('');

  // ── Load saved progress ───────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!mounted) return;
        if (!u) { setLoading(false); return; }
        setUser(u);

        const { data: app } = await supabase
          .from('applications')
          .select('status, checklist_progress, checklist_dates')
          .eq('user_id', u.id)
          .eq('scholarship_id', scholarshipId)
          .maybeSingle();

        if (!mounted) return;
        if (app) {
          setCompleted((app.checklist_progress as number[] | null) ?? []);
          setDates((app.checklist_dates as Record<string, string> | null) ?? {});
          const st = (app.status as string) ?? '';
          // Only surface terminal outcomes (won/lost/no_reply) as persistent banner
          if (['won', 'lost', 'no_reply'].includes(st)) {
            setOutcome(st);
          }
        }
      } catch {
        // Columns may not exist yet silently degrade
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  // ── Toggle a step ─────────────────────────────────────────────────────────

  const toggleStep = useCallback(async (stepId: number) => {
    if (!user || savingStep !== null) return;
    setSavingStep(stepId);
    setSaveError('');

    const isNowDone   = !completed.includes(stepId);
    const prevCompleted = completed;
    const prevDates     = dates;

    const newCompleted = isNowDone
      ? [...completed, stepId].sort((a, b) => a - b)
      : completed.filter((s) => s !== stepId);

    const newDates = { ...dates };
    if (isNowDone) {
      newDates[String(stepId)] = new Date().toISOString();
    } else {
      delete newDates[String(stepId)];
    }

    // Derive status
    let status = 'viewing';
    if (newCompleted.length >= 1) status = 'started';
    if (newCompleted.length >= 3) status = 'in_progress';
    if (newCompleted.includes(6)) status = 'submitted';

    // Optimistic update UI feels instant
    setCompleted(newCompleted);
    setDates(newDates);

    const { error } = await supabase
      .from('applications')
      .upsert(
        {
          user_id:            user.id,
          scholarship_id:     scholarshipId,
          status,
          checklist_progress: newCompleted,
          checklist_dates:    newDates,
          ...(stepId === 5 && isNowDone ? { clicked_through_at: new Date().toISOString() } : {}),
          ...(stepId === 6 && isNowDone ? { submitted_at:       new Date().toISOString() } : {}),
        },
        { onConflict: 'user_id,scholarship_id' }
        // NOTE: no .select().single() that was the original bug.
        // When the unique index didn't exist, .single() returned an error
        // even on success, so setCompleted was never called.
      );

    if (error) {
      // Revert optimistic update
      setCompleted(prevCompleted);
      setDates(prevDates);
      console.error('[TunDee] Checklist save error:', error.code, error.message);
      setSaveError(`${error.code}: ${error.message}`);
    } else {
      if (stepId === 6 && isNowDone) {
        setShowOutcome(true);
      }
    }

    setSavingStep(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, completed, dates, scholarshipId, savingStep]);

  // ── Format date ───────────────────────────────────────────────────────────

  function formatDate(iso: string): string {
    const d = new Date(iso);
    if (lang === 'th') {
      const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                 'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`;
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const pct              = Math.round((completed.length / 7) * 100);
  const font             = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';
  const canApply         = applicationUrl && applicationUrl !== 'CHECK_WEBSITE';
  const firstStepDate    = Object.keys(dates).sort()[0];
  const showOutcomeForm  =
    user &&
    (showOutcome || (completed.includes(6) && !['won','lost','no_reply'].includes(outcome)));

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1,2,3,4,5,6,7].map((i) => (
          <div key={i} className="h-14 bg-[#F7F9FC] dark:bg-[#232B3E] rounded-xl" />
        ))}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Section heading */}
      <h2
        className="text-lg font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-4"
        style={{ fontFamily: font }}
      >
        {lang === 'th' ? '7 ขั้นตอนการสมัครทุน' : '7-Step Application Guide'}
      </h2>

      {/* Checklist card */}
      <div className="border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl overflow-hidden">

        {/* ── Sticky progress header ─────────────────────────────────────── */}
        <div className="sticky top-[64px] z-10 bg-white dark:bg-[#1D1D1F]
                        border-b border-[#e0e0e0] dark:border-[#3a3a3c] px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
              style={{ fontFamily: font }}
            >
              {lang === 'th' ? 'ขั้นตอนการสมัคร' : 'Application Steps'}
            </span>
            <span className={`text-sm font-bold ${
              completed.length === 7 ? 'text-green-600 dark:text-green-400' : 'text-[#2E6BE6]'
            }`}>
              {completed.length} / 7
            </span>
          </div>

          {/* Thin progress bar */}
          <div className="h-[3px] bg-[#e0e0e0] dark:bg-[#3a3a3c] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${pct}%`,
                backgroundColor: completed.length === 7 ? '#22C55E' : '#2E6BE6',
              }}
            />
          </div>

          {user && firstStepDate && completed.length > 0 && (
            <p className="text-xs text-[#aeaeb2] mt-1.5">
              {lang === 'th'
                ? `เริ่มเมื่อ ${formatDate(dates[firstStepDate])}`
                : `Started ${formatDate(dates[firstStepDate])}`}
            </p>
          )}
        </div>

        {/* ── Save error (only shown when save fails) ─────────────────────── */}
        {saveError && (
          <div className="px-5 py-2 bg-red-50 dark:bg-red-950
                          border-b border-red-200 dark:border-red-800">
            <p className="text-xs font-mono text-red-500 dark:text-red-400">{saveError}</p>
            <p className="text-xs text-red-400 mt-0.5">
              {lang === 'th'
                ? 'กรุณารัน scripts/fix_checklist_columns.sql ใน Supabase SQL Editor'
                : 'Please run scripts/fix_checklist_columns.sql in Supabase SQL Editor'}
            </p>
          </div>
        )}

        {/* ── Steps ──────────────────────────────────────────────────────── */}
        <div className="divide-y divide-[#f0f0f0] dark:divide-[#2c2c2e]">
          {STEPS.map((step) => {
            const done    = completed.includes(step.id);
            const open    = expanded === step.id;
            const saving  = savingStep === step.id;
            const dateStr = dates[String(step.id)];

            return (
              <div
                key={step.id}
                className={`transition-colors ${
                  done
                    ? 'bg-[#FAFFF7] dark:bg-[#0a1a0a]'
                    : 'bg-white dark:bg-[#1D1D1F]'
                }`}
              >
                {/* ── Row header (click to expand/collapse) ── */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-5 py-4 text-left
                             hover:bg-[#F9F9F9] dark:hover:bg-[#242424] transition-colors"
                  onClick={() => setExpanded(open ? null : step.id)}
                >
                  {/* Circle clicking toggles the step directly */}
                  <div
                    role="checkbox"
                    aria-checked={done}
                    aria-label={done
                      ? (lang === 'th' ? `ยกเลิกขั้นที่ ${step.id}` : `Uncheck step ${step.id}`)
                      : (lang === 'th' ? `ทำขั้นที่ ${step.id} เสร็จ` : `Complete step ${step.id}`)}
                    tabIndex={user ? 0 : -1}
                    onClick={(e) => {
                      if (!user) return;
                      e.stopPropagation();
                      void toggleStep(step.id);
                    }}
                    onKeyDown={(e) => {
                      if (!user) return;
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggleStep(step.id);
                      }
                    }}
                    className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                      border-2 transition-all duration-200
                      ${!user
                        ? 'border-[#e0e0e0] dark:border-[#3a3a3c] cursor-default'
                        : done
                          ? 'bg-[#2E6BE6] border-[#2E6BE6] cursor-pointer'
                          : 'border-[#d0d0d0] dark:border-[#4a4a4a] cursor-pointer hover:border-[#2E6BE6]'
                      }`}
                  >
                    {saving ? (
                      <Spinner />
                    ) : done ? (
                      <Checkmark />
                    ) : (
                      <span className="text-[10px] font-bold text-[#aeaeb2]">{step.id}</span>
                    )}
                  </div>

                  {/* Step name + completion date */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium leading-snug ${
                        done
                          ? 'line-through text-[#aeaeb2]'
                          : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {lang === 'th' ? step.th : step.en}
                    </p>
                    {done && dateStr && (
                      <p className="text-xs text-[#aeaeb2] mt-0.5">{formatDate(dateStr)}</p>
                    )}
                  </div>

                  <Chevron open={open} />
                </button>

                {/* ── Expanded content ── */}
                {open && (
                  <div className="px-5 pb-5 pt-0">
                    <div className="ml-10 space-y-4">
                      <p
                        className="text-sm text-[#6e6e73] dark:text-[#8e8e93] leading-relaxed"
                        style={{ fontFamily: font }}
                      >
                        {lang === 'th' ? step.desc_th : step.desc_en}
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Apply link on step 5 */}
                        {step.id === 5 && canApply && (
                          <a
                            href={applicationUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              if (!done) void toggleStep(step.id);
                            }}
                            className="inline-flex items-center gap-1.5 bg-[#2E6BE6] text-white
                                       text-sm font-semibold px-4 py-2 rounded-lg
                                       hover:bg-[#1E57CC] transition-colors"
                          >
                            {lang === 'th' ? 'ไปยังเว็บไซต์ทุน' : 'Go to scholarship website'}
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor"
                                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        )}

                        {/* Mark as done / Undo */}
                        {user && !done && (
                          <button
                            type="button"
                            onClick={() => void toggleStep(step.id)}
                            disabled={saving || savingStep !== null}
                            className="text-sm font-semibold text-[#2E6BE6]
                                       border border-[#2E6BE6] px-4 py-2 rounded-lg
                                       hover:bg-[#EFF4FF] dark:hover:bg-[#2a2000]
                                       transition-colors disabled:opacity-40"
                          >
                            {lang === 'th' ? 'ทำเสร็จแล้ว' : 'Mark as done'}
                          </button>
                        )}
                        {user && done && (
                          <button
                            type="button"
                            onClick={() => void toggleStep(step.id)}
                            disabled={saving || savingStep !== null}
                            className="text-xs text-[#aeaeb2] hover:text-red-400
                                       transition-colors disabled:opacity-40"
                          >
                            {lang === 'th' ? 'ยกเลิกขั้นตอนนี้' : 'Undo this step'}
                          </button>
                        )}

                        {/* Not logged in nudge to sign in */}
                        {!user && (
                          <a
                            href="/auth"
                            className="text-xs text-[#2E6BE6] hover:underline"
                          >
                            {lang === 'th'
                              ? 'เข้าสู่ระบบเพื่อบันทึกความคืบหน้า'
                              : 'Sign in to save your progress'}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Not logged in banner (shown below steps, not inside) ─────────── */}
      {!user && (
        <div className="mt-4 p-4 border border-[#e0e0e0] dark:border-[#3a3a3c]
                        rounded-xl text-center">
          <p
            className="text-sm text-[#6e6e73] dark:text-[#8e8e93] mb-2"
            style={{ fontFamily: font }}
          >
            {lang === 'th'
              ? 'เข้าสู่ระบบเพื่อบันทึกความคืบหน้าการสมัคร'
              : 'Sign in to track your application progress'}
          </p>
          <a
            href="/auth"
            className="inline-block text-sm font-semibold text-white
                       bg-[#2E6BE6] hover:bg-[#1E57CC] px-5 py-2
                       rounded-full transition-colors"
          >
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Sign in'}
          </a>
        </div>
      )}

      {/* ── Outcome selector (shown after step 6 is completed) ─────────── */}
      {showOutcomeForm && (
        <div className="mt-4 p-4 border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl">
          <p
            className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mb-3"
            style={{ fontFamily: font }}
          >
            {lang === 'th'
              ? 'ส่งใบสมัครแล้ว ผลเป็นอย่างไรบ้าง?'
              : 'Application submitted what was the outcome?'}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              {
                val: 'won',
                th:  'ได้รับทุน',
                en:  'I received the scholarship',
                cls: 'border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-950',
              },
              {
                val: 'no_reply',
                th:  'รอผลการพิจารณา',
                en:  'Still waiting for result',
                cls: 'border-orange-400 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950',
              },
              {
                val: 'lost',
                th:  'ไม่ผ่านการคัดเลือก',
                en:  'Not selected',
                cls: 'border-[#d0d0d0] dark:border-[#4a4a4a] text-[#6e6e73] hover:bg-[#F7F9FC] dark:hover:bg-[#2c2c2e]',
              },
            ].map((o) => (
              <button
                key={o.val}
                type="button"
                onClick={async () => {
                  if (!user) return;
                  const { error } = await supabase.from('applications').upsert(
                    {
                      user_id:        user.id,
                      scholarship_id: scholarshipId,
                      status:         o.val,
                      outcome_at:     new Date().toISOString(),
                      outcome_source: 'self_report',
                    },
                    { onConflict: 'user_id,scholarship_id' }
                  );
                  if (!error) {
                    setOutcome(o.val);
                    setShowOutcome(false);
                  }
                }}
                className={`px-4 py-2 border rounded-lg text-sm font-medium
                            transition-colors ${o.cls}`}
                style={{ fontFamily: font }}
              >
                {lang === 'th' ? o.th : o.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Persistent outcome banner ──────────────────────────────────── */}
      {['won', 'lost', 'no_reply'].includes(outcome) && !showOutcomeForm && (
        <div
          className={`mt-4 py-3 px-4 rounded-xl border text-sm font-semibold text-center ${
            outcome === 'won'
              ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400'
              : outcome === 'lost'
                ? 'bg-[#F7F9FC] dark:bg-[#2c2c2e] border-[#e0e0e0] dark:border-[#3a3a3c] text-[#6e6e73]'
                : 'bg-orange-50 dark:bg-orange-950 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400'
          }`}
          style={{ fontFamily: font }}
        >
          {outcome === 'won'      && (lang === 'th' ? 'ได้รับทุนนี้แล้ว'               : 'Scholarship received')}
          {outcome === 'lost'     && (lang === 'th' ? 'ไม่ผ่านการคัดเลือกในรอบนี้'    : 'Not selected this time')}
          {outcome === 'no_reply' && (lang === 'th' ? 'รอผลการพิจารณาอยู่'             : 'Awaiting decision')}
        </div>
      )}
    </div>
  );
}
