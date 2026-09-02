'use client';

/**
 * /profile/setup Duolingo-style 9-step onboarding wizard.
 * Redirected here from /auth/callback when profile is incomplete.
 *
 * NOTHING HERE IS HELD TO THE END.
 * Every step is written as the student advances — to localStorage immediately
 * and to /api/profile/setup as a partial upsert — because until 31 Aug 2026 all
 * nine steps lived in React state until a single write at 100%, and when that
 * write was refused by profiles_grade_level_check the student lost about eight
 * minutes of answers and was shown raw Postgres in English on a Thai page.
 * A failure at step 9 must now cost the student step 9 and nothing else.
 *
 * Steps:
 *   0  Consent (PDPA)
 *   1  Name
 *   2  Prior scholarship knowledge (research)
 *   3  Grade level
 *   4  GPA
 *   5  Province
 *   6  Income & welfare card
 *   7  Fields of interest
 *   8  Recruitment source (research) + save
 *
 * Preview prefill: visitors who matched on /start arrive with a tundee_preview
 * cookie holding the level/province/income they already chose, plus GPA if they
 * gave one. Those steps are then answered and skipped, so nobody is asked the
 * same question twice.
 * Consent (step 0) is never skipped — PDPA requires it explicitly.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';
import { logEvent } from '@/lib/research/events';
import { readAdParams } from '@/lib/adTracking';
import { PREVIEW_COOKIE, decodePreviewInput } from '@/lib/preview/types';
import { CONSENT_VERSION } from '@/lib/consent';
import { GRADE_LEVELS, canonicalizeGradeLevel } from '@/lib/profile/gradeLevels';
import {
  validateField,
  validateSetupAnswers,
  hasErrors,
  type SetupAnswers,
  type SetupErrorCode,
  type SetupField,
} from '@/lib/profile/setupAnswers';
import {
  saveDraft, loadDraft, clearDraft, resumeStep, answersFromProfile,
} from '@/lib/profile/setupDraft';
import {
  fieldMessage, saveMessage, RETRY_LABEL, FIELD_STEP, type SaveErrorCode,
} from '@/lib/profile/setupMessages';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 9;

/**
 * The five grade options come from lib/profile/gradeLevels.ts and are NOT
 * declared here. They were, once — and the database CHECK constraint was written
 * against a different list, so three of the five could never be saved. The
 * database's domain is now generated from that same module.
 */
const GRADE_OPTIONS = GRADE_LEVELS;

const INCOME_OPTIONS = [
  { value: 1, th: 'ต่ำกว่า 5,000 บาท/เดือน',   en: 'Under ฿5,000/month' },
  { value: 2, th: '5,000 – 10,000 บาท/เดือน',  en: '฿5,000 – ฿10,000/month' },
  { value: 3, th: '10,000 – 15,000 บาท/เดือน', en: '฿10,000 – ฿15,000/month' },
  { value: 4, th: '15,000 – 20,000 บาท/เดือน', en: '฿15,000 – ฿20,000/month' },
  { value: 5, th: '20,000 – 30,000 บาท/เดือน', en: '฿20,000 – ฿30,000/month' },
  { value: 6, th: '30,000 – 50,000 บาท/เดือน', en: '฿30,000 – ฿50,000/month' },
  { value: 7, th: 'มากกว่า 50,000 บาท/เดือน',  en: 'Over ฿50,000/month' },
];

// Prior knowledge: display label → stored numeric value
const PRIOR_KNOWLEDGE_OPTIONS = [
  { label: '0',    th: 'ไม่รู้เลย',       en: 'None',       value: 0  },
  { label: '1–3',  th: 'รู้บ้าง 1–3 ทุน', en: '1–3 known',  value: 2  },
  { label: '4–10', th: 'รู้ 4–10 ทุน',    en: '4–10 known', value: 6  },
  { label: '10+',  th: 'รู้มากกว่า 10',   en: '10+ known',  value: 15 },
];

const RECRUITMENT_SOURCE_OPTIONS = [
  { value: 'school_teacher', th: 'ครู/อาจารย์แนะนำ',   en: 'Teacher / advisor' },
  { value: 'friend_referral', th: 'เพื่อนบอกต่อ',      en: 'Friend referral' },
  { value: 'google_search',  th: 'ค้นหาจาก Google',    en: 'Google search' },
  { value: 'social_media',   th: 'โซเชียลมีเดีย',       en: 'Social media' },
];

