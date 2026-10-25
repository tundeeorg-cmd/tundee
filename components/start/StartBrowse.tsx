'use client';

/**
 * /start: browse first, ask later.
 *
 * Real scholarships, in the page, before anything is asked. Search and chips work
 * without an account and without answering a thing. The matcher is an invitation
 * a visitor opts into, inline, not a gate: nothing here is blurred, covered or
 * withheld, and nothing asks for a login to LOOK.
 *
 * The default list is open scholarships by soonest deadline, identical for every
 * visitor. It is not personalized and not an experiment arm; the ranked list a
 * visitor gets after the matcher is a different, opt-in thing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import TdScholarshipCard from '@/components/TdScholarshipCard';
import TrustStrip from '@/components/trust/TrustStrip';
import { logFunnelEvent } from '@/lib/research/funnel';
import PreviewMatcher from '@/app/start/PreviewMatcher';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { START_CARD_SELECT } from '@/lib/tdScholarships/startColumns';
import {
  NO_FILTERS, applyFilters, bangkokToday, hasActiveFilters, isActionable, sortByDeadline,
  type LevelChip, type StartFilters,
} from '@/lib/scholarships/startFilter';

const th = { fontFamily: "'Sarabun', system-ui, sans-serif" } as const;

const PAGE = 12;
/** The invitation sits after this many cards, so it is met by scrolling, never by a pop-up. */
const INVITE_AFTER = 10;
const FULL_LIST_TIMEOUT_MS = 12_000;

const LEVEL_CHIPS: { key: LevelChip; label: string }[] = [
  { key: 'high_school',   label: 'มัธยม' },
  { key: 'undergraduate', label: 'ป.ตรี' },
  { key: 'postgraduate',  label: 'ป.โท/เอก' },
];

type FullState = 'idle' | 'loading' | 'ready' | 'error';

/** The scholarship the visitor must scroll past for the page to count as "browsed". */
const BROWSED_AFTER_CARDS = 3;

/**
 * Logs a funnel step at most once per browser session (the session_id the event
 * carries is per tab). Fire-and-forget like every funnel write: a failure must
 * never reach the visitor.
 */
