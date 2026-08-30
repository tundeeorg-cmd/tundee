'use client';

/**
 * /auth/reset — request a set-password link.
 *
 * Reached from the "ลืมรหัสผ่าน" link, and it exists for two audiences that
 * look identical from here: people who forgot a password, and the 27 accounts
 * created by the magic-link flow that email + password replaced, who never had
 * one. The copy speaks to both without asserting which they are, because we
 * cannot tell — Supabase does not expose whether a password is set.
 *
 * Most students never see this page: app/api/auth/password sends the same email
 * automatically the moment a sign-in fails.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';

const THAI = { fontFamily: 'Sarabun, sans-serif' } as const;

function ResetForm() {
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [busy, setBusy]   = useState(false);

  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/scholarships';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch('/api/auth/reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), next }),
      });
    } catch {
      // The route answers ok:true regardless; a network failure here should not
      // produce copy that contradicts what the student will find in their inbox.
    }
    // Shown whether or not the address exists. Anything else turns this form
    // into an "is this person a TunDee user?" oracle.
    setSent(true);
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#07111F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="bg-white dark:bg-[#0A1628] rounded-2xl border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden shadow-sm">
          <div className="h-1 bg-[#1B3A6B]" />
          <div className="px-6 py-8">
            <h1 className="text-center text-xl font-bold text-[#0A2342] dark:text-[#E8EDF5] mb-3" style={{ ...THAI, lineHeight: 1.8 }}>
              {lang === 'th' ? 'ตั้งรหัสผ่านใหม่' : 'Set a new password'}
            </h1>

            {sent ? (
              <>
                <p className="text-center text-base text-[#3C4A5A] dark:text-[#aeaeb2] mb-6" style={{ ...THAI, lineHeight: 1.9 }}>
                  {lang === 'th'
                    ? `ถ้ามีบัญชีที่ใช้อีเมล ${email} เราได้ส่งลิงก์ตั้งรหัสผ่านไปให้แล้ว`
                    : `If an account exists for ${email}, we have sent it a link to set a password.`}
                </p>
                <p className="text-center text-sm text-[#6E7A8A] dark:text-[#8e9bb0]" style={{ ...THAI, lineHeight: 1.8 }}>
                  {lang === 'th'
                    ? 'ไม่พบอีเมล? กรุณาตรวจสอบในโฟลเดอร์จดหมายขยะ (Spam)'
                    : "Can't find it? Please check your spam folder."}
                </p>
              </>
            ) : (
              <form onSubmit={submit}>
                <p className="text-sm text-[#6E7A8A] dark:text-[#8e9bb0] mb-5" style={{ ...THAI, lineHeight: 1.9 }}>
                  {lang === 'th'
                    ? 'กรอกอีเมลของคุณ เราจะส่งลิงก์ให้ตั้งรหัสผ่าน ใช้ได้ทั้งกรณีลืมรหัสผ่าน และกรณีที่คุณยังไม่เคยตั้งรหัสผ่านมาก่อน'
                    : 'Enter your email and we will send you a link to set a password — whether you forgot yours or never set one.'}
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                  disabled={busy}
                  style={{ ...THAI, fontSize: '16px' }}
                  className="w-full min-h-[56px] border-2 border-[#E8ECF2] dark:border-[#1A2E4A] rounded-xl px-4 text-[#0A2342] dark:text-[#E8EDF5] bg-white dark:bg-[#0D1F35] placeholder-[#A8B2C0] mb-4"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[56px] bg-[#1B3A6B] text-white rounded-xl font-bold text-base disabled:opacity-50"
                  style={THAI}
                >
                  {busy
                    ? (lang === 'th' ? 'กำลังส่ง...' : 'Sending…')
                    : (lang === 'th' ? 'ส่งลิงก์ตั้งรหัสผ่าน' : 'Send the link')}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/auth" className="text-sm text-[#6e6e73] dark:text-[#8e8e93]" style={THAI}>
            ← {lang === 'th' ? 'กลับไปหน้าเข้าสู่ระบบ' : 'Back to sign in'}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function ResetPage() {
  return <Suspense fallback={null}><ResetForm /></Suspense>;
}