/**
 * Steps 3–6 (grade level, GPA, province, income) are exactly what the /start
 * preview now collects, so when it prefilled them the wizard jumps step 2 → 7.
 *
 * Income moved into the preview alongside level and province because those
 * three are the study's stratification variables (PREREG §5.1–5.3) — asking
 * them before signup serves both the funnel and the research design.
 */
const PREFILLED_STEPS = { before: 2, after: 7 } as const;

/** Reads a non-httpOnly cookie in the browser. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

/**
 * Drops keys that carry no answer, so a stored row can be layered over a draft
 * without its blanks erasing the draft's values.
 */
function stripEmpty<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;
}

// Signup cohort derivation moved to lib/profile/setupAnswers.ts, so the API
// route derives the same wave the client would have.

// ─── Sub-components (defined OUTSIDE page to prevent remount on re-render) ────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-[#aeaeb2] mb-2">
        <span>{step + 1} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#E5E5EA] dark:bg-[#3a3a3c] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#2E6BE6] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** One short sentence, at the field, in the student's language. */
function FieldError({ code, lang }: { code: SetupErrorCode | null; lang: string }) {
  if (!code) return null;
  return (
    <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400 text-center">
      {fieldMessage(code, lang)}
    </p>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />;
}

interface WizardContainerProps {
  children: React.ReactNode;
  step: number;
  total: number;
  lang: string;
  /**
   * A code, never a message. The raw Postgres error is logged server-side by
   * /api/profile/setup and never crosses the wire; this component cannot render
   * it even by accident, because it is never given it.
   */
  error?: SaveErrorCode | null;
  onRetry?: () => void;
  retrying?: boolean;
  onBack?: () => void;
}
function WizardContainer({
  children, step, total, lang, error, onRetry, retrying, onBack,
}: WizardContainerProps) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back + progress */}
        <div className="mb-6">
          {step > 0 && onBack && (
            <button
              onClick={onBack}
              className="text-sm text-[#6e6e73] dark:text-[#8e8e93] hover:text-[#1D1D1F] dark:hover:text-white mb-4 flex items-center gap-1 transition-colors"
            >
              ← {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
            </button>
          )}
          <ProgressBar step={step} total={total} />
        </div>

        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">
          <div className="h-1 bg-[#2E6BE6]" />
          <div className="px-7 py-8">
            {error && (
              <div
                role="alert"
                className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl"
              >
                <p className="text-sm text-red-600 dark:text-red-400">
                  {saveMessage(error, lang)}
                </p>
                {onRetry && (error === 'save_failed' || error === 'network') && (
                  <button
                    onClick={onRetry}
                    disabled={retrying}
                    className="mt-3 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                  >
                    {retrying
                      ? (lang === 'th' ? 'กำลังลองใหม่…' : 'Retrying…')
                      : RETRY_LABEL[lang === 'th' ? 'th' : 'en']}
                  </button>
                )}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const { lang } = useLang();
  const router   = useRouter();
  const supabase = createClient();

  const [step,          setStep]          = useState(0);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [saving,        setSaving]        = useState(false);
  /** Save-level failure, as a code. Never a database message — see WizardContainer. */
  const [error,         setError]         = useState<SaveErrorCode | null>(null);
  /** Field-level rejection, shown at the answer rather than eight minutes later. */
  const [fieldError,    setFieldError]    = useState<SetupErrorCode | null>(null);
  const [provinceQuery, setProvinceQuery] = useState('');

  // Form values
  const [displayName,       setDisplayName]       = useState('');
  const [gradeLevel,        setGradeLevel]        = useState('');
  const [gpa,               setGpa]               = useState('');
  const [province,          setProvince]          = useState('');
  const [incomeBracket,     setIncomeBracket]     = useState(4);
  const [welfareCard,       setWelfareCard]       = useState(false);
  const [selectedFields,    setSelectedFields]    = useState<string[]>([]);
  // Research fields
  const [priorKnowledge,    setPriorKnowledge]    = useState<number | null>(null);
  const [recruitmentSource, setRecruitmentSource] = useState('');
  // Consent (PDPA)
  const [consentTerms,           setConsentTerms]           = useState(false);
  const [researchOptIn,          setResearchOptIn]          = useState(false);
  const [guardianAcknowledged,   setGuardianAcknowledged]   = useState(false);
  // Channel attribution — read from localStorage (set by /students?src=)
  const [acquisitionSource,      setAcquisitionSource]      = useState('direct');
  // /start preview prefill
  const [prefilled,              setPrefilled]              = useState(false);
  const [destination,            setDestination]            = useState('/scholarships');

  /** Everything the student has answered, in the shape the validator expects. */
  const answers: Partial<SetupAnswers> = {
    displayName, gradeLevel, gpa, province,
    incomeBracket, welfareCard,
    fields: selectedFields,
    priorKnowledge, heardAboutUs: recruitmentSource,
    consentTerms, researchOptIn, guardianAcknowledged,
    acquisitionSource,
  };

  /**
   * Persist what has been answered so far, immediately and then durably.
   *
   * localStorage first and synchronously, so the answers survive even a request
   * that never leaves the device. The partial upsert follows; it is deliberately
   * not awaited and its failure is deliberately not shown — a student walking
   * through step 5 must not be interrupted by a background write, and the draft
   * plus the final save both still cover them. It IS logged, because a partial
   * save failing is how we would learn about the next constraint mismatch before
   * a student does.
   */
  function persistStep(currentStep: number, snapshot: Partial<SetupAnswers> = answers) {
    saveDraft(currentStep, snapshot);
    void fetch('/api/profile/setup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ partial: true, answers: snapshot }),
    })
      .then((res) => {
        if (!res.ok) console.error('[TunDee Setup] partial save rejected:', res.status, 'at step', currentStep);
      })
      .catch((err) => console.error('[TunDee Setup] partial save failed:', err));
  }

  // Read acquisition source set by /students?src= landing page
  useEffect(() => {
    try {
      const src = localStorage.getItem('tundee_src');
      if (src) setAcquisitionSource(src);
    } catch { /* localStorage unavailable */ }
  }, []);

  // Replay the answers given on /start, if any, and remember where to land.
  // Reading location/cookies directly rather than useSearchParams keeps this
  // page out of the Suspense requirement that hook imposes.
  useEffect(() => {
    const preview = decodePreviewInput(readCookie(PREVIEW_COOKIE));
    if (preview) {
      setGradeLevel(preview.level);
      setProvince(preview.province);
      // Income is now asked on /start too, so it must replay here — otherwise
      // the visitor answers the same question twice and we look like we
      // weren't listening.
      setIncomeBracket(preview.income);
      // GPA is optional on /start; only prefill when they actually gave one.
      if (preview.gpa !== null) setGpa(String(preview.gpa));
      setPrefilled(true);
    }

    try {
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) setDestination(next);
    } catch { /* malformed query string — keep the default */ }
  }, []);

  /**
   * Auth guard, and resume.
   *
   * A student who reached step 7 and lost the save used to come back to step 1
   * and retype everything. Both halves of that are fixed here: the stored
   * profile row is read back and replayed into the form, and the wizard opens on
   * the first question they have not answered.
   *
   * The database row wins over the local draft where they disagree — it is the
   * thing that will actually be there on another device — but a draft answer for
   * a question the row has no value for is still restored, which is what covers
   * the answers given while a partial save was failing.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/auth');
        return;
      }
      if (cancelled) return;

      const user = data.session.user;
      const metadataName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'display_name, grade_level, gpa, province, income_bracket, welfare_card, ' +
          'fields_of_interest, prior_scholarship_knowledge, heard_about_us, ' +
          'consent_version, research_opt_in, guardian_acknowledged',
        )
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const draft = loadDraft();
      const stored = answersFromProfile(profile as Record<string, unknown> | null);
      // Draft underneath, stored row on top: the row is authoritative, the draft
      // fills the gaps it does not cover.
      const merged: Partial<SetupAnswers> = { ...(draft?.answers ?? {}), ...stripEmpty(stored) };

      if (merged.displayName || metadataName) setDisplayName(merged.displayName || metadataName);
      // A grade stored under the retired vocabulary is upgraded, not dropped.
      const grade = canonicalizeGradeLevel(merged.gradeLevel);
      if (grade) setGradeLevel(grade);
      if (merged.gpa) setGpa(merged.gpa);
      if (merged.province) setProvince(merged.province);
      if (typeof merged.incomeBracket === 'number') setIncomeBracket(merged.incomeBracket);
      if (typeof merged.welfareCard === 'boolean') setWelfareCard(merged.welfareCard);
      if (merged.fields?.length) setSelectedFields(merged.fields);
      if (typeof merged.priorKnowledge === 'number') setPriorKnowledge(merged.priorKnowledge);
      if (merged.heardAboutUs) setRecruitmentSource(merged.heardAboutUs);
      if (merged.consentTerms) setConsentTerms(true);
      if (typeof merged.researchOptIn === 'boolean') setResearchOptIn(merged.researchOptIn);
      if (typeof merged.guardianAcknowledged === 'boolean') setGuardianAcknowledged(merged.guardianAcknowledged);

      // Where to open. The stored row decides, so the resume point is the same on
      // any device; a draft further along only moves them forward, never back.
      const fromProfile = resumeStep(profile as Record<string, unknown> | null);
      setStep(Math.max(fromProfile, draft?.step ?? 0));

      setAuthLoading(false);
    })().catch((err) => {
      // A failed read must not strand anyone on a spinner — start at the top.
      console.error('[TunDee Setup] resume failed:', err);
      if (!cancelled) setAuthLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleField(value: string) {
    setSelectedFields((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]
    );
  }

  /** Which answer each step owns, so leaving a step validates the right one. */
  const STEP_FIELD: Partial<Record<number, SetupField>> = {
    0: 'consentTerms',
    2: 'priorKnowledge',
    3: 'gradeLevel',
    4: 'gpa',
    5: 'province',
    6: 'incomeBracket',
    8: 'heardAboutUs',
  };

  function nextStep() {
    setError(null);

    // Validate against the same module the API and the database agree on, so a
    // value that cannot be stored is refused here — at the field, on the step
    // that owns it — rather than at 100% eight minutes later.
    const field = STEP_FIELD[step];
    if (field) {
      const code = validateField(field, (answers as Record<string, unknown>)[field]);
      if (code) { setFieldError(code); return; }
    }
    setFieldError(null);

    // Everything answered so far is now durable. Do this before moving, so the
    // step the student is leaving is saved even if the next one crashes.
    persistStep(step);

    // Already answered on /start → jump over grade/GPA/province
    if (prefilled && step === PREFILLED_STEPS.before) {
      setStep(PREFILLED_STEPS.after);
      return;
    }
    setStep((s) => s + 1);
  }

  function prevStep() {
    setError(null);
    setFieldError(null);
    if (prefilled && step === PREFILLED_STEPS.after) {
      setStep(PREFILLED_STEPS.before);
      return;
    }
    setStep((s) => s - 1);
  }

  /**
   * Choose a grade level. Rejected here if it is not one the database accepts —
   * which is the whole point of this change, and is why the option list and the
   * constraint are now generated from one module.
   */
  function chooseGradeLevel(value: string) {
    const code = validateField('gradeLevel', value);
    if (code) { setFieldError(code); return; }
    setFieldError(null);
    setGradeLevel(value);
    persistStep(3, { ...answers, gradeLevel: value });
    setStep(4);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      /*
       * There is deliberately no supabase.auth.getUser() here.
       *
       * There was, and it sat between the tap and the only network call that
       * matters. getUser() is a request to Supabase with no timeout, so in the
       * Facebook webview — where nearly all our traffic is — a stalled
       * connection left the button spinning forever and /api/profile/setup was
       * never reached. Nothing appeared in the Vercel log because nothing was
       * ever sent to Vercel, which is exactly how this became invisible.
       *
       * It also bought nothing. The route re-checks the session server-side and
       * answers 401, which the handler below already handles by showing the
       * 'unauthorized' message. Asking twice only added a way to fail.
       */

      // Client-side first, so a rejection costs no round trip and lands the
      // student on the step that owns the answer rather than on a wall of red.
      const errors = validateSetupAnswers(answers);
      if (hasErrors(errors)) {
        const [field, code] = Object.entries(errors)[0] as [SetupField, SetupErrorCode];
        setFieldError(code);
        setError('validation');
        setStep(FIELD_STEP[field]);
        setSaving(false);
        return;
      }

      // The write happens server-side. The browser gets a code back and never a
      // Postgres message — the real error is logged in the route with the user
      // id, the step and the payload.
      let res: Response;
      try {
        res = await fetch('/api/profile/setup', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ partial: false, answers }),
        });
      } catch (err) {
        console.error('[TunDee Setup] save request failed:', err);
        setError('network');
        setSaving(false);
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          setError('unauthorized');
          setSaving(false);
          return;
        }
        if (res.status === 422) {
          // The server disagreed with the client's validation. Put the student
          // on the offending step instead of failing at 100%.
          const body = await res.json().catch(() => ({}));
          const entries = Object.entries(body?.fields ?? {}) as Array<[SetupField, SetupErrorCode]>;
          if (entries.length > 0) {
            setFieldError(entries[0][1]);
            setStep(FIELD_STEP[entries[0][0]]);
          }
          setError('validation');
          setSaving(false);
          return;
        }
        // Anything else: the answers are already saved step by step, so the
        // honest message is "try again", with a button that does exactly that.
        setError('save_failed');
        setSaving(false);
        return;
      }

      // ── Randomize into a ranking arm (PREREG §4) ──────────────────────────
      // Awaited, unlike the baseline snapshot below: the arm decides which
      // ranking the user is about to see, so it must be settled before the
      // redirect. Server-side because RANDOMIZATION_SALT must never reach the
      // browser. Idempotent — safe if this runs twice.
      //
      // utm_campaign is sent raw and validated server-side against the closed
      // set in §5.4; it is never trusted as a free-text value.
      try {
        const armRes = await fetch('/api/experiment/assign', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ utm_campaign: readAdParams().utm_campaign ?? null }),
        });
        if (!armRes.ok) {
          // Non-fatal for the student: they get the product either way. It is a
          // research defect, so it is logged loudly rather than swallowed.
          console.error('[TunDee Setup] arm assignment failed:', armRes.status);
        }
      } catch (err) {
        console.error('[TunDee Setup] arm assignment request failed:', err);
      }

      // ── Record the research consent decision where the gate reads it ──────
      // The checkbox above wrote only profiles.research_opt_in. Every research
      // export and isResearchConsented() gate on student_profile.consent_research
      // instead, so a student who ticked the box was still excluded from the
      // dataset. This propagates the decision — including an explicit FALSE,
      // which is a recorded decision and not an absence of one (PREREG §12.4).
      try {
        const consentRes = await fetch('/api/profile/student', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consent_research: researchOptIn,
            guardian_consent: guardianAcknowledged,
            consent_method:   'signup_inline',
          }),
        });
        if (!consentRes.ok) {
          console.error('[TunDee Setup] research consent not recorded:', consentRes.status);
        }
      } catch (err) {
        console.error('[TunDee Setup] research consent request failed:', err);
      }

      // ── Write immutable baseline snapshot (fire-and-forget, non-blocking) ──
      // ON CONFLICT DO NOTHING on the server — safe to call every time.
      void fetch('/api/profile/baseline', { method: 'POST' }).catch(() => {
        console.warn('[TunDee Setup] baseline snapshot failed — non-fatal');
      });

      // The profile is written; the local draft has nothing left to protect.
      clearDraft();

      // Clear acquisition source from localStorage after it's been saved to profile
      try { localStorage.removeItem('tundee_src'); } catch { /* ignore */ }

      // The preview answers are now persisted on the profile — drop the cookie
      // so a later visit doesn't replay stale inputs.
      clearCookie(PREVIEW_COOKIE);

      // Fire profile_completed event — feeds research funnel (signup → profile → match)
      // acquisition_source in metadata lets us measure completion rate by channel
      void logEvent({
        eventType: 'profile_completed',
        metadata:  { acquisition_source: acquisitionSource },
      });

      // No CompleteRegistration here. The account was created at the auth
      // callback and reported there, for every branch — including this one. The
      // wizard is onboarding, not registration, and firing again would
      // double-count the visitors who do reach the end of it. profile_completed
      // above is the event that means "finished the wizard".

      // Back to wherever the funnel started — for /start traffic that's their
      // own matched results, not a generic list.
      router.replace(destination);
    } catch (e) {
      console.error('[TunDee Setup] exception:', e);
      setError('save_failed');
      setSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2E6BE6]/30 border-t-[#2E6BE6] rounded-full animate-spin" />
      </div>
    );
  }

  const filteredProvinces = PROVINCES_TH.filter((p) =>
    p.toLowerCase().includes(provinceQuery.toLowerCase())
  );

  const fontTh = 'Sarabun, sans-serif';
  const fontEn = 'Inter, system-ui, sans-serif';
  const font   = lang === 'th' ? fontTh : fontEn;

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 0 Consent (PDPA)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 0) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ก่อนเริ่มต้น' : 'Before we begin'}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'กรุณาอ่านและยืนยันการยินยอมด้านล่าง'
              : 'Please read and confirm the items below'}
          </p>
        </div>

        {/* Required consent */}
        <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] cursor-pointer mb-3 hover:border-[#2E6BE6]/50 transition-colors">
          <input
            type="checkbox"
            checked={consentTerms}
            onChange={(e) => setConsentTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#d1d1d6] accent-[#2E6BE6] flex-shrink-0"
          />
          <span className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] leading-relaxed" style={{ fontFamily: font }}>
            {lang === 'th' ? (
              <>ฉันยอมรับ <a href="/terms" target="_blank" className="text-[#2E6BE6] underline">ข้อกำหนดการใช้งาน</a> และ <a href="/privacy" target="_blank" className="text-[#2E6BE6] underline">นโยบายความเป็นส่วนตัว</a> และยินยอมให้ทุนดีเก็บข้อมูลโปรไฟล์เพื่อจับคู่ทุนการศึกษา <span className="text-red-500">*</span></>
            ) : (
              <>I accept the <a href="/terms" target="_blank" className="text-[#2E6BE6] underline">Terms of Use</a> and <a href="/privacy" target="_blank" className="text-[#2E6BE6] underline">Privacy Policy</a>, and consent to TunDee storing my profile to match scholarships. <span className="text-red-500">*</span></>
            )}
          </span>
        </label>

        {/* Optional research opt-in */}
        <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] cursor-pointer mb-3 hover:border-[#2E6BE6]/50 transition-colors">
          <input
            type="checkbox"
            checked={researchOptIn}
            onChange={(e) => setResearchOptIn(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#d1d1d6] accent-[#2E6BE6] flex-shrink-0"
          />
          <span className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] leading-relaxed" style={{ fontFamily: font }}>
            {/* PREREG §12.4 copy: plain Thai at secondary-school reading level,
                because participants include minors. States plainly that
                declining costs nothing. */}
            {lang === 'th' ? (
              <>
                <span className="font-semibold">ช่วยงานวิจัยเรื่องความเป็นธรรมทางการศึกษา</span>
                <br />
                เราเก็บข้อมูลการใช้งานแบบไม่ระบุตัวตน เพื่อศึกษาว่านักเรียนต่างจังหวัดเข้าถึงทุนได้ยากกว่าจริงหรือไม่ ข้อมูลของคุณจะไม่ถูกเปิดเผยเป็นรายบุคคล
                <br />
                <span className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">ไม่ยินยอมก็ใช้งานได้ทุกฟีเจอร์ตามปกติ</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Help with research on educational fairness</span>
                <br />
                We collect anonymized usage data to study whether students outside Bangkok have less access to scholarships. Your individual data is never published.
                <br />
                <span className="text-xs text-[#6e6e73] dark:text-[#8e8e93]">You can decline and still use every feature normally.</span>
              </>
            )}
          </span>
        </label>

        {/* Guardian acknowledgment */}
        <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] cursor-pointer mb-5 hover:border-[#2E6BE6]/50 transition-colors">
          <input
            type="checkbox"
            checked={guardianAcknowledged}
            onChange={(e) => setGuardianAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#d1d1d6] accent-[#2E6BE6] flex-shrink-0"
          />
          <span className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] leading-relaxed" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'หากอายุต่ำกว่า 20 ปี ผู้ปกครองหรือบิดามารดาของฉันรับทราบการใช้งานนี้แล้ว (ไม่บังคับ)'
              : 'If I am under 20 years old, my parent or guardian is aware of this registration. (Optional)'}
          </span>
        </label>

        <FieldError code={fieldError} lang={lang} />
        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ยืนยันและเริ่มต้น →' : 'Confirm & Continue →'}
        </button>
        <p className="text-xs text-[#aeaeb2] text-center mt-3" style={{ fontFamily: font }}>
          {lang === 'th'
            ? 'คุณสามารถขอลบข้อมูลได้ตลอดเวลาที่ hello@tundee.org'
            : 'You can request data deletion at any time: hello@tundee.org'}
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 Name
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณชื่ออะไร?' : "What's your name?"}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ชื่อที่ใช้แสดงในโปรไฟล์' : 'This will appear on your profile'}
          </p>
        </div>

        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={lang === 'th' ? 'ชื่อของคุณ' : 'Your name'}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full text-center text-2xl font-light border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#2E6BE6] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-3 mb-8 transition-colors"
          style={{ fontFamily: font }}
          onKeyDown={(e) => { if (e.key === 'Enter') nextStep(); }}
        />

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 Prior scholarship knowledge (research)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 2) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ก่อนใช้ทุนดี คุณรู้จักทุนการศึกษากี่ทุน?'
              : 'Before TunDee, how many scholarships did you know?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-1" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ข้อมูลนี้ใช้เพื่องานวิจัยเท่านั้น ไม่กระทบการจับคู่ทุน'
              : 'For research purposes only — does not affect matching'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PRIOR_KNOWLEDGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { setPriorKnowledge(opt.value); nextStep(); }}
              className={`flex flex-col items-center justify-center px-4 py-5 rounded-xl border-2 transition-all ${
                priorKnowledge === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] hover:border-[#2E6BE6]/50'
              }`}
            >
              <span className="text-2xl font-bold text-[#2E6BE6] mb-1">{opt.label}</span>
              <span className="text-xs text-[#6e6e73] dark:text-[#aeaeb2] text-center" style={{ fontFamily: font }}>
                {lang === 'th' ? opt.th : opt.en}
              </span>
            </button>
          ))}
        </div>

        <p className="text-center">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 Grade level
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 3) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🎓</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณกำลังเรียนอยู่ชั้นไหน?' : 'What grade are you in?'}
          </h1>
        </div>

        <div className="space-y-2 mb-6">
          {GRADE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => chooseGradeLevel(opt.value)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                gradeLevel === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#2E6BE6]/50 bg-white dark:bg-[#2c2c2e]'
              }`}
            >
              <span
                className="flex-1 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                style={{ fontFamily: font }}
              >
                {lang === 'th' ? opt.th : opt.en}
              </span>
              {gradeLevel === opt.value && <span className="text-[#2E6BE6] font-bold">✓</span>}
            </button>
          ))}
        </div>

        <FieldError code={fieldError} lang={lang} />
        <p className="text-center">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 GPA
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 4) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📊</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'เกรดเฉลี่ยของคุณคือเท่าไหร่?' : 'What is your GPA?'}
          </h1>
          <p className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ใช้สำหรับกรองทุนที่มีเงื่อนไขเกรด' : 'Used to match scholarships with GPA requirements'}
          </p>
        </div>

        <div className="text-center mb-8">
          <input
            type="number"
            min="0"
            max="4"
            step="0.01"
            value={gpa}
            onChange={(e) => {
              setGpa(e.target.value);
              setFieldError(validateField('gpa', e.target.value));
            }}
            placeholder="3.50"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="decimal"
            className="text-center text-4xl font-light w-40 border-0 border-b-2 border-[#e0e0e0] dark:border-[#3a3a3c] focus:border-[#2E6BE6] focus:outline-none bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] placeholder-[#aeaeb2] py-2 transition-colors"
            onKeyDown={(e) => { if (e.key === 'Enter') nextStep(); }}
          />
          <p className="text-xs text-[#aeaeb2] mt-2">0.00 – 4.00</p>
        </div>

        <FieldError code={fieldError} lang={lang} />
        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors mb-3"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center">
          <button
            onClick={() => { setGpa(''); nextStep(); }}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ยังไม่รู้ / ข้ามก่อน' : 'Not sure yet / Skip'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 Province
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 5) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📍</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณอยู่จังหวัดไหน?' : 'Which province are you from?'}
          </h1>
        </div>

        <div className="relative mb-3">
          <input
            type="text"
            value={provinceQuery}
            onChange={(e) => setProvinceQuery(e.target.value)}
            placeholder={lang === 'th' ? 'ค้นหาจังหวัด...' : 'Search province...'}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="w-full px-4 py-3 text-base border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none focus:border-[#2E6BE6] focus:ring-2 focus:ring-[#2E6BE6]/20 placeholder-[#aeaeb2]"
            style={{ fontFamily: fontTh }}
          />
        </div>

        <div className="max-h-52 overflow-y-auto border border-[#e0e0e0] dark:border-[#3a3a3c] rounded-xl mb-4 divide-y divide-[#f0f0f0] dark:divide-[#3a3a3c]">
          {filteredProvinces.slice(0, 20).map((pv) => (
            <button
              key={pv}
              onClick={() => { setProvince(pv); setStep(6); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                province === pv
                  ? 'bg-[#EFF4FF] dark:bg-[#162552] text-[#2E6BE6] font-semibold'
                  : 'bg-white dark:bg-[#2c2c2e] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F7F9FC] dark:hover:bg-[#3a3a3c]'
              }`}
              style={{ fontFamily: fontTh }}
            >
              {pv}
              {province === pv && <span className="float-right text-[#2E6BE6]">✓</span>}
            </button>
          ))}
          {filteredProvinces.length === 0 && (
            <p className="text-center text-sm text-[#aeaeb2] py-4" style={{ fontFamily: font }}>
              {lang === 'th' ? 'ไม่พบจังหวัด' : 'Province not found'}
            </p>
          )}
        </div>

        <FieldError code={fieldError} lang={lang} />
        <p className="text-center">
          <button
            onClick={() => setStep(6)}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6 Income & welfare card
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 6) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1" style={{ fontFamily: font }}>
            {lang === 'th' ? 'รายได้ครัวเรือนต่อเดือน' : 'Monthly household income'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'ใช้กรองทุนที่มีเงื่อนไขรายได้' : 'Used to match income-restricted scholarships'}
          </p>
        </div>

        <div className="space-y-1.5 mb-5">
          {INCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setIncomeBracket(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                incomeBracket === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#2E6BE6]/50'
              }`}
              style={{ fontFamily: font }}
            >
              {lang === 'th' ? opt.th : opt.en}
            </button>
          ))}
        </div>

        {/* Welfare card toggle */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#F7F9FC] dark:bg-[#2c2c2e] rounded-xl border border-[#e0e0e0] dark:border-[#3a3a3c] mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]" style={{ fontFamily: font }}>
              {lang === 'th' ? 'บัตรสวัสดิการแห่งรัฐ' : 'State Welfare Card'}
            </p>
            <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-0.5" style={{ fontFamily: font }}>
              {lang === 'th' ? 'มีบัตรสวัสดิการแห่งรัฐ' : 'I have a state welfare card'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWelfareCard(!welfareCard)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
              welfareCard ? 'bg-[#2E6BE6]' : 'bg-[#D1D1D6] dark:bg-[#636366]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                welfareCard ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <FieldError code={fieldError} lang={lang} />
        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7 Fields of interest
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 7) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📚</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-1" style={{ fontFamily: font }}>
            {lang === 'th' ? 'สนใจเรียนด้านไหน?' : 'What do you want to study?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93]" style={{ fontFamily: font }}>
            {lang === 'th' ? 'เลือกได้หลายอย่าง' : 'Select all that apply'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FIELDS_OF_STUDY.map((f) => (
            <button
              key={f.th}
              type="button"
              onClick={() => toggleField(f.th)}
              className={`px-3.5 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                selectedFields.includes(f.th)
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552] text-[#1E57CC] dark:text-[#5B8EF0]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] bg-white dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#aeaeb2] hover:border-[#2E6BE6]/50'
              }`}
              style={{ fontFamily: font }}
            >
              {lang === 'th' ? f.th : f.en}
            </button>
          ))}
        </div>

        <button
          onClick={nextStep}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors"
          style={{ fontFamily: font }}
        >
          {lang === 'th' ? 'ถัดไป →' : 'Next →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={nextStep}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
          >
            {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 8 Recruitment source (research) + final save
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 8) {
    return (
      <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">📣</div>
          <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
            {lang === 'th' ? 'คุณรู้จักทุนดีจากที่ไหน?' : 'How did you hear about TunDee?'}
          </h1>
          <p className="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-1" style={{ fontFamily: font }}>
            {lang === 'th'
              ? 'ข้อมูลนี้ใช้เพื่องานวิจัยเท่านั้น ไม่กระทบการจับคู่ทุน'
              : 'For research purposes only — does not affect matching'}
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {RECRUITMENT_SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRecruitmentSource(opt.value)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
                recruitmentSource === opt.value
                  ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                  : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#2E6BE6]/50 bg-white dark:bg-[#2c2c2e]'
              }`}
            >
              <span
                className="flex-1 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]"
                style={{ fontFamily: font }}
              >
                {lang === 'th' ? opt.th : opt.en}
              </span>
              {recruitmentSource === opt.value && <span className="text-[#2E6BE6] font-bold">✓</span>}
            </button>
          ))}
        </div>

        <FieldError code={fieldError} lang={lang} />
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#2E6BE6] hover:bg-[#1E57CC] text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ fontFamily: font }}
        >
          {saving && <Spinner />}
          {lang === 'th' ? 'บันทึกและเริ่มค้นหาทุน →' : 'Save & Find Scholarships →'}
        </button>
        <p className="text-center mt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors disabled:opacity-50"
          >
            {lang === 'th' ? 'ข้ามก่อน ดูทุนเลย' : 'Skip, browse scholarships now'}
          </button>
        </p>
      </WizardContainer>
    );
  }

  return null;
}
