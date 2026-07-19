'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import type { TdScholarship } from '@/lib/tdScholarships/types';

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

const STATUS_CONFIG: Record<TrackStatus, { th: string; en: string; color: string; bg: string }> = {
  interested: { th: 'สนใจ',       en: 'Interested',  color: 'text-blue-700 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
  applying:   { th: 'กำลังสมัคร', en: 'Applying',    color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  applied:    { th: 'ส่งใบแล้ว',  en: 'Applied',     color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  awarded:    { th: 'ได้รับทุน',  en: 'Awarded',     color: 'text-green-700 dark:text-green-300',  bg: 'bg-green-50 dark:bg-green-900/20' },
  rejected:   { th: 'ไม่ผ่าน',   en: 'Not selected', color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-800/40' },
};

const GROUP_ORDER: TrackStatus[] = ['applying', 'interested', 'applied', 'awarded', 'rejected'];

const GROUP_LABELS: Record<TrackStatus, { th: string; en: string }> = {
  applying:   { th: 'กำลังสมัคร',      en: 'Applying' },
  interested: { th: 'สนใจ / บันทึกไว้', en: 'Interested / Saved' },
  applied:    { th: 'ส่งใบแล้ว',        en: 'Applied' },
  awarded:    { th: 'ได้รับทุน',        en: 'Awarded' },
  rejected:   { th: 'ไม่ผ่าน',         en: 'Not selected' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(s: TdScholarship, lang: string): { text: string; urgent: boolean } {
  if (s.deadline_date) {
    const d = new Date(s.deadline_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
    const dateStr = d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    if (days === 0) return { text: lang === 'th' ? 'หมดเขตวันนี้!' : 'Closes today!', urgent: true };
    if (days < 0)  return { text: lang === 'th' ? 'หมดเขตแล้ว' : 'Expired', urgent: false };
    if (days <= 14) return { text: lang === 'th' ? `เหลือ ${days} วัน (${dateStr})` : `${days} days left (${dateStr})`, urgent: true };
    return { text: dateStr, urgent: false };
  }
  if (s.deadline_is_rolling) return { text: lang === 'th' ? 'เปิดรับตลอด' : 'Rolling', urgent: false };
  if (s.deadline_note) return { text: s.deadline_note, urgent: false };
  return { text: lang === 'th' ? 'ดูเว็บไซต์' : 'See website', urgent: false };
}

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
    <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
      {msg}
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
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
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
  onApplyClick: (scholarshipId: string, link: string) => void;
}

function TrackedCard({
  row, lang,
  onStatusChange, onNotesChange, onReminderToggle, onUntrack, onApplyClick,
}: TrackedCardProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft]       = useState(row.notes ?? '');
  const s = row.scholarship;
  const deadline = formatDeadline(s, lang);
  const cfg = STATUS_CONFIG[row.status];

  function saveNotes() {
    setEditingNotes(false);
    if (noteDraft !== (row.notes ?? '')) onNotesChange(row.id, noteDraft);
  }

  return (
    <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[12px] p-5 flex flex-col gap-3">
      {/* Name + funder */}
      <div>
        <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug line-clamp-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
          {s.scholarship_name}
        </h3>
        <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mt-0.5 truncate">{s.funder}</p>
      </div>

      {/* Deadline */}
      <div className={`flex items-center gap-1.5 text-xs font-medium ${deadline.urgent ? 'text-orange-600 dark:text-orange-400' : 'text-[#6E6E73] dark:text-[#8E8E93]'}`}>
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {deadline.text}
      </div>

      {/* Status selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93] shrink-0">
          {lang === 'th' ? 'สถานะ:' : 'Status:'}
        </span>
        <select
          value={row.status}
          onChange={e => onStatusChange(row.id, e.target.value as TrackStatus)}
          className={`text-xs rounded-md px-2 py-1 border-0 font-medium ${cfg.color} ${cfg.bg} cursor-pointer`}
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
          <textarea
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            rows={2}
            className="text-xs w-full rounded-lg border border-[#E5E5EA] dark:border-[#1A2E4A] bg-transparent px-2 py-1.5 text-[#1D1D1F] dark:text-white resize-none"
            placeholder={lang === 'th' ? 'บันทึกส่วนตัว...' : 'Personal notes...'}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingNotes(false)} className="text-xs text-[#6E6E73]">
              {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
            </button>
            <button onClick={saveNotes} className="text-xs font-medium text-[#1B3A6B]">
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
          className="rounded"
        />
        <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">
          {lang === 'th' ? 'แจ้งเตือน LINE ก่อนหมดเขต' : 'LINE deadline reminder'}
        </span>
      </label>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <a
          href={s.application_link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onApplyClick(s.scholarship_id, s.application_link)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white text-xs font-semibold px-3 py-2 rounded-[8px] transition-colors"
        >
          {lang === 'th' ? 'สมัครทุน' : 'Apply'}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <button
          onClick={() => onUntrack(row.id)}
          className="px-3 py-2 border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[8px] text-xs text-[#6E6E73] hover:text-red-500 hover:border-red-300 transition-colors"
          title={lang === 'th' ? 'เลิกติดตาม' : 'Untrack'}
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

  const fontFamily = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  // ── Handle LINE callback params ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('line_connected') === '1') {
      setLineMsg(lang === 'th' ? 'เชื่อมต่อ LINE สำเร็จ!' : 'LINE connected successfully!');
      window.history.replaceState({}, '', '/tracker');
    } else if (p.get('line_error')) {
      setLineMsg(lang === 'th' ? 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่' : `LINE connection error: ${p.get('line_error')}`);
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
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await fetch(`/api/tracker/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
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
    setRows(prev => prev.filter(r => r.id !== id));
    await fetch(`/api/tracker/${id}`, { method: 'DELETE' });
    setToast(lang === 'th' ? 'ลบออกจากรายการติดตามแล้ว' : 'Removed from tracker');
  }

  async function handleApplyClick(scholarshipId: string, link: string) {
    fetch('/api/apply-click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scholarship_id: scholarshipId }) });
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
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm flex items-center justify-between">
            {lineMsg}
            <button onClick={() => setLineMsg(null)} className="ml-4 text-green-600 hover:text-green-800">✕</button>
          </div>
        )}

        {/* LINE connect */}
        <LineSection profile={profile} lang={lang} onUnlink={handleUnlink} />

        {/* Empty state */}
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🔖</div>
            <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-2">
              {lang === 'th' ? 'ยังไม่มีทุนที่ติดตาม' : 'No tracked scholarships yet'}
            </h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-6">
              {lang === 'th' ? 'กดปุ่ม "Track" บนหน้าทุนการศึกษาเพื่อเพิ่มที่นี่' : 'Press "Track" on any scholarship card to add it here.'}
            </p>
            <Link href="/scholarships" className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-[#1B3A6B] hover:bg-[#2E5FA3] transition-colors">
              {lang === 'th' ? 'ค้นหาทุนการศึกษา' : 'Browse scholarships'}
            </Link>
          </div>
        )}

        {/* Grouped sections */}
        {grouped.map(({ status, items }) => (
          <div key={status} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider">
                {lang === 'th' ? GROUP_LABELS[status].th : GROUP_LABELS[status].en}
              </p>
              <span className="text-xs text-[#6E6E73] dark:text-[#8E8E93]">({items.length})</span>
            </div>
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
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
