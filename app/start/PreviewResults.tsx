'use client';

/**
 * Preview result cards for /start.
 *
 * The top matches render as real, complete cards — name, funder, award, deadline
 * and the recommender's own Thai "why you match" sentence. Everything below is
 * blurred with an explicit count, so the signup gate reads as "there is more of
 * this waiting" rather than "you hit a paywall".
 *
 * Thai-only by design: /start serves cold Thai ad traffic and has no language
 * toggle (unlike the main app, which is bilingual).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { formatUserDate } from '@/lib/formatDate';
import { getDeadlineInfo } from '@/lib/deadline';
import { trackFormResultsSeen, trackPreviewResults } from '@/lib/adTracking';
import { WhyFreeCondensed } from '@/components/trust/WhyTunDeeIsFree';
import TrustStrip from '@/components/trust/TrustStrip';
import { logFunnelEvent } from '@/lib/research/funnel';
import type { PreviewMatchCard, PreviewResponse } from '@/lib/preview/types';

const th = { fontFamily: "'Sarabun', system-ui, sans-serif" } as const;

const AWARD_TIER_TH: Record<string, string> = {
  full_ride:    'ทุนเต็มจำนวน (ค่าเรียน+ค่าครองชีพ)',
  full_tuition: 'ค่าเล่าเรียนเต็มจำนวน',
  large:        'ทุนขนาดใหญ่ (≥100,000 บาท)',
  medium:       'ทุนขนาดกลาง (20,000–100,000 บาท)',
  small:        'ทุนขนาดเล็ก (ต่ำกว่า 20,000 บาท)',
  stipend_only: 'ค่าครองชีพ/เบี้ยเลี้ยง',
};

function awardLabel(card: PreviewMatchCard): string {
  if (card.award_tier && AWARD_TIER_TH[card.award_tier]) return AWARD_TIER_TH[card.award_tier];
  if (card.award_amount) {
    const n = Number(card.award_amount);
    if (Number.isFinite(n) && n > 0) return `${n.toLocaleString('th-TH')} บาท`;
  }
  return 'ดูรายละเอียดในประกาศ';
}

function deadlineLabel(card: PreviewMatchCard): string {
  if (card.deadline_is_rolling) return 'รับสมัครต่อเนื่อง';
  if (!card.deadline_date) return 'ตรวจสอบเว็บไซต์';
  const info = getDeadlineInfo(card.deadline_date);
  return `${formatUserDate(card.deadline_date, 'th')} · ${info.label}`;
}

// ── One real card ─────────────────────────────────────────────────────────────

function MatchCard({ card, onApply }: { card: PreviewMatchCard; onApply: (c: PreviewMatchCard) => void }) {
  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-2xl p-5 text-left">
      <p className="font-bold text-[#0A2342] dark:text-[#E8EDF5] leading-snug" style={{ ...th, fontSize: '1rem' }}>
        {card.name}
      </p>
      {card.funder && (
        <p className="text-[#6E7A8A] dark:text-[#8e9bb0] text-sm mt-1" style={th}>
          {card.funder}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-[#8A96A8] dark:text-[#7A8FA8] shrink-0" style={th}>มูลค่าทุน</span>
          <span className="text-sm font-semibold text-[#0A2342] dark:text-[#E8EDF5]" style={th}>
            {awardLabel(card)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-[#8A96A8] dark:text-[#7A8FA8] shrink-0" style={th}>ปิดรับสมัคร</span>
          <span className="text-sm font-semibold text-[#0A2342] dark:text-[#E8EDF5]" style={th}>
            {deadlineLabel(card)}
          </span>
        </div>
      </div>

      <div className="mt-3 bg-[#EBF2FF] dark:bg-[#0D1F35] rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] mb-1" style={th}>
          ทำไมคุณถึงเหมาะกับทุนนี้
        </p>
        <p className="text-sm text-[#1B3A6B] dark:text-[#8FB4FF] leading-relaxed" style={th}>
          {card.explanation}
        </p>
      </div>

      {/* The card is only a real card if it can be acted on. Anonymous visitors get the
          working link — the proof that these scholarships exist is the point of the
          whole preview, and a dead card proves nothing. */}
      {card.apply_url && (
        <a
          href={card.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onApply(card)}
          style={th}
          className="mt-3 flex items-center justify-center gap-1.5 w-full min-h-[48px] rounded-xl border-2 border-[#1B3A6B] dark:border-[#8FB4FF] text-[#1B3A6B] dark:text-[#8FB4FF] font-bold text-sm active:opacity-90"
        >
          ไปที่เว็บไซต์ทุน
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
}

// ── Blurred, gated card ───────────────────────────────────────────────────────

function LockedCard() {
  return (
    <div
      aria-hidden="true"
      className="bg-white dark:bg-[#0A1628] border border-[#E8ECF2] dark:border-[#1A2E4A] rounded-2xl p-5 select-none"
      style={{ filter: 'blur(5px)' }}
    >
      <div className="h-4 w-3/4 rounded bg-[#DDE4EE] dark:bg-[#1A2E4A]" />
      <div className="h-3 w-1/2 rounded bg-[#E8ECF2] dark:bg-[#16263F] mt-2.5" />
      <div className="h-3 w-2/3 rounded bg-[#E8ECF2] dark:bg-[#16263F] mt-4" />
      <div className="h-3 w-1/2 rounded bg-[#E8ECF2] dark:bg-[#16263F] mt-2" />
      <div className="h-12 rounded-xl bg-[#EBF2FF] dark:bg-[#0D1F35] mt-4" />
    </div>
  );
}

// ── Results block ─────────────────────────────────────────────────────────────

export default function PreviewResults({
  results,
  signupHref,
  onReset,
  registeredCount,
  scholarshipCount,
  funderCount,
}: {
  results: PreviewResponse;
  signupHref: string;
  onReset: () => void;
  /** Rounded signup count for the social-proof line; null hides it entirely. */
  registeredCount: number | null;
  /** Live catalogue counts for the trust strip. Null drops that segment. */
  scholarshipCount: number | null;
  funderCount: number | null;
}) {
  const tracked = useRef(false);

  // Ad-pixel conversion signal: the visitor reached real value before signup.
  // content_ids are the scholarships actually shown, so Meta can build
  // audiences around the specific opportunities that convert.
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackPreviewResults(results.total, results.preview.map(c => c.scholarship_id));
    // Lead — the event ad delivery optimizes against — fires here: the
    // visitor answered the 3-question form and is now looking at real
    // matched scholarships. trackFormResultsSeen's own sessionStorage guard
    // is the one that actually matters for "once per session"; this ref only
    // stops a same-mount re-render from calling it twice.
    trackFormResultsSeen(results.total);

    // results_viewed — the funnel step where the visitor has actually SEEN
    // value. total and locked_count are recorded so the gate can be evaluated
    // against what was really on screen, not what we assume was.
    logFunnelEvent({
      eventType: 'results_viewed',
      context: {
        total:        results.total,
        shown:        results.preview.length,
        locked_count: results.lockedCount,
        broadened:    results.broadened,
      },
    });
  }, [results]);

  const lockedPlaceholders = Math.min(results.lockedCount, 2);
  const hasLocked = results.lockedCount > 0;

  // The portal below needs document.body, which does not exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /** An anonymous visitor clicking through to a funder. Logged, never blocked. */
  function handleApply(card: PreviewMatchCard) {
    logFunnelEvent({
      eventType:     'click_apply',
      scholarshipId: card.scholarship_id,
      context:       { source: 'preview_card', logged_in: false },
    });
  }

  const GATE_BULLETS = [
    'ดูทุนทั้งหมดที่คุณมีสิทธิ์สมัคร',
    'แจ้งเตือนก่อนวันปิดรับ ไม่พลาดแน่นอน',
    'บันทึกทุนที่สนใจไว้ดูทีหลัง',
  ];

  return (
    <div className="text-left">
      <div className="text-center mb-5">
        <h2 className="font-bold text-[#0A2342] dark:text-[#E8EDF5]" style={{ ...th, fontSize: 'clamp(1.15rem, 5vw, 1.4rem)' }}>
          {/* The broadened branch keeps its own wording: these are near-misses, and
              claiming "you are eligible for N" over them would be false. */}
          {results.broadened
            ? 'ยังไม่มีทุนที่ตรงเป๊ะ แต่เรามีทุนที่น่าสนใจให้คุณ'
            : `เจอ ${results.total} ทุนที่คุณมีสิทธิ์สมัคร 🎓`}
        </h2>
        <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mt-1.5" style={th}>
          {results.broadened
            ? 'ลองดูทุนเหล่านี้ก่อน — หลายทุนผ่อนปรนเรื่องเกรด และมีทุนใหม่เพิ่มเข้ามาทุกสัปดาห์'
            : 'ตรวจสอบโดยทีมงาน · ไม่มีทุนหมดอายุ'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {results.preview.map((card) => (
          <MatchCard key={card.scholarship_id} card={card} onApply={handleApply} />
        ))}
      </div>

      {hasLocked && (
        <div className="relative mt-3">
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: lockedPlaceholders }, (_, i) => <LockedCard key={i} />)}
          </div>

          <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center bg-gradient-to-b from-transparent via-[#F5F7FA]/80 to-[#F5F7FA] dark:via-[#07111F]/80 dark:to-[#07111F]">
            <p className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center px-5" style={{ ...th, fontSize: '1rem' }}>
              อีก {results.lockedCount} ทุนที่คุณมีสิทธิ์ รออยู่
            </p>
          </div>
        </div>
      )}

      {/* Sticky CTA, phones only.
          Three full cards plus the blurred pair put the inline CTA ~2.5 screens down on a
          375px viewport, and this traffic is almost entirely small-phone; the brief
          requires the primary action stay reachable without pinch-zoom.

          Portalled to <body> deliberately. /start's root wrapper computes a
          `transform: matrix(1,0,0,1,0,0)` — an identity transform, but any transform
          other than `none` makes an element the containing block for its `fixed`
          descendants, so an in-tree bar positioned itself against the page instead of
          the viewport and landed 4,700px down, further away than the button it was
          meant to replace. The portal is immune to whatever the wrapper does next. */}
      {mounted && createPortal(
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-[#F5F7FA] via-[#F5F7FA] to-transparent dark:from-[#07111F] dark:via-[#07111F]">
          <Link
            href={signupHref}
            style={th}
            className="block w-full text-center bg-[#1B3A6B] text-white py-3.5 px-6 rounded-2xl font-bold text-base active:opacity-90 shadow-lg shadow-[#0A2342]/15"
          >
            ดูทุนทั้งหมด — ฟรี
          </Link>
        </div>,
        document.body,
      )}

      {/* Clears the sticky bar so it never covers the last card or the reset link. */}
      <div className="sm:hidden h-20" aria-hidden="true" />

      <div className="mt-5">
        {/* With three or fewer matches there is nothing behind the gate, so the ask is
            reframed around the reminder rather than around locked cards. This block used
            to be hidden entirely when nothing was locked, so those visitors reached the
            end of their results and were never asked to sign up at all. */}
        {!hasLocked && (
          <p className="text-center font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-3" style={{ ...th, fontSize: '1rem' }}>
            รับแจ้งเตือนก่อนวันปิดรับ — ฟรี
          </p>
        )}

        <ul className="flex flex-col gap-2 mb-4">
          {GATE_BULLETS.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2.5 text-sm text-[#0A2342] dark:text-[#E8EDF5]" style={th}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   className="mt-0.5 shrink-0 text-[#1B3A6B] dark:text-[#8FB4FF]" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              {bullet}
            </li>
          ))}
        </ul>

        <Link
          href={signupHref}
          style={th}
          className="block w-full text-center bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-4 px-8 rounded-2xl font-bold text-base transition-colors active:opacity-90"
        >
          ดูทุนทั้งหมด — ฟรี
        </Link>
        <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={th}>
          ใช้เวลา 10 วินาที · ฟรี 100% · ไม่มีโฆษณา
        </p>
        {registeredCount !== null && (
          <p className="mt-2 text-center text-xs text-[#6E7A8A] dark:text-[#8e9bb0]" style={th}>
            นักเรียน {registeredCount.toLocaleString('th-TH')}+ คนใช้ TunDee หาทุนแล้ว
          </p>
        )}
        {/* The scam question, answered where it is actually being asked.
            A visitor at this point has seen real matched scholarships and is deciding
            whether to hand over their details; "free" is the part that reads as a
            warning sign in this market, so the three lines that say what TunDee takes
            sit directly under the button rather than on a page nobody clicks through to.
            Note this space is usually empty: the social-proof line above renders only
            above lib/social/userCount MIN_DISPLAYABLE, which the real count is far
            below. */}
        {/* Scale first, then what it costs them: the two halves of "is this real". */}
        <TrustStrip
          scholarships={scholarshipCount}
          funders={funderCount}
          lang="th"
          className="mt-3 text-center"
        />

        <WhyFreeCondensed className="mt-4 pt-4 border-t border-[#E8ECF2] dark:border-[#1A2E4A]" />

        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8] hover:text-[#1B3A6B] dark:hover:text-[#8FB4FF] transition-colors underline"
          style={th}
        >
          แก้ไขข้อมูลของฉัน
        </button>
      </div>
    </div>
  );
}
