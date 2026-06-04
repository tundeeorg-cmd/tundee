'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import LanguageToggle from './LanguageToggle';
import { useLang } from '@/lib/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { translations } from '@/lib/translations';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/profile';
import { useUserProfile } from '@/contexts/UserContext';
import type { User } from '@supabase/supabase-js';

/* ── Avatar circle ─────────────────────────────────────────────────────── */
function Avatar({ user, avatarUrl, displayName, size = 32 }: {
  user: User;
  avatarUrl: string | null;
  displayName: string | null;
  size?: number;
}) {
  const initials = getInitials(displayName || user.email || '?');
  if (avatarUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={avatarUrl}
        alt={initials}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-[#F0A500] text-white flex items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}

/* ── Three-way theme toggle ────────────────────────────────────────────── */
function ThemeRow({ lang }: { lang: string }) {
  const { theme, setTheme } = useTheme();
  const p = translations.profile;
  const options: Array<{ key: 'light' | 'dark' | 'auto'; label: string }> = [
    { key: 'light', label: p.themeLight[lang as 'th' | 'en'] },
    { key: 'dark',  label: p.themeDark[lang as 'th' | 'en'] },
    { key: 'auto',  label: p.themeAuto[lang as 'th' | 'en'] },
  ];
  return (
    <div className="flex gap-0.5 rounded-lg bg-[#F5F5F7] dark:bg-[#3A3A3C] p-0.5">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          className={`flex-1 text-xs py-1 rounded-md transition-all ${
            theme === key
              ? 'bg-white dark:bg-[#1C1C1E] text-[#1D1D1F] dark:text-white shadow-sm font-semibold'
              : 'text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── Main Nav ──────────────────────────────────────────────────────────── */
export default function Nav() {
  const { lang } = useLang();
  const { avatarUrl, displayName } = useUserProfile();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [dropdownOpen, setDropdown]   = useState(false);
  const [user, setUser]               = useState<User | null>(null);
  const dropdownRef                   = useRef<HTMLDivElement>(null);
  const nav = translations.nav;

  /* Load user session */
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* Close dropdown on outside click */
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

  /* Shared nav links */
  const links = (
    <>
      <Link
        href="/"
        onClick={() => setMenuOpen(false)}
        className="text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors text-sm font-medium"
      >
        {nav.home[lang]}
      </Link>
      <Link
        href="/scholarships"
        onClick={() => setMenuOpen(false)}
        className="text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors text-sm font-medium"
      >
        {nav.search[lang]}
      </Link>
      <Link
        href="/about"
        onClick={() => setMenuOpen(false)}
        className="text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors text-sm font-medium"
      >
        {nav.about[lang]}
      </Link>
    </>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-md border-b border-[#E5E5EA] dark:border-[#38383A]">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-xl font-semibold text-[#1D1D1F] dark:text-white" style={{ fontFamily: 'Sarabun, sans-serif' }}>
            ทุนดี
          </span>
          <span className="text-[10px] font-light text-[#6E6E73] dark:text-[#8E8E93] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            TunDee
          </span>
        </Link>

        {/* ── Desktop ──────────────────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-8">
          {links}
          <LanguageToggle />

          {user ? (
            /* Avatar + dropdown */
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdown(v => !v)}
                className="rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#F0A500] focus:ring-offset-2 dark:focus:ring-offset-[#1C1C1E]"
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
                  className="absolute right-0 top-12 w-64 bg-white dark:bg-[#2C2C2E] rounded-[16px] shadow-[0_8px_40px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] border border-[#E5E5EA] dark:border-[#38383A] overflow-hidden z-50"
                >
                  {/* User header */}
                  <div className="px-4 pt-3 pb-3 flex items-center gap-3 border-b border-[#F5F5F7] dark:border-[#38383A]">
                    <Avatar user={user} avatarUrl={avatarUrl} displayName={displayName} size={36} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1D1D1F] dark:text-white truncate">
                        {displayName || user.email?.split('@')[0] || 'User'}
                      </p>
                      <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] truncate">{user.email}</p>
                    </div>
                  </div>

                  {/* Profile link */}
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-[#F5F5F7] dark:hover:bg-[#3A3A3C] transition-colors"
                  >
                    <span>👤</span> {nav.navProfile[lang]}
                  </Link>

                  {/* Theme row */}
                  <div className="px-4 py-2.5 border-t border-[#F5F5F7] dark:border-[#38383A]">
                    <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-1.5">{nav.navTheme[lang]}</p>
                    <ThemeRow lang={lang} />
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-[#F5F5F7] dark:border-[#38383A]">
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-[#3A1C1C] transition-colors"
                    >
                      <span>↩</span> {nav.navSignout[lang]}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="text-sm font-semibold text-white bg-[#F0A500] hover:bg-[#D4920A] px-5 py-2 rounded-full transition-colors"
            >
              {nav.login[lang]}
            </Link>
          )}
        </div>

        {/* ── Mobile hamburger ─────────────────────────────────────────── */}
        <button
          className="md:hidden p-2 text-[#1D1D1F] dark:text-[#F5F5F7]"
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

      {/* ── Mobile menu ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden bg-white dark:bg-[#1C1C1E] border-t border-[#E5E5EA] dark:border-[#38383A] px-6 py-5 flex flex-col gap-4">
          {links}
          <div className="pt-1">
            <LanguageToggle />
          </div>

          {user ? (
            <>
              {/* User info */}
              <div className="border-t border-[#F5F5F7] dark:border-[#3A3A3C] pt-4 flex items-center gap-3">
                <Avatar user={user} avatarUrl={avatarUrl} displayName={displayName} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1D1D1F] dark:text-white truncate">
                    {displayName || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] truncate">{user.email}</p>
                </div>
              </div>

              {/* Profile link */}
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-[#F0A500]"
              >
                {nav.navProfile[lang]}
              </Link>

              {/* Theme */}
              <div>
                <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] mb-1.5">{nav.navTheme[lang]}</p>
                <ThemeRow lang={lang} />
              </div>

              {/* Sign out */}
              <button
                onClick={signOut}
                className="text-sm text-red-500 text-left"
              >
                {nav.navSignout[lang]}
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              onClick={() => setMenuOpen(false)}
              className="text-sm font-semibold text-white bg-[#F0A500] hover:bg-[#D4920A] px-5 py-2.5 rounded-full transition-colors text-center"
            >
              {nav.login[lang]}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
