'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import type { TdScholarship, TdAwardValueTier } from '@/lib/tdScholarships/types';
import { logFunnelEvent } from '@/lib/research/funnel';
import { getSessionId } from '@/lib/research/session';
import { notifyTrackedCountChanged } from '@/lib/tracker/countBus';
import {
  resolveName, resolveFunder, formatDeadline,
  DEADLINE_COLOR_CLASS, DEADLINE_BADGE_CLASS,
} from '@/lib/tracker/display';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrackStatus = 'interested' | 'applying' | 'applied' | 'awarded' | 'rejected';

interface TrackedRow {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: TrackStatus;
  notes: string | null;
  reminder_opt_in: boolean;
  created_at: string;
  updated_at: string;
  scholarship: TdScholarship;
}

interface Profile {
  line_user_id: string | null;
  line_linked_at: string | null;
}

const LINE_ERROR_MESSAGES: Record<string, { th: string; en: string }> = {
  redirect_uri_not_configured: { th: 'ระบบยังตั้งค่า LINE ไม่ครบ กรุณาติดต่อทีมงาน', en: "LINE isn't fully configured yet — please contact us." },
  not_configured:              { th: 'ระบบยังไม่ได้ตั้งค่า LINE กรุณาติดต่อทีมงาน', en: 'LINE is not configured — please contact us.' },
  state_mismatch:              { th: 'เซสชันหมดอายุ กรุณาลองเชื่อมต่อใหม่', en: 'Your session expired — please try connecting again.' },
  access_denied:                { th: 'คุณยกเลิกการเชื่อมต่อ LINE', en: 'LINE connection was cancelled.' },
  no_code:                      { th: 'คุณยกเลิกการเชื่อมต่อ LINE', en: 'LINE connection was cancelled.' },
  token_exchange:               { th: 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่', en: "Couldn't complete the LINE connection — please try again." },
  verify_failed:                { th: 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่', en: "Couldn't complete the LINE connection — please try again." },
  db_error:                     { th: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่', en: "Couldn't save your LINE connection — please try again." },
};

const STATUS_CONFIG: Record<TrackStatus, { th: string; en: string; color: string; bg: string }> = {
  interested: { th: 'สนใจ',       en: 'Interested',  color: 'text-blue-700 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
  applying:   { th: 'กำลังสมัคร', en: 'Applying',    color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  applied:    { th: 'ส่งใบแล้ว',  en: 'Applied',     color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  awarded:    { th: 'ได้รับทุน',  en: 'Awarded',     color: 'text-green-700 dark:text-green-300',  bg: 'bg-green-50 dark:bg-green-900/20' },
  rejected:   { th: 'ไม่ผ่าน',   en: 'Not selected', color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-800/40' },
};

const GROUP_ORDER: TrackStatus[] = ['interested', 'applying', 'applied', 'awarded', 'rejected'];

const GROUP_LABELS: Record<TrackStatus, { th: string; en: string }> = {
  interested: { th: 'สนใจ / บันทึกไว้', en: 'Interested / Saved' },
  applying:   { th: 'กำลังสมัคร',      en: 'Applying' },
  applied:    { th: 'ส่งใบแล้ว',        en: 'Applied' },
  awarded:    { th: 'ได้รับทุน',        en: 'Awarded' },
  rejected:   { th: 'ไม่ผ่าน',         en: 'Not selected' },
};

const AWARD_TIER_LABEL: Record<TdAwardValueTier, { th: string; en: string; color: string }> = {
  full_ride:    { th: 'ทุนเต็มจำนวน',        en: 'Full-ride',         color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800' },
  full_tuition: { th: 'ค่าเล่าเรียนเต็มจำนวน', en: 'Full-tuition',      color: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-800' },
  large:        { th: 'ทุนขนาดใหญ่ (≥100k)',  en: 'Large (≥100k ฿)',   color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800' },
  medium:       { th: 'ทุนขนาดกลาง (20k–100k)', en: 'Medium (20k–100k)', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800' },
  small:        { th: 'ทุนขนาดเล็ก (<20k)',   en: 'Small (<20k ฿)',    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300' },
  stipend_only: { th: 'ค่าครองชีพ/เบี้ยเลี้ยง', en: 'Stipend only',     color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

const FUNDER_TYPE_LABEL: Record<string, { th: string; en: string }> = {
  'Thai University':               { th: 'มหาวิทยาลัย',   en: 'University' },
  'Thai Government / Royal':       { th: 'รัฐบาล/ราชการ', en: 'Government' },
  'Corporate / Bank / Foundation': { th: 'เอกชน/มูลนิธิ', en: 'Corporate' },
  'International (open to Thais)': { th: 'นานาชาติ',       en: 'International' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-full" />
    </div>
  );
}

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" aria-live="polite" className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
      {msg}
    </div>
  );
}

function ApplyPrompt({ name, lang, onYes, onNo }: { name: string; lang: string; onYes: () => void; onNo: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-live="polite"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 z-50 bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] shadow-xl p-4 flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#1D1D1F] dark:text-white line-clamp-2">{name}</p>
        <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5">
          {lang === 'th' ? 'ทำเครื่องหมายว่า "ส่งใบแล้ว" หรือไม่?' : 'Mark this as "Applied"?'}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onNo}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors"
        >
          {lang === 'th' ? 'ไม่ใช่ตอนนี้' : 'Not now'}
        </button>
        <button
          onClick={onYes}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white font-semibold transition-colors"
        >
          {lang === 'th' ? 'ใช่' : 'Yes'}
        </button>
      </div>
    </div>
  );
}

// ─── LINE Connect Section ─────────────────────────────────────────────────────

function LineSection({ profile, lang, onUnlink }: { profile: Profile | null; lang: string; onUnlink: () => void }) {
  const linked = !!profile?.line_user_id;

  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* LINE logo */}
          <div className="w-10 h-10 rounded-full bg-[#00B900] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" aria-hidden>
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] dark:text-white">
              {lang === 'th' ? 'แจ้งเตือนผ่าน LINE' : 'LINE Reminders'}
            </p>
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
              {linked
                ? (lang === 'th' ? 'เชื่อมต่อแล้ว — จะส่งแจ้งเตือน 14 และ 1 วันก่อนหมดเขต' : 'Connected — reminders sent 14 and 1 day before deadline')
                : (lang === 'th' ? 'เชื่อมต่อ LINE เพื่อรับแจ้งเตือนก่อนหมดเขตสมัคร' : 'Connect LINE to receive deadline reminders')}
            </p>
          </div>
        </div>
        {linked ? (
          <button
            onClick={onUnlink}
            className="text-xs text-red-500 hover:text-red-600 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            {lang === 'th' ? 'ยกเลิกการเชื่อมต่อ' : 'Disconnect'}
          </button>
        ) : (
          <a
            href="/api/line/connect"
            className="text-xs font-semibold text-white bg-[#00B900] hover:bg-[#009900] rounded-lg px-3 py-1.5 transition-colors"
          >
            {lang === 'th' ? 'เชื่อมต่อ LINE' : 'Connect LINE'}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Tracked Scholarship Card ─────────────────────────────────────────────────

interface TrackedCardProps {
  row: TrackedRow;
  lang: string;
  onStatusChange: (id: string, status: TrackStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
  onReminderToggle: (id: string, val: boolean) => void;
  onUntrack: (id: string) => void;
  onApplyClick: (row: TrackedRow) => void;
  onReportOutcome: (scholarshipId: string, name: string) => void;
}

function TrackedCard({
  row, lang,
  onStatusChange, onNotesChange, onReminderToggle, onUntrack, onApplyClick, onReportOutcome,
}: TrackedCardProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft]       = useState(row.notes ?? '');
  const s = row.scholarship;
  const name = resolveName(s, lang);
  const funder = resolveFunder(s, lang);
  const tier = s.award_value_tier ? AWARD_TIER_LABEL[s.award_value_tier] : null;
  const funderType = s.funder_type ? FUNDER_TYPE_LABEL[s.funder_type] : null;
  const deadline = formatDeadline(s, lang);
  const cfg = STATUS_CONFIG[row.status];
  const applyUrl = s.application_url || s.application_link;

  function saveNotes() {
    setEditingNotes(false);
    if (noteDraft !== (row.notes ?? '')) onNotesChange(row.id, noteDraft);
  }

  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 flex flex-col gap-3">
      {/* Name + funder */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {tier && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${tier.color}`}>
              {lang === 'th' ? tier.th : tier.en}
            </span>
          )}
          {funderType && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F5F7FA] text-[#6E6E73] dark:bg-[#0D1F35] dark:text-[#8E8E93]">
              {lang === 'th' ? funderType.th : funderType.en}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
          {name}
        </h3>
        {funder && <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5 truncate">{funder}</p>}
      </div>

      {/* Deadline */}
      <div className={`flex items-center gap-1.5 text-xs font-medium ${DEADLINE_COLOR_CLASS[deadline.color]}`}>
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{deadline.text}</span>
        {deadline.daysLabel && (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${DEADLINE_BADGE_CLASS[deadline.color]}`}>
            {deadline.daysLabel}
          </span>
        )}
      </div>

      {/* Status selector */}
      <div className="flex items-center gap-2">
        <label htmlFor={`status-${row.id}`} className="text-xs text-[#6E6E73] dark:text-[#8E8E93] shrink-0">
          {lang === 'th' ? 'สถานะ:' : 'Status:'}
        </label>
        <select
          id={`status-${row.id}`}
          value={row.status}
          onChange={e => onStatusChange(row.id, e.target.value as TrackStatus)}
          className={`text-xs rounded-md px-2 py-1 border-0 font-medium ${cfg.color} ${cfg.bg} cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]`}
        >
          {(Object.keys(STATUS_CONFIG) as TrackStatus[]).map(k => (
            <option key={k} value={k}>
              {lang === 'th' ? STATUS_CONFIG[k].th : STATUS_CONFIG[k].en}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      {editingNotes ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`notes-${row.id}`} className="sr-only">
            {lang === 'th' ? 'บันทึกส่วนตัว' : 'Personal notes'}
          </label>
          <textarea
            id={`notes-${row.id}`}
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            rows={2}
            className="text-xs w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-transparent px-2 py-1.5 text-[#1D1D1F] dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
            placeholder={lang === 'th' ? 'บันทึกส่วนตัว...' : 'Personal notes...'}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingNotes(false)} className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
              {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
            <button onClick={saveNotes} className="text-xs font-medium text-[#1B3A6B] dark:text-[#4A7FD4]">
              {lang === 'th' ? 'บันทึก' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingNotes(true)}
          className="text-left text-xs text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1D1D1F] dark:hover:text-white transition-colors"
        >
          {row.notes ? row.notes : (lang === 'th' ? '+ เพิ่มบันทึก' : '+ Add notes')}
        </button>
      )}

      {/* Reminder toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={row.reminder_opt_in}
          onChange={e => onReminderToggle(row.id, e.target.checked)}
          className="rounded focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
        />
        <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
          {lang === 'th' ? 'แจ้งเตือน LINE ก่อนหมดเขต' : 'LINE deadline reminder'}
        </span>
      </label>

      {/* Details link */}
      <Link
        href={`/scholarships/td/${s.scholarship_id}`}
        className="text-xs font-medium text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline w-fit"
      >
        {lang === 'th' ? 'ดูรายละเอียด →' : 'View details →'}
      </Link>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        {applyUrl && (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onApplyClick(row)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white text-xs font-semibold px-3 py-2 rounded-[8px] transition-colors"
            aria-label={lang === 'th' ? `สมัครทุน ${name} (เปิดในแท็บใหม่)` : `Apply for ${name} (opens in new tab)`}
          >
            {lang === 'th' ? 'สมัครทุน' : 'Apply'}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
        {['applying', 'applied'].includes(row.status) && (
          <button
            onClick={() => onReportOutcome(row.scholarship_id, name)}
            className="px-3 py-2 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[8px] text-xs text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#1B3A6B] hover:border-[#1B3A6B] transition-colors"
          >
            {lang === 'th' ? 'รายงานผล' : 'Report'}
          </button>
        )}
        <button
          onClick={() => onUntrack(row.id)}
          className="px-3 py-2 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[8px] text-xs text-[#6E6E73] dark:text-[#8E8E93] hover:text-red-500 hover:border-red-300 transition-colors"
          aria-label={lang === 'th' ? `เลิกติดตาม ${name}` : `Untrack ${name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const { lang } = useLang();
  const supabase = createClient();

  const [loading,  setLoading]  = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [rows,     setRows]     = useState<TrackedRow[]>([]);
  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);
  const [lineMsg,  setLineMsg]  = useState<string | null>(null);
  const [selfReport, setSelfReport] = useState<{ scholarshipId: string; name: string } | null>(null);
  const [srOutcome,  setSrOutcome]  = useState('');
  const [srDate,     setSrDate]     = useState('');
  const [srNotes,    setSrNotes]    = useState('');
  const [srSaving,   setSrSaving]   = useState(false);
  const [applyPrompt, setApplyPrompt] = useState<{ id: string; name: string } | null>(null);

  const fontFamily = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  // ── Handle LINE callback params ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('line_connected') === '1') {
      setLineMsg(lang === 'th' ? 'เชื่อมต่อ LINE สำเร็จ!' : 'LINE connected successfully!');
      window.history.replaceState({}, '', '/tracker');
    } else if (p.get('line_error')) {
      const code = p.get('line_error')!;
      const msg = LINE_ERROR_MESSAGES[code] ?? { th: 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่', en: 'LINE connection failed — please try again.' };
      setLineMsg(lang === 'th' ? msg.th : msg.en);
      window.history.replaceState({}, '', '/tracker');
    }
  }, [lang]);

  const fetchAll = useCallback(async (userId: string) => {
    const [{ data: tracked }, { data: prof }] = await Promise.all([
      supabase
        .from('tracked_scholarship')
        .select(`
          id, user_id, scholarship_id, status, notes, reminder_opt_in, created_at, updated_at,
          scholarship:td_scholarships(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('line_user_id, line_linked_at')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    setRows((tracked ?? []) as unknown as TrackedRow[]);
    setProfile(prof as Profile | null);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setLoggedIn(true);
        await fetchAll(session.user.id);
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return;
      if (session?.user) { setLoggedIn(true); await fetchAll(session.user.id); }
      else { setLoggedIn(false); setRows([]); }
      setLoading(false);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [fetchAll, supabase.auth]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, status: TrackStatus) {
    const row = rows.find(r => r.id === id);
    const prev = row?.status;
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await fetch(`/api/tracker/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    // Log status_change event
    const { data: { user } } = await supabase.auth.getUser();
    if (user && row) {
      logFunnelEvent({
        eventType: 'status_change',
        scholarshipId: row.scholarship_id,
        userId: user.id,
        context: { from: prev, to: status },
      });
    }
  }

  async function handleNotesChange(id: string, notes: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, notes } : r));
    await fetch(`/api/tracker/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
  }

  async function handleReminderToggle(id: string, val: boolean) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, reminder_opt_in: val } : r));
    await fetch(`/api/tracker/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminder_opt_in: val }) });
  }

  async function handleUntrack(id: string) {
    const row = rows.find(r => r.id === id);
    setRows(prev => prev.filter(r => r.id !== id));
    await fetch(`/api/tracker/${id}`, { method: 'DELETE' });
    const { data: { user } } = await supabase.auth.getUser();
    if (user && row) {
      logFunnelEvent({ eventType: 'track_remove', scholarshipId: row.scholarship_id, userId: user.id });
    }
    notifyTrackedCountChanged();
    setToast(lang === 'th' ? 'ลบออกจากรายการติดตามแล้ว' : 'Removed from tracker');
  }

  async function handleApplyClick(row: TrackedRow) {
    fetch('/api/apply-click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scholarship_id: row.scholarship_id }) });
    const { data: { user } } = await supabase.auth.getUser();
    logFunnelEvent({ eventType: 'click_apply', scholarshipId: row.scholarship_id, userId: user?.id ?? null });
    if (!['applied', 'awarded', 'rejected'].includes(row.status)) {
      setApplyPrompt({ id: row.id, name: resolveName(row.scholarship, lang) });
    }
  }

  async function handleSelfReport(e: React.FormEvent) {
    e.preventDefault();
    if (!selfReport || !srOutcome) return;
    setSrSaving(true);
    const res = await fetch('/api/self-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scholarship_id: selfReport.scholarshipId,
        outcome:        srOutcome,
        outcome_date:   srDate || null,
        notes:          srNotes || null,
        session_id:     getSessionId(),
      }),
    });
    setSrSaving(false);
    if (res.ok) {
      setSelfReport(null); setSrOutcome(''); setSrDate(''); setSrNotes('');
      // Refresh rows to reflect updated status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await fetchAll(user.id);
      setToast(lang === 'th' ? 'บันทึกผลลัพธ์แล้ว' : 'Outcome recorded');
    }
  }

  async function handleUnlink() {
    const res = await fetch('/api/line/unlink', { method: 'POST' });
    if (res.ok) {
      setProfile(p => p ? { ...p, line_user_id: null, line_linked_at: null } : null);
      setToast(lang === 'th' ? 'ยกเลิกการเชื่อมต่อ LINE แล้ว' : 'LINE disconnected');
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen" style={{ fontFamily }}>
        <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
          <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64 animate-pulse" />
          </div>
        </div>
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────

  if (!loggedIn) {
    return (
      <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen flex items-center justify-center px-4" style={{ fontFamily }}>
        <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-10 max-w-sm w-full text-center shadow-sm">
          <svg className="w-12 h-12 text-[#8A96A8] mx-auto mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-white mb-2">
            {lang === 'th' ? 'ต้องเข้าสู่ระบบก่อน' : 'Login required'}
          </h2>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-6">
            {lang === 'th' ? 'กรุณาเข้าสู่ระบบเพื่อติดตามทุนการศึกษา' : 'Please log in to track scholarships.'}
          </p>
          <Link href="/auth" className="inline-block px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-[#2E6BE6] hover:bg-[#1E57CC] transition-colors">
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
          </Link>
        </div>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  const grouped = GROUP_ORDER.map(status => ({
    status,
    items: rows.filter(r => r.status === status),
  })).filter(g => g.items.length > 0);

  return (
    <div className="bg-[#F5F7FA] dark:bg-[#07111F] min-h-screen" style={{ fontFamily }}>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      {applyPrompt && (
        <ApplyPrompt
          name={applyPrompt.name}
          lang={lang}
          onNo={() => setApplyPrompt(null)}
          onYes={() => { handleStatusChange(applyPrompt.id, 'applied'); setApplyPrompt(null); }}
        />
      )}

      {/* Header */}
      <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">
              {lang === 'th' ? 'ทุนที่ติดตาม' : 'My Tracked Scholarships'}
            </h1>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-1">
              {lang === 'th'
                ? `${rows.length} ทุน`
                : `${rows.length} scholarship${rows.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Link
            href="/scholarships"
            className="text-sm font-medium text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline"
          >
            {lang === 'th' ? '+ เพิ่มทุน' : '+ Browse scholarships'}
          </Link>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
        {/* LINE message banner */}
        {lineMsg && (
          <div role="status" className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm flex items-center justify-between">
            {lineMsg}
            <button onClick={() => setLineMsg(null)} aria-label={lang === 'th' ? 'ปิด' : 'Dismiss'} className="ml-4 text-green-600 hover:text-green-800">✕</button>
          </div>
        )}

        {/* LINE connect */}
        <LineSection profile={profile} lang={lang} onUnlink={handleUnlink} />

        {/* Empty state */}
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4" aria-hidden>🔖</div>
            <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2">
              {lang === 'th' ? 'ยังไม่มีทุนที่ติดตาม' : 'No tracked scholarships yet'}
            </h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-6">
              {lang === 'th' ? 'กดปุ่ม "บันทึก" บนหน้าทุนการศึกษาเพื่อเพิ่มที่นี่' : 'Press "Track" on any scholarship card to add it here.'}
            </p>
            <Link href="/scholarships" className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] transition-colors">
              {lang === 'th' ? 'ค้นหาทุนการศึกษา' : 'Browse scholarships'}
            </Link>
          </div>
        )}

        {/* Grouped sections */}
        {grouped.map(({ status, items }) => (
          <div key={status} className="mb-8">
            <h2 className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
                {lang === 'th' ? GROUP_LABELS[status].th : GROUP_LABELS[status].en}
              </span>
              <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">({items.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(row => (
                <TrackedCard
                  key={row.id}
                  row={row}
                  lang={lang}
                  onStatusChange={handleStatusChange}
                  onNotesChange={handleNotesChange}
                  onReminderToggle={handleReminderToggle}
                  onUntrack={handleUntrack}
                  onApplyClick={handleApplyClick}
                  onReportOutcome={(sid, name) => { setSelfReport({ scholarshipId: sid, name }); setSrOutcome(''); setSrDate(''); setSrNotes(''); }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Self-report outcome modal ──────────────────────────────────────── */}
      {selfReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelfReport(null)}>
          <form
            onSubmit={handleSelfReport}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-6 max-w-sm w-full shadow-xl"
          >
            <h3 className="text-base font-semibold text-[#1D1D1F] dark:text-white mb-1">
              {lang === 'th' ? 'รายงานผลการสมัคร' : 'Report outcome'}
              {lang === 'th' ? ' — ได้รับทุนหรือไม่?' : ' — awarded or not?'}
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-4 line-clamp-2">{selfReport.name}</p>

            <div className="space-y-3">
              <div>
                <label htmlFor="sr-outcome" className="text-xs font-medium text-[#1D1D1F] dark:text-white block mb-1">
                  {lang === 'th' ? 'ผลลัพธ์' : 'Outcome'} *
                </label>
                <select id="sr-outcome" required value={srOutcome} onChange={e => setSrOutcome(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] text-sm text-[#1D1D1F] dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
                  <option value="">{lang === 'th' ? '-- เลือก --' : '-- Select --'}</option>
                  <option value="applied">{lang === 'th' ? 'ส่งใบสมัครแล้ว' : 'Applied'}</option>
                  <option value="awarded">{lang === 'th' ? 'ได้รับทุน' : 'Awarded'}</option>
                  <option value="rejected">{lang === 'th' ? 'ไม่ผ่านการคัดเลือก' : 'Not selected'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="sr-date" className="text-xs font-medium text-[#1D1D1F] dark:text-white block mb-1">
                  {lang === 'th' ? 'วันที่ (ไม่บังคับ)' : 'Date (optional)'}
                </label>
                <input id="sr-date" type="date" value={srDate} onChange={e => setSrDate(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] text-sm text-[#1D1D1F] dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div>
                <label htmlFor="sr-notes" className="text-xs font-medium text-[#1D1D1F] dark:text-white block mb-1">
                  {lang === 'th' ? 'บันทึก (ไม่บังคับ)' : 'Notes (optional)'}
                </label>
                <textarea id="sr-notes" value={srNotes} onChange={e => setSrNotes(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-white dark:bg-[#0A1628] text-sm text-[#1D1D1F] dark:text-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setSelfReport(null)}
                className="flex-1 py-2 text-sm text-[#6E6E73] dark:text-[#8E8E93] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-lg">
                {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button type="submit" disabled={srSaving || !srOutcome}
                className="flex-1 py-2 text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] rounded-lg disabled:opacity-50 transition-colors">
                {srSaving ? '...' : (lang === 'th' ? 'บันทึก' : 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
