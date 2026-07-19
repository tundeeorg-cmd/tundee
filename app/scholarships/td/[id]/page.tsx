'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';
import type { TdScholarship } from '@/lib/tdScholarships/types';
import { logFunnelEvent } from '@/lib/research/funnel';

const FUNDER_TYPE_BADGE: Record<string, string> = {
  'Thai University':               'มหาวิทยาลัยไทย',
  'Thai Government / Royal':       'รัฐบาล / ราชการ',
  'Corporate / Bank / Foundation': 'เอกชน / ธนาคาร / มูลนิธิ',
  'International (open to Thais)': 'นานาชาติ (เปิดรับคนไทย)',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div className="flex gap-3 py-3 border-b border-[#F5F5F7] dark:border-[#3A3A3C] last:border-0">
      <span className="w-40 shrink-0 text-sm text-[#6E6E73] dark:text-[#8E8E93]">{label}</span>
      <span className="flex-1 text-sm text-[#1D1D1F] dark:text-white">{value}</span>
    </div>
  );
}

function formatDeadlineDisplay(s: TdScholarship): string {
  if (s.deadline_date) {
    return new Date(s.deadline_date).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }
  if (s.deadline_is_rolling) return 'เปิดรับตลอด / Rolling';
  return s.deadline_note ?? s.deadline_raw ?? '—';
}

export default function TdScholarshipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const supabase = createClient();
  const [scholarship, setScholarship] = useState<TdScholarship | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('td_scholarships')
        .select('scholarship_id, scholarship_name, funder, funder_type, level, field_of_study, award_amount_thb, region_eligibility, targets_low_income, num_recipients, min_gpa, income_cap_thb, language, deadline_raw, status, application_link, deadline_date, deadline_is_rolling, deadline_note, stale')
        .eq('scholarship_id', id)
        .eq('is_displayed', true)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setScholarship(data as TdScholarship);
        // Log view_detail event
        const { data: { user } } = await supabase.auth.getUser();
        logFunnelEvent({ eventType: 'view_detail', scholarshipId: id, userId: user?.id ?? null });
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2E6BE6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !scholarship) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] pt-24 px-6 text-center">
        <p className="text-lg text-[#1D1D1F] dark:text-white mb-4">
          {lang === 'th' ? 'ไม่พบทุนนี้' : 'Scholarship not found'}
        </p>
        <Link href="/scholarships" className="text-sm text-[#2E6BE6] hover:underline">
          {lang === 'th' ? '← กลับ' : '← Back'}
        </Link>
      </div>
    );
  }

  const s = scholarship;
  const deadlineDisplay = formatDeadlineDisplay(s);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#000000] pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-6">

        <div className="mb-6">
          <Link href="/scholarships" className="text-sm text-[#6E6E73] hover:text-[#2E6BE6] transition-colors">
            ← {lang === 'th' ? 'กลับ' : 'Back'}
          </Link>
        </div>

        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#E5E5EA] dark:border-[#1A2E4A] p-6 md:p-8 space-y-6">

          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-white leading-snug"
                  style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}>
                {s.scholarship_name}
              </h1>
              <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {lang === 'th' ? 'เปิดรับ' : 'Open'}
              </span>
            </div>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">
              {s.funder}
              {s.funder_type && (
                <span className="ml-2 text-[11px] font-medium text-[#1B3A6B] dark:text-[#4A7FD4]">
                  · {FUNDER_TYPE_BADGE[s.funder_type] ?? s.funder_type}
                </span>
              )}
            </p>
          </div>

          {/* Award amount */}
          {s.award_amount_thb && (
            <div className="bg-[#EEF3FD] dark:bg-[#162552] rounded-xl px-5 py-4">
              <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-1">
                {lang === 'th' ? 'มูลค่าทุน' : 'Award Amount'}
              </p>
              <p className="text-2xl font-bold text-[#1B3A6B] dark:text-[#4A7FD4]"
                 style={{ fontFamily: 'Lato, sans-serif' }}>
                {s.award_amount_thb}
              </p>
            </div>
          )}

          {/* Details */}
          <div>
            <DetailRow label={lang === 'th' ? 'ระดับการศึกษา' : 'Level'} value={s.level} />
            <DetailRow label={lang === 'th' ? 'สาขาวิชา' : 'Field of Study'} value={s.field_of_study} />
            <DetailRow label={lang === 'th' ? 'ภูมิภาค' : 'Region'} value={s.region_eligibility} />
            <DetailRow label={lang === 'th' ? 'ภาษา' : 'Language'} value={s.language} />
            <DetailRow
              label={lang === 'th' ? 'รายได้น้อย' : 'Low-Income Priority'}
              value={s.targets_low_income ? (lang === 'th' ? 'ใช่' : 'Yes') : null}
            />
            <DetailRow
              label={lang === 'th' ? 'จำนวนผู้รับทุน' : 'No. of Recipients'}
              value={s.num_recipients != null ? s.num_recipients.toLocaleString() : null}
            />
            <DetailRow label={lang === 'th' ? 'เกรดขั้นต่ำ' : 'Min GPA'} value={s.min_gpa != null ? String(s.min_gpa) : null} />
            <DetailRow
              label={lang === 'th' ? 'รายได้สูงสุด (บ./ปี)' : 'Income Cap (THB/yr)'}
              value={s.income_cap_thb != null ? `฿${s.income_cap_thb.toLocaleString()}` : null}
            />
            <DetailRow label={lang === 'th' ? 'วันหมดเขต' : 'Deadline'} value={deadlineDisplay} />
          </div>

          {s.stale && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {lang === 'th'
                ? '⚠️ ข้อมูลนี้อาจไม่เป็นปัจจุบัน กรุณาตรวจสอบจากเว็บไซต์ผู้ให้ทุนอีกครั้ง'
                : '⚠️ This listing may be out of date. Please verify details on the funder\'s website.'}
            </div>
          )}

          {/* Apply CTA */}
          <a
            href={s.application_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#1B3A6B] hover:bg-[#2E5FA3] text-white font-semibold py-3.5 rounded-[10px] text-sm transition-colors"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
          >
            {lang === 'th' ? 'สมัครทุน' : 'Apply for this Scholarship'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <p className="text-xs text-center text-[#ADADB8]">
            {lang === 'th'
              ? 'TunDee ไม่ใช่ตัวแทนของผู้ให้ทุน — กรุณาอ่านเงื่อนไขจากเว็บไซต์ทางการ'
              : 'TunDee is not affiliated with the funder — read official terms on the funder\'s website.'}
          </p>
        </div>
      </div>
    </div>
  );
}
