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

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatUserDate } from '@/lib/formatDate';
import { getDeadlineInfo } from '@/lib/deadline';
import { trackCTAClick, trackPreviewResults } from '@/lib/adTracking';
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

function MatchCard({ card }: { card: PreviewMatchCard }) {
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
}: {
  results: PreviewResponse;
  signupHref: string;
  onReset: () => void;
}) {
  const tracked = useRef(false);

  // Ad-pixel conversion signal: the visitor reached real value before signup.
  // content_ids are the scholarships actually shown, so Meta can build
  // audiences around the specific opportunities that convert.
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackPreviewResults(results.total, results.preview.map(c => c.scholarship_id));

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

  return (
    <div className="text-left">
      <div className="text-center mb-5">
        <h2 className="font-bold text-[#0A2342] dark:text-[#E8EDF5]" style={{ ...th, fontSize: 'clamp(1.15rem, 5vw, 1.4rem)' }}>
          {results.broadened
            ? 'ยังไม่มีทุนที่ตรงเป๊ะ แต่เรามีทุนที่น่าสนใจให้คุณ'
            : `เจอ ${results.total} ทุนที่คุณมีสิทธิ์สมัคร`}
        </h2>
        <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mt-1.5" style={th}>
          {results.broadened
            ? 'ลองดูทุนเหล่านี้ก่อน — หลายทุนผ่อนปรนเรื่องเกรด และมีทุนใหม่เพิ่มเข้ามาทุกสัปดาห์'
            : 'นี่คือตัวอย่างทุนที่ตรงกับคุณมากที่สุด'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {results.preview.map((card) => (
          <MatchCard key={card.scholarship_id} card={card} />
        ))}
      </div>

      {results.lockedCount > 0 && (
        <div className="relative mt-3">
          <div className="flex flex-col gap-3" aria-hidden="true">
            {Array.from({ length: lockedPlaceholders }, (_, i) => <LockedCard key={i} />)}
          </div>

          <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center bg-gradient-to-b from-transparent via-[#F5F7FA]/80 to-[#F5F7FA] dark:via-[#07111F]/80 dark:to-[#07111F]">
            <p className="font-bold text-[#0A2342] dark:text-[#E8EDF5] text-center px-5" style={{ ...th, fontSize: '1rem' }}>
              คุณมีสิทธิ์สมัครทุนอีก {results.lockedCount} ทุน
            </p>
          </div>
        </div>
      )}

      <div className="mt-5">
        <Link
          href={signupHref}
          onClick={() => trackCTAClick('preview_gate')}
          style={th}
          className="block w-full text-center bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white py-4 px-8 rounded-2xl font-bold text-base transition-colors active:opacity-90"
        >
          ดูทุนทั้งหมดของฉัน ฟรี →
        </Link>
        <p className="mt-3 text-center text-xs text-[#8A96A8] dark:text-[#7A8FA8]" style={th}>
          สมัครฟรีเพื่อดูทั้งหมด และรับแจ้งเตือนก่อนหมดเขต
        </p>
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
