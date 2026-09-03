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

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import { PROVINCES_TH, FIELDS_OF_STUDY } from '@/lib/translations';
import { logEvent } from '@/lib/research/events';
import { readAdParams } from '@/lib/adTracking';
import { profileCompleted } from '@/lib/analytics';
import { PREVIEW_COOKIE, decodePreviewInput } from '@/lib/preview/types';
import { CONSENT_VERSION } from '@/lib/consent';
import {
  GRADE_LEVELS, canonicalizeGradeLevel, hasGradeYear, gradeYearsFor, gradeYearLabel,
  coherentGradeYear,
} from '@/lib/profile/gradeLevels';
import {
  validateField,
  validateSetupAnswers,
  hasErrors,
  type SetupAnswers,
  type SetupErrorCode,
  type SetupField,
} from '@/lib/profile/setupAnswers';
import {
  clientLog,
  installGlobalErrorReporting,
  withTimeout,
  TimeoutError,
} from '@/lib/clientLog';
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

                {/* An expired session cannot be retried, so a retry button would
                    be a lie. It needs the one action that does work — and the
                    reassurance that the answers are still here, because the
                    reason students do not come back from this screen is that
                    they assume eight minutes of typing is gone. The draft is in
                    localStorage and is reloaded on return. */}
                {error === 'unauthorized' && (
                  <>
                    <a
                      href="/auth?next=/profile/setup"
                      className="mt-3 inline-block px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                    >
                      {lang === 'th' ? 'เข้าสู่ระบบอีกครั้ง' : 'Sign in again'}
                    </a>
                    <p className="mt-2 text-xs text-red-600/80 dark:text-red-400/80">
                      {lang === 'th'
                        ? 'คำตอบของคุณถูกเก็บไว้แล้ว กลับมากรอกต่อได้เลย'
                        : 'Your answers are saved — you can pick up where you left off.'}
                    </p>
                  </>
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

/**
 * How long the final save may take before we stop waiting.
 *
 * fetch has no default timeout, so without this a request that never settles
 * owns the spinner forever — which is the bug this page was reported for. Long
 * enough that a slow 3G save still completes, short enough that a student is
 * not staring at a spinner wondering whether to close the tab.
 */
const SAVE_TIMEOUT_MS = 15_000;

/**
 * Which build the browser is actually running.
 *
 * Vercel injects NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at build time, so this is
 * baked into the bundle rather than read at runtime — which is the point: a
 * cached bundle reports the commit it was built from, not the one currently
 * deployed. That difference is exactly what we could not see.
 */
const BUILD_ID = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7);

export default function ProfileSetupPage() {
  const { lang } = useLang();
  const router   = useRouter();
  const supabase = createClient();

  const [step,          setStep]          = useState(0);
  const [authLoading,   setAuthLoading]   = useState(true);

  /**
   * The signed-in user's id, for log lines only.
   *
   * A ref rather than state: the global error handlers are installed once and
   * would otherwise close over whatever the id was at mount — which is null.
   * Nothing renders from this, and nothing branches on it.
   */
  const userIdRef = useRef<string | null>(null);
  const [saving,        setSaving]        = useState(false);
  /** Save-level failure, as a code. Never a database message — see WizardContainer. */
  const [error,         setError]         = useState<SaveErrorCode | null>(null);
  /** Field-level rejection, shown at the answer rather than eight minutes later. */
  const [fieldError,    setFieldError]    = useState<SetupErrorCode | null>(null);
  const [provinceQuery, setProvinceQuery] = useState('');

  // Form values
  const [displayName,       setDisplayName]       = useState('');
  const [gradeLevel,        setGradeLevel]        = useState('');
  /** Only meaningful when hasGradeYear(gradeLevel) — null otherwise, and reset
   *  to null the moment the level changes so a stale year can never survive a
   *  switch away from the level it belonged to. */
  const [gradeYear,         setGradeYear]         = useState<number | null>(null);
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
    displayName, gradeLevel, gradeYear, gpa, province,
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
      // No gradeYear here: /start's own quiz never asks it, and PREFILLED_STEPS
      // sends anyone who arrives with a preview straight past step 3 (2 → 7),
      // so the year sub-question never renders for them either. A ม.4–6
      // student prefilled this way keeps grade_year null until they revisit
      // step 3 or /profile — matching for the ม.ปลาย group they still get, just
      // without the ม.6-leads-with-undergraduate refinement. Asking a fourth
      // question on /start to close that gap is a product decision for that
      // quiz, not something to smuggle in here.
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
  /**
   * Report what the browser sees, and recover the session after a bfcache
   * restore.
   *
   * BOTH HALVES EXIST FOR THE ANDROID-AFTER-LINE CASE.
   *
   * A student who signs in with LINE leaves for the LINE app and comes back.
   * On Android Chrome that return is frequently served from the back/forward
   * cache: the page is resurrected exactly as it was, JavaScript timers and
   * all, without a reload. Nothing re-runs. The Supabase client is the same
   * object it was before the trip, holding whatever access token it had then —
   * which, after an OAuth round trip, may already be stale. The refresh timer
   * that would have replaced it did not run while the page was frozen.
   *
   * `pageshow` with `event.persisted` is the only signal that this happened.
   * Without it the page looks alive and behaves as though signed in, and the
   * first thing that actually needs the token is the save.
   */
  useEffect(() => {
    const removeErrorReporting = installGlobalErrorReporting(() => userIdRef.current);

    /*
     * One line the moment this page is alive, before the student touches
     * anything.
     *
     * It exists because "no log arrived" has two completely different meanings
     * and we could not tell them apart: the handler never ran, or the phone is
     * running a cached bundle from before the logging existed. A student saved
     * a profile successfully on Android and NOTHING reached us — no client log,
     * no POST to /api/profile/setup — which is only possible if the JavaScript
     * doing the saving predates both.
     *
     * `build` settles it. If this line arrives at all, the browser is running
     * code that can report; if it names the current commit, it is running THIS
     * code. Absence is then a real finding rather than an ambiguity.
     */
    clientLog({
      level:   'info',
      message: '[setup] page loaded',
      context: {
        build:      BUILD_ID,
        step,
        referrer:   typeof document !== 'undefined' ? document.referrer || null : null,
        // Whether the browser can report at all, since a beacon that is
        // refused is another way for a log to silently not exist.
        canBeacon:  typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function',
        online:     typeof navigator !== 'undefined' ? navigator.onLine : null,
      },
    });

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;

      clientLog({
        level:   'info',
        message: '[setup] restored from bfcache — refreshing session',
        context: { visibility: document.visibilityState },
      });

      // Bounded: this runs on a page that has just been resurrected on a phone
      // whose network may have changed underneath it. An unbounded refresh here
      // would reintroduce exactly the hang this page was reported for.
      withTimeout(supabase.auth.refreshSession(), 10_000, 'refreshSession after bfcache')
        .then(({ data, error }) => {
          clientLog({
            level:   error ? 'error' : 'info',
            message: error ? '[setup] session refresh failed after bfcache' : '[setup] session refreshed after bfcache',
            context: { hasSession: !!data?.session, detail: error?.message },
          });
        })
        .catch((err) => {
          // Reported, not acted on. The save path already handles a missing
          // session by showing the sign-in message and keeping the draft, and
          // redirecting someone away mid-wizard on a guess would be worse.
          clientLog({
            level:   'error',
            message: '[setup] session refresh threw after bfcache',
            context: { detail: err instanceof Error ? err.message : String(err) },
          });
        });
    };

    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      removeErrorReporting();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      /*
       * Bounded, for the same reason as the save.
       *
       * getSession() reads from storage but refreshes over the network when the
       * token has expired — which is precisely the state a phone returning from
       * the LINE app is in. Unbounded, a stall here leaves the wizard on its
       * loading spinner with no way forward and nothing logged.
       */
      let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'];
      try {
        ({ data } = await withTimeout(supabase.auth.getSession(), 10_000, 'getSession on mount'));
      } catch (err) {
        clientLog({
          level:   'error',
          message: '[setup] getSession failed or timed out on mount',
          context: { detail: err instanceof Error ? err.message : String(err) },
        });
        // Not a redirect to /auth: that would throw away a draft over what may
        // be a transient stall. Stop loading and let the student proceed; the
        // save path reports 401 honestly and keeps their answers.
        if (!cancelled) setAuthLoading(false);
        return;
      }

      if (!data.session) {
        router.replace('/auth');
        return;
      }
      if (cancelled) return;

      const user = data.session.user;
      userIdRef.current = user.id;
      const metadataName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'display_name, grade_level, grade_year, gpa, province, income_bracket, welfare_card, ' +
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
      // Read through the same coherence check the write side uses: a year that
      // does not belong to the (possibly just-upgraded) level is not shown as
      // if it did, even if it is still sitting in the stored row.
      const year = coherentGradeYear(grade, merged.gradeYear);
      if (year !== null) setGradeYear(year);
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
   *
   * Does NOT always advance to step 4. ม.1–3 and ม.4–6 have a year inside them
   * — the difference between a ม.6 student, for whom most Thai undergraduate
   * scholarships are the highest-value thing in the catalogue, and a ม.4
   * student, for whom the same list is two years away — so those two stay on
   * this step for one more tap. Every other level has nothing further to ask
   * and advances immediately, same as before this existed.
   */
  function chooseGradeLevel(value: string) {
    const code = validateField('gradeLevel', value);
    if (code) { setFieldError(code); return; }
    setFieldError(null);
    setGradeLevel(value);
    // Reset unconditionally: a year answered under a PREVIOUS level must never
    // survive a switch to a new one, even briefly in local state — the write-
    // time coherence rule would clear it on save regardless, but the screen
    // should not claim ม.6 for a student who just chose ม.1–3.
    setGradeYear(null);
    persistStep(3, { ...answers, gradeLevel: value, gradeYear: null });

    if (hasGradeYear(value)) return; // year sub-question renders next, same step
    setStep(4);
  }

  /** The follow-up: which year inside the chosen level. */
  function chooseGradeYear(year: number) {
    const code = validateField('gradeYear', year);
    if (code) { setFieldError(code); return; }
    setFieldError(null);
    setGradeYear(year);
    persistStep(3, { ...answers, gradeYear: year });
    setStep(4);
  }

  async function handleSave() {
    /*
     * (0a) The tap itself, before anything can go wrong.
     *
     * This exists to answer one question that could not be answered before: did
     * the handler run at all? A button that spins forever and a button whose
     * onClick never fired look the same on a phone. If this line appears in the
     * Vercel log and the next one does not, the hang is between here and the
     * request; if this line is missing, the tap never reached React.
     */
    clientLog({
      level:   'info',
      message: '[setup] save tapped',
      context: { step, savingAlready: saving },
    });

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
       * answers 401, which the handler below already handles.
       *
       * (0b) — "did we have a session" is answered by the route's 401 instead,
       * and reported below. That is strictly better than asking here: it is the
       * server's own view of the session, and it costs no extra round trip.
       */

      // Client-side first, so a rejection costs no round trip and lands the
      // student on the step that owns the answer rather than on a wall of red.
      const errors = validateSetupAnswers(answers);
      if (hasErrors(errors)) {
        const [field, code] = Object.entries(errors)[0] as [SetupField, SetupErrorCode];
        clientLog({ level: 'warn', message: '[setup] client validation rejected', context: { field, code } });
        setFieldError(code);
        setError('validation');
        setStep(FIELD_STEP[field]);
        return;
      }

      // (1) Everything about to be sent, before it is sent.
      clientLog({
        level:   'info',
        message: '[setup] posting answers',
        context: { answers, step },
      });

      // The write happens server-side. The browser gets a code back and never a
      // Postgres message — the real error is logged in the route with the user
      // id, the step and the payload.
      let res: Response;
      try {
        /*
         * Bounded, because unbounded is how the button hangs.
         *
         * fetch has no default timeout. A phone returning from the LINE app has
         * a suspended tab, possibly a changed network, and a request that may
         * never settle either way. 15 seconds is far longer than this call ever
         * legitimately takes and far shorter than "forever".
         */
        res = await withTimeout(
          fetch('/api/profile/setup', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ partial: false, answers }),
          }),
          SAVE_TIMEOUT_MS,
          'POST /api/profile/setup',
        );
      } catch (err) {
        const timedOut = err instanceof TimeoutError;
        // (3) The failure, with everything we know about it.
        clientLog({
          level:   'error',
          message: timedOut ? '[setup] save timed out' : '[setup] save request failed',
          context: {
            name:    err instanceof Error ? err.name : typeof err,
            detail:  err instanceof Error ? err.message : String(err),
            online:  typeof navigator !== 'undefined' ? navigator.onLine : null,
            timeout: timedOut ? SAVE_TIMEOUT_MS : undefined,
          },
        });
        // Both cases mean the same thing to the student and offer the same
        // remedy: the answers are safe, press the button again.
        setError(timedOut ? 'save_failed' : 'network');
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          // (0b), answered by the server: there was no usable session.
          // Never a silent return — the draft is preserved and the student is
          // told to sign in rather than left tapping a button that cannot work.
          clientLog({ level: 'error', message: '[setup] save rejected: no session', context: { status: 401 } });
          persistStep(step);
          setError('unauthorized');
          return;
        }
        if (res.status === 422) {
          // The server disagreed with the client's validation. Put the student
          // on the offending step instead of failing at 100%.
          const body = await res.json().catch(() => ({}));
          const entries = Object.entries(body?.fields ?? {}) as Array<[SetupField, SetupErrorCode]>;
          clientLog({ level: 'error', message: '[setup] server validation rejected', context: body?.fields ?? null });
          if (entries.length > 0) {
            setFieldError(entries[0][1]);
            setStep(FIELD_STEP[entries[0][0]]);
          }
          setError('validation');
          return;
        }
        // Anything else: the answers are already saved step by step, so the
        // honest message is "try again", with a button that does exactly that.
        clientLog({ level: 'error', message: '[setup] save failed', context: { status: res.status } });
        setError('save_failed');
        return;
      }

      // (2) It worked.
      clientLog({ level: 'info', message: '[setup] saved' });

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

      // Ad-platform ProfileCompleted — a qualified lead, not just an account.
      // The wizard is the only place both grade_level and province are known
      // to be final (mid-form they can still change), so this is the one call
      // site for it.
      profileCompleted({ gradeLevel, province });

      // No CompleteRegistration here. The account was created at the auth
      // callback and reported there, for every branch — including this one. The
      // wizard is onboarding, not registration, and firing again would
      // double-count the visitors who do reach the end of it. profile_completed
      // above is the event that means "finished the wizard".

      // Back to wherever the funnel started — for /start traffic that's their
      // own matched results, not a generic list.
      router.replace(destination);
    } catch (e) {
      // Anything unforeseen. Reported rather than only console.error'd, because
      // a console on a student's phone is not somewhere we can look.
      clientLog({
        level:   'error',
        message: '[setup] unexpected exception in handleSave',
        context: {
          name:   e instanceof Error ? e.name : typeof e,
          detail: e instanceof Error ? e.message : String(e),
          stack:  e instanceof Error ? e.stack?.slice(0, 1_000) : undefined,
        },
      });
      setError('save_failed');
    } finally {
      /*
       * The single exit point for the spinner.
       *
       * Every branch above used to clear it individually, which meant every new
       * branch was a chance to forget — and forgetting looks exactly like the
       * hang we are chasing. A `finally` cannot be forgotten.
       *
       * It runs on the success path too, after router.replace has been called.
       * That is harmless: the navigation is already under way, and if it does
       * not happen the student is left with a working button rather than a dead
       * one.
       */
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
  // STEP 3 Grade level, and — inline, same step — which year inside it
  // ══════════════════════════════════════════════════════════════════════════
  if (step === 3) {
    // A level chosen but not yet advanced past: hasGradeYear(gradeLevel) is
    // only true for M1-M3 and M4-M6, and chooseGradeLevel deliberately does
    // not call setStep(4) for those — this is what keeps the student here for
    // one more tap instead of moving them straight to step 4.
    const askingYear = hasGradeYear(gradeLevel);

    if (askingYear) {
      const chosen = GRADE_LEVELS.find(g => g.value === gradeLevel);
      return (
        <WizardContainer step={step} total={TOTAL_STEPS} lang={lang} error={error} onRetry={handleSave} retrying={saving} onBack={prevStep}>
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">📅</div>
            <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2" style={{ fontFamily: font }}>
              {lang === 'th' ? 'ชั้นปีไหน?' : 'Which year?'}
            </h1>
            {chosen && (
              <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]" style={{ fontFamily: font }}>
                {lang === 'th'
                  ? `คุณเลือก ${chosen.th} — อีกแค่นี้ก็เสร็จ`
                  : `You chose ${chosen.en} — one more tap`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-6">
            {gradeYearsFor(gradeLevel).map((year) => (
              <button
                key={year}
                onClick={() => chooseGradeYear(year)}
                className={`flex items-center justify-center px-4 py-4 rounded-xl border-2 font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] transition-all ${
                  gradeYear === year
                    ? 'border-[#2E6BE6] bg-[#EFF4FF] dark:bg-[#162552]'
                    : 'border-[#e0e0e0] dark:border-[#3a3a3c] hover:border-[#2E6BE6]/50 bg-white dark:bg-[#2c2c2e]'
                }`}
                style={{ fontFamily: font }}
              >
                {gradeYearLabel(year, lang === 'th' ? 'th' : 'en')}
              </button>
            ))}
          </div>

          <FieldError code={fieldError} lang={lang} />

          <div className="flex items-center justify-between">
            {/* Not prevStep: that leaves step 3 for step 2. This stays on step
                3 and re-opens the level list, for a student who tapped the
                wrong one — a genuinely different action from "go back". */}
            <button
              onClick={() => { setGradeLevel(''); setGradeYear(null); setFieldError(null); }}
              className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
            >
              {lang === 'th' ? '‹ เปลี่ยนระดับชั้น' : '‹ Change level'}
            </button>
            <button
              onClick={nextStep}
              className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
            >
              {lang === 'th' ? 'ข้ามก่อน' : 'Skip for now'}
            </button>
          </div>
        </WizardContainer>
      );
    }

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