function logStepOnce(step: 'browsed' | 'personalize_shown', context: Record<string, unknown> = {}) {
  const key = `tundee_step_${step}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // sessionStorage unavailable (private mode, some webviews): log once per mount.
  }
  logFunnelEvent({ eventType: step, context: { surface: 'start', ...context } });
}

/** Calls `onSeen` the first time the element is at least a quarter on screen. */
function useSeenOnce(ref: React.RefObject<Element | null>, onSeen: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { onSeen(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}

export default function StartBrowse({
  initialCards,
  listOk,
  researchConsentOffered = false,
  signupHref,
  registeredCount,
  scholarshipCount,
  funderCount,
}: {
  initialCards: TdScholarship[];
  /** False when the server could not load the list: the matcher is then shown at once. */
  listOk: boolean;
  /** True only when ANON_RANDOMIZATION is on. */
  researchConsentOffered?: boolean;
  signupHref: string;
  registeredCount: number | null;
  scholarshipCount: number | null;
  funderCount: number | null;
}) {
  const [filters, setFilters] = useState<StartFilters>(NO_FILTERS);
  const [full, setFull] = useState<TdScholarship[] | null>(null);
  const [fullState, setFullState] = useState<FullState>('idle');
  const [shown, setShown] = useState(PAGE);
  const [matcherOpen, setMatcherOpen] = useState(!listOk);
  const matcherRef = useRef<HTMLDivElement | null>(null);
  const inviteRef = useRef<HTMLDivElement | null>(null);
  const thirdCardRef = useRef<HTMLDivElement | null>(null);

  // The invitation to answer the questions has been on screen.
  useSeenOnce(inviteRef, () => logStepOnce('personalize_shown'));
  // Scrolled past the first three cards.
  useSeenOnce(thirdCardRef, () => logStepOnce('browsed', { how: 'scroll' }));

  const today = useMemo(() => bangkokToday(), []);
  const filtering = hasActiveFilters(filters);

  /** The whole open list, fetched the first time a visitor searches or filters. */
  const loadFull = useCallback(async () => {
    if (fullState === 'loading' || fullState === 'ready') return;
    setFullState('loading');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FULL_LIST_TIMEOUT_MS);
    try {
      const { data, error } = await createClient()
        .from('td_scholarships')
        .select(START_CARD_SELECT)
        .eq('is_displayed', true)
        .in('status_effective', ['Closing Soon', 'Open'])
        .abortSignal(controller.signal);
      if (error) throw error;
      setFull(sortByDeadline(((data ?? []) as unknown as TdScholarship[]).filter((s) => isActionable(s, today)), today));
      setFullState('ready');
    } catch (err) {
      console.error('[start] full list failed:', err);
      setFullState('error');
    } finally {
      clearTimeout(timer);
    }
  }, [fullState, today]);

  // A filter or a search needs the whole list; the first paint only carries a page of it.
  useEffect(() => {
    if (!filtering) return;
    logStepOnce('browsed', { how: 'filter' });
    void loadFull();
  }, [filtering, loadFull]);

  useEffect(() => { setShown(PAGE); }, [filters]);

  const source = filtering ? full : initialCards;
  const visible = useMemo(
    () => (source ? applyFilters(source, filters, today) : []),
    [source, filters, today],
  );
  const page = visible.slice(0, shown);

  function openMatcher() {
    setMatcherOpen(true);
    // After the form has rendered, bring it into view. No modal, no focus trap.
    requestAnimationFrame(() => matcherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const chip = (active: boolean) =>
    `shrink-0 min-h-[40px] px-4 rounded-full border-2 text-sm font-semibold transition-colors ${
      active
        ? 'border-[#1B3A6B] bg-[#EBF2FF] dark:bg-[#162552] text-[#1B3A6B] dark:text-[#8FB4FF]'
        : 'border-[#E8ECF2] dark:border-[#1A2E4A] bg-white dark:bg-[#0D1F35] text-[#6E7A8A] dark:text-[#8e9bb0]'
    }`;

  const invite = (
    <button
      type="button"
      onClick={openMatcher}
      style={th}
      className="w-full text-left rounded-xl border-2 border-[#1B3A6B]/25 dark:border-[#8FB4FF]/25 bg-[#EBF2FF] dark:bg-[#0D1F35] px-4 py-3 active:opacity-90"
    >
      <span className="block text-sm font-bold text-[#1B3A6B] dark:text-[#8FB4FF]">
        ดูทุนที่ตรงกับคุณ →
      </span>
      <span className="block text-xs text-[#4A5A70] dark:text-[#8e9bb0] mt-0.5">
        ตอบ 3 คำถาม ใช้เวลาประมาณ 30 วินาที (ไม่ต้องสมัครสมาชิก)
      </span>
    </button>
  );

  return (
    <div className="max-w-[560px] mx-auto text-left">
      <TrustStrip scholarships={scholarshipCount} funders={funderCount} lang="th" className="mb-4 text-center" />

      {/* Search — 16px so iOS does not zoom the page on focus. */}
      <label htmlFor="start-search" className="sr-only">ค้นหาทุน</label>
      <input
        id="start-search"
        type="search"
        inputMode="search"
        value={filters.query}
        onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
        placeholder="ค้นหาชื่อทุน หรือผู้ให้ทุน"
        style={{ ...th, fontSize: '16px' }}
        className="w-full min-h-[52px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0] focus:outline-none focus:border-[#1B3A6B] transition-colors"
      />

      {/* One-tap chips. The province question lives in the matcher, which knows
          which provinces a scholarship really accepts; a text chip would guess. */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="กรองทุน">
        {LEVEL_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filters.level === c.key}
            onClick={() => setFilters((f) => ({ ...f, level: f.level === c.key ? null : c.key }))}
            style={th}
            className={chip(filters.level === c.key)}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.closingSoon}
          onClick={() => setFilters((f) => ({ ...f, closingSoon: !f.closingSoon }))}
          style={th}
          className={chip(filters.closingSoon)}
        >
          ใกล้ปิดรับ
        </button>
        <button
          type="button"
          aria-pressed={filters.lowIncome}
          onClick={() => setFilters((f) => ({ ...f, lowIncome: !f.lowIncome }))}
          style={th}
          className={chip(filters.lowIncome)}
        >
          รายได้น้อย
        </button>
        <button type="button" onClick={openMatcher} style={th} className={chip(false)}>
          จังหวัดของฉัน
        </button>
      </div>

      <div className="mt-3" ref={inviteRef}>{invite}</div>

      {matcherOpen && (
        <div ref={matcherRef} id="tundee-matcher-inline" className="mt-4 scroll-mt-4">
          <PreviewMatcher
            signupHref={signupHref}
            registeredCount={registeredCount}
            scholarshipCount={scholarshipCount}
            funderCount={funderCount}
            researchConsentOffered={researchConsentOffered}
          />
        </div>
      )}

      {/* The list. */}
      <div className="mt-5">
        {!listOk && !filtering ? (
          <p className="text-sm text-center text-[#6E7A8A] dark:text-[#8e9bb0]" style={th}>
            ยังโหลดรายการทุนไม่ได้ในตอนนี้ — ตอบ 3 คำถามด้านบนเพื่อดูทุนที่ตรงกับคุณได้เลย
          </p>
        ) : filtering && fullState === 'loading' ? (
          <p className="text-sm text-center text-[#6E7A8A] dark:text-[#8e9bb0] py-6" style={th} role="status">
            กำลังค้นหา…
          </p>
        ) : filtering && fullState === 'error' ? (
          <div className="text-center py-6">
            <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-3" style={th} role="alert">
              ค้นหาไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่
            </p>
            <button type="button" onClick={() => { setFullState('idle'); void loadFull(); }}
                    style={th} className="min-h-[44px] px-6 rounded-xl bg-[#1B3A6B] text-white font-bold text-sm">
              ลองอีกครั้ง
            </button>
          </div>
        ) : page.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-3" style={th}>
              ไม่พบทุนที่ตรงกับคำค้นนี้
            </p>
            <button type="button" onClick={() => setFilters(NO_FILTERS)} style={th}
                    className="min-h-[44px] px-6 rounded-xl border-2 border-[#1B3A6B] text-[#1B3A6B] dark:text-[#8FB4FF] dark:border-[#8FB4FF] font-bold text-sm">
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#6E7A8A] dark:text-[#8e9bb0] mb-3" style={th}>
              {filtering
                ? `พบ ${visible.length.toLocaleString('th-TH')} ทุน`
                : 'ทุนที่เปิดรับอยู่ เรียงตามวันปิดรับที่ใกล้ที่สุด'}
            </p>
            <div className="flex flex-col gap-4">
              {page.map((s, i) => (
                <div key={s.scholarship_id} ref={i === BROWSED_AFTER_CARDS - 1 ? thirdCardRef : undefined}>
                  <TdScholarshipCard scholarship={s} userId={null} variant={null} />
                  {i === INVITE_AFTER - 1 && <div className="mt-4">{invite}</div>}
                </div>
              ))}
            </div>
            {visible.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                style={th}
                className="mt-4 w-full min-h-[52px] rounded-xl border-2 border-[#1B3A6B] dark:border-[#8FB4FF] text-[#1B3A6B] dark:text-[#8FB4FF] font-bold text-sm"
              >
                ดูทุนเพิ่ม
              </button>
            )}
            {!filtering && initialCards.length <= shown && (
              <a href="/scholarships" style={th}
                 className="mt-4 block text-center text-sm font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] underline">
                ดูทุนทั้งหมดที่เปิดรับ
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
