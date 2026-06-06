'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function VerifiedPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [countdown, setCountdown] = useState(3);
  const [name,      setName]      = useState('');
  const [lang,      setLang]      = useState<'th' | 'en'>('th');

  useEffect(() => {
    // Language preference
    const saved = localStorage.getItem('tundee_lang') as 'th' | 'en' | null;
    if (saved === 'th' || saved === 'en') setLang(saved);

    // Fetch user display name
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/auth');
        return;
      }

      // Try profile first, fall back to Google display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, gpa')
        .eq('id', user.id)
        .maybeSingle();

      const displayName =
        profile?.full_name ??
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        '';
      setName(displayName);

      // If no profile / no GPA → go to setup after countdown
      const destination =
        !profile || profile.gpa == null ? '/profile/setup' : '/scholarships';

      // 3-second countdown then redirect
      let count = 3;
      const tick = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(tick);
          router.replace(destination);
        }
      }, 1000);

      return () => clearInterval(tick);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111111] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">

        <div className="bg-white dark:bg-[#1D1D1F] rounded-2xl shadow-sm border border-[#e0e0e0] dark:border-[#3a3a3c] overflow-hidden">

          {/* Gold bar */}
          <div className="h-1 bg-[#F0A500]" />

          <div className="px-8 py-12 text-center">

            {/* Checkmark animation */}
            <div className="w-20 h-20 bg-green-50 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              ✅
            </div>

            <h1 className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-2">
              {lang === 'th' ? 'เข้าสู่ระบบสำเร็จ!' : 'You\'re signed in!'}
            </h1>

            {name ? (
              <p className="text-[#6e6e73] dark:text-[#8e8e93] text-base mb-6">
                {lang === 'th' ? `ยินดีต้อนรับ, ${name}` : `Welcome, ${name}`}
              </p>
            ) : (
              <p className="text-[#6e6e73] dark:text-[#8e8e93] text-base mb-6">
                {lang === 'th' ? 'ยินดีต้อนรับสู่ TunDee ทุนดี' : 'Welcome to TunDee'}
              </p>
            )}

            {/* Countdown ring */}
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="w-14 h-14 rounded-full border-4 border-[#F0A500]/20 border-t-[#F0A500] animate-spin" />
              <p className="text-sm text-[#aeaeb2] dark:text-[#6e6e73]">
                {lang === 'th'
                  ? `กำลังพาไปหน้าต่อไป... (${countdown})`
                  : `Redirecting in ${countdown}…`}
              </p>
            </div>

            {/* Manual link */}
            <button
              onClick={() => router.replace('/scholarships')}
              className="text-sm text-[#F0A500] hover:underline"
            >
              {lang === 'th'
                ? 'ไปหน้าทุนการศึกษาเลย →'
                : 'Go to scholarships now →'}
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
