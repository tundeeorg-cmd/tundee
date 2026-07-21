'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import StudentProfileForm from '@/components/StudentProfileForm';

export default function StudentProfilePage() {
  const { lang } = useLang();
  const router   = useRouter();
  const supabase = createClient();

  const [pageLoading, setPageLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const font = lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif';

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      setEmail(data.user?.email ?? null);
      setPageLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unauthenticated ────────────────────────────────────────────────────────

  if (!pageLoading && !loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] dark:bg-[#07111F] px-4" style={{ fontFamily: font }}>
        <div className="bg-white dark:bg-[#0A1628] border border-[#E5E5EA] dark:border-[#1A2E4A] rounded-[16px] p-10 max-w-sm text-center">
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mb-4">
            {lang === 'th' ? 'กรุณาเข้าสู่ระบบก่อน' : 'Please log in first.'}
          </p>
          <a href="/auth" className="inline-block px-5 py-2 rounded-full text-sm font-semibold text-white bg-[#1B3A6B]">
            {lang === 'th' ? 'เข้าสู่ระบบ' : 'Log in'}
          </a>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#07111F] pb-16" style={{ fontFamily: font }}>
      {/* Header */}
      <div className="bg-white dark:bg-[#0A1628] border-b border-[#E5E5EA] dark:border-[#1A2E4A]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <button onClick={() => router.back()} className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white mb-4 block">
            ← {lang === 'th' ? 'กลับ' : 'Back'}
          </button>
          <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-white">
            {lang === 'th' ? 'โปรไฟล์นักเรียน (งานวิจัย + การจับคู่ทุน)' : 'Student Profile (Research & Matching)'}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-2">
            {lang === 'th'
              ? 'ข้อมูลนี้ช่วยให้เราจับคู่ทุนที่เหมาะกับคุณ และใช้ในการวิจัยความเท่าเทียมในการเข้าถึงทุนการศึกษา ทุกช่องเป็นตัวเลือกเว้นแต่ระบุว่าจำเป็น — ข้อมูลอ่อนไหว (รายได้ เพศ ความพิการ) ไม่บังคับและไม่กระทบการใช้งานพื้นฐาน'
              : 'This data helps us match you to relevant scholarships and supports research on equitable access to scholarships. All fields are optional unless marked required — sensitive fields (income, gender, disability) are never required for basic use.'}
          </p>
          {email && (
            <p className="text-xs text-[#AEAEB2] mt-3">
              {lang === 'th' ? 'เข้าสู่ระบบด้วย' : 'Signed in as'} {email} · <a href="/profile" className="text-[#1B3A6B] dark:text-[#4A7FD4] hover:underline">{lang === 'th' ? 'แก้ไขชื่อ/รูปภาพ' : 'edit name/photo'}</a>
            </p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8">
        <StudentProfileForm />
      </div>
    </div>
  );
}
