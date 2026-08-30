'use client';

/**
 * /auth/reset/confirm — choose the new password.
 *
 * Reached only with a live recovery session: /auth/callback verifies the token
 * from the email and redirects here. Without that session updateUser() fails,
 * which is the point — this is the boundary that stops anyone who knows a
 * student's address from setting a password on their account.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLang } from '@/lib/LanguageContext';

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;
const MIN_PASSWORD_LENGTH = 8;

function ConfirmForm() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { lang } = useLang();

  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [ready,    setReady]    = useState(false);

  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/scholarships';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // The link was already used, or expired. Say so here rather than
        // letting them type a password into a form that cannot save it.
        setError(lang === 'th'
          ? 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง'
          : 'This link has expired or was already used. Please request a new one.');
      }
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(lang === 'th'
        ? `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
        : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error('[TunDee] updateUser(password):', updateError.message);
      setError(lang === 'th'
        ? 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        : 'Could not set your password. Please try again.');
      setBusy(false);
      return;
    }

    // A full navigation, so the destination's server components render with the
    // refreshed session rather than the recovery one.
    window.location.href = next;
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />
          <div className="px-6 py-8">
            <h1 className="text-center text-xl font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-5" style={{ ...THAI, lineHeight: 1.8 }}>
              {lang === 'th' ? 'ตั้งรหัสผ่านของคุณ' : 'Set your password'}
            </h1>

            {error && (
              <p
                role="alert"
                className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-600 dark:text-red-400"
                style={{ ...THAI, lineHeight: 1.8 }}
              >
                {error}
              </p>
            )}

            <form onSubmit={submit}>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={busy || !ready}
                  style={{ ...THAI, fontSize: '16px' }}
                  className="w-full min-h-[56px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl pl-4 pr-16 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1B3A6B] dark:text-[#8FB4FF] px-1 py-2"
                  style={THAI}
                >
                  {showPw ? (lang === 'th' ? 'ซ่อน' : 'Hide') : (lang === 'th' ? 'แสดง' : 'Show')}
                </button>
              </div>
              <p className="mt-1.5 mb-4 text-xs text-[#8A96A8]" style={THAI}>
                {lang === 'th' ? `อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` : `At least ${MIN_PASSWORD_LENGTH} characters`}
              </p>

              <button
                type="submit"
                disabled={busy || !ready}
                className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl font-bold text-base disabled:opacity-50"
                style={THAI}
              >
                {busy
                  ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving…')
                  : (lang === 'th' ? 'บันทึกรหัสผ่าน' : 'Save password')}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/auth/reset" className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>
            {lang === 'th' ? 'ขอลิงก์ใหม่' : 'Request a new link'}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function ResetConfirmPage() {
  return <Suspense fallback={null}><ConfirmForm /></Suspense>;
}
