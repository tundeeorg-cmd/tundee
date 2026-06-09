'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import LanguageToggle from './LanguageToggle';
import { useLang } from '@/lib/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { translations } from '@/lib/translations';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/profile';
import { useUserProfile } from '@/contexts/UserContext';
import { getDeadlineInfo } from '@/lib/deadline';
import type { User } from '@supabase/supabase-js';

function Avatar({ user, avatarUrl, displayName, size = 32 }: {
  user: User;
  avatarUrl: string | null;
  displayName: string | null;
  size?: number;
}) {
  const initials = getInitials(displayName || user.email || '?');
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={initials}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized={!avatarUrl.startsWith('https://egfcqafrlrhkjnynsiyb') && !avatarUrl.startsWith('https://lh3.google')}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-[#2E6BE6] text-white flex items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}

function ThemeRow({ lang }: { lang: string }) {
  const { theme, setTheme } = useTheme();
  const p = translations.profile;
  const options: Array<{ key: 'light' | 'dark' | 'auto'; label: string }> = [
    { key: 'light', label: p.themeLight[lang as 'th' | 'en'] },
    { key: 'dark',  label: p.themeDark[lang as 'th' | 'en'] },
    { key: 'auto',  label: p.themeAuto[lang as 'th' | 'en'] },
  ];
  return (
    <div className="flex gap-0.5 rounded-lg bg-[#F7F9FC] dark:bg-[#232B3E] p-0.5">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          className={`flex-1 text-xs py-1 rounded-md transition-all ${
            theme === key
              ? 'bg-white dark:bg-[#161B27] text-[#0F1C33] dark:text-[#EEF2FF] shadow-sm font-semibold'
              : 'text-[#4A5568] dark:text-[#8892A4] hover:text-[#0F1C33] dark:hover:text-[#EEF2FF]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Nav() {
  const { lang } = useLang();
  const { avatarUrl, displayName } = useUserProfile();
  const [menuOpen, setMenuOpen]        = useState(false);
  const [dropdownOpen, setDropdown]    = useState(false);
  const [user, setUser]                = useState<User | null>(null);
  const [hasUrgentDeadline, setUrgent] = useState(false);
  const [appCount, setAppCount]        = useState(0);
  const dropdownRef                    = useRef<HTMLDivElement>(null);
  const nav = translations.nav;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) checkUrgentDeadlines(u.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) checkUrgentDeadlines(u.id);
      else setUrgent(false);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkUrgentDeadlines(userId: string) {
    try {
      const supabase = createClient();
      const { data, count } = await supabase
        .from('applications')
        .select('scholarship_id, scholarships(deadline_date)', { count: 'exact' })
        .eq('user_id', userId)
        .in('status', ['started', 'in_progress']);
      if (count !== null) setAppCount(count);
      if (!data) return;
      const hasUrgent = data.some((app) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (app.scholarships as unknown) as { deadline_date: string | null } | null;
        if (!s?.deadline_date) return false;
        return (getDeadlineInfo(s.deadline_date).days ?? 999) <= 7;
      });
      setUrgent(hasUrgent);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!dropdownOpen) return;
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dropdownOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setDropdown(false);
    setMenuOpen(false);
  }

  const links = (
    <>
      <Link href="/" onClick={() => setMenuOpen(false)}
        className="text-[13px] font-medium text-[#4A5568] dark:text-[#8892A4] hover:text-[#2E6BE6] dark:hover:text-[#5B8EF0] transition-colors">
        {nav.home[lang]}
      </Link>
      <Link href="/scholarships" onClick={() => setMenuOpen(false)}
        className="text-[13px] font-medium text-[#4A5568] dark:text-[#8892A4] hover:text-[#2E6BE6] dark:hover:text-[#5B8EF0] transition-colors">
        {nav.search[lang]}
      </Link>
      {user && (
        <Link href="/tracker" onClick={() => setMenuOpen(false)}
          className="relative text-[13px] font-medium text-[#4A5568] dark:text-[#8892A4] hover:text-[#2E6BE6] dark:hover:text-[#5B8EF0] transition-colors">
          {nav.navTracker[lang]}
          {appCount > 0 && (
            <span className="absolute -top-1.5 -right-3.5 min-w-[16px] h-4 bg-[#2E6BE6] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
              {appCount > 9 ? '9+' : appCount}
            </span>
          )}
          {hasUrgentDeadline && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-[#161B27]" />
          )}
        </Link>
      )}
      <Link href="/about" onClick={() => setMenuOpen(false)}
        className="text-[13px] font-medium text-[#4A5568] dark:text-[#8892A4] hover:text-[#2E6BE6] dark:hover:text-[#5B8EF0] transition-colors">
        {nav.about[lang]}
      </Link>
    </>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#161B27]/95 backdrop-blur-md border-b border-[#DDE4EF] dark:border-[#232B3E]">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">

        {/* Wordmark */}
        <Link href="/" className="flex flex-col leading-tight">
          <span
            className="text-xl font-semibold text-[#0F1C33] dark:text-[#EEF2FF]"
            style={{ fontFamily: 'var(--font-display, Cormorant Garamond, Georgia, serif)' }}
          >
            ทุนดี
          </span>
          <span
            className="text-[8px] font-medium text-[#4A5568] dark:text-[#8892A4] tracking-[3px] uppercase"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            TUNDEE
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {links}
          {user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
            <a href="/admin" className="text-xs text-[#8892A4] hover:text-[#2E6BE6] transition-colors">
              Admin
            </a>
          )}
          <LanguageToggle />

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdown(v => !v)}
                className="rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#2E6BE6] focus:ring-offset-2 dark:focus:ring-offset-[#161B27]"
                aria-label="User menu"
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                style={{ width: 36, height: 36 }}
              >
                <Avatar user={user} avatarUrl={avatarUrl} displayName={displayName} size={36} />
              </button>

              {dropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-64 bg-white dark:bg-[#161B27] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] border border-[#DDE4EF] dark:border-[#232B3E] overflow-hidden z-50"
                >
                  <div className="px-4 pt-3 pb-3 flex items-center gap-3 border-b border-[#DDE4EF] dark:border-[#232B3E]">
                    <Avatar user={user} avatarUrl={avatarUrl} displayName={displayName} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F1C33] dark:text-[#EEF2FF] truncate">
                        {displayName || user.email?.split('@')[0] || 'User'}
                      </p>
                      <p className="text-xs text-[#4A5568] dark:text-[#8892A4] truncate">{user.email}</p>
                    </div>
                  </div>
                  <Link href="/profile" role="menuitem" onClick={() => setDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#0F1C33] dark:text-[#EEF2FF] hover:bg-[#F7F9FC] dark:hover:bg-[#232B3E] transition-colors">
                    <span>👤</span> {nav.navProfile[lang]}
                  </Link>
                  <div className="px-4 py-2.5 border-t border-[#DDE4EF] dark:border-[#232B3E]">
                    <p className="text-xs text-[#4A5568] dark:text-[#8892A4] mb-1.5">{nav.navTheme[lang]}</p>
                    <ThemeRow lang={lang} />
                  </div>
                  <div className="border-t border-[#DDE4EF] dark:border-[#232B3E]">
                    <button role="menuitem" onClick={signOut}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-[#2A1A1A] transition-colors">
                      <span>↩</span> {nav.navSignout[lang]}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="text-[13px] font-medium text-[#0F1C33] dark:text-[#EEF2FF] border border-[#DDE4EF] dark:border-[#232B3E] hover:border-[#2E6BE6] hover:text-[#2E6BE6] px-5 py-2 rounded-full transition-colors"
            >
              {nav.login[lang]}
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#0F1C33] dark:text-[#EEF2FF]"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white dark:bg-[#161B27] border-t border-[#DDE4EF] dark:border-[#232B3E] px-6 py-5 flex flex-col gap-4">
          {links}
          <div className="pt-1">
            <LanguageToggle />
          </div>
          {user ? (
            <>
              <div className="border-t border-[#DDE4EF] dark:border-[#232B3E] pt-4 flex items-center gap-3">
                <Avatar user={user} avatarUrl={avatarUrl} displayName={displayName} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0F1C33] dark:text-[#EEF2FF] truncate">
                    {displayName || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-[#4A5568] dark:text-[#8892A4] truncate">{user.email}</p>
                </div>
              </div>
              <Link href="/profile" onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-[#2E6BE6]">
                {nav.navProfile[lang]}
              </Link>
              <div>
                <p className="text-xs text-[#4A5568] dark:text-[#8892A4] mb-1.5">{nav.navTheme[lang]}</p>
                <ThemeRow lang={lang} />
              </div>
              <button onClick={signOut} className="text-sm text-red-500 text-left">
                {nav.navSignout[lang]}
              </button>
            </>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)}
              className="text-sm font-semibold text-white bg-[#2E6BE6] hover:bg-[#1E57CC] px-5 py-2.5 rounded-full transition-colors text-center">
              {nav.login[lang]}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
