'use client';

import Link from 'next/link';
import { useState } from 'react';
import LanguageToggle, { useLanguage } from './LanguageToggle';
import { translations } from '@/lib/translations';
import type { Language } from '@/lib/types';

function NavLinks({ lang, onClick }: { lang: Language; onClick?: () => void }) {
  const nav = translations.nav;
  return (
    <>
      <Link
        href="/"
        onClick={onClick}
        className="text-[#1D1D1F] hover:text-[#F0A500] transition-colors duration-200 text-sm font-medium"
      >
        {nav.home[lang]}
      </Link>
      <Link
        href="/scholarships"
        onClick={onClick}
        className="text-[#1D1D1F] hover:text-[#F0A500] transition-colors duration-200 text-sm font-medium"
      >
        {nav.search[lang]}
      </Link>
      <Link
        href="/about"
        onClick={onClick}
        className="text-[#1D1D1F] hover:text-[#F0A500] transition-colors duration-200 text-sm font-medium"
      >
        {nav.about[lang]}
      </Link>
    </>
  );
}

export default function Nav() {
  const [lang, setLang] = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E5E5EA]">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-xl font-semibold text-[#1D1D1F]" style={{ fontFamily: 'Sarabun, sans-serif' }}>
            ทุนดี
          </span>
          <span className="text-[10px] font-light text-[#6E6E73] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            TunDee
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          <NavLinks lang={lang} />
          <LanguageToggle lang={lang} onChange={setLang} />
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-[#1D1D1F]"
          onClick={() => setMenuOpen(!menuOpen)}
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
        <div className="md:hidden bg-white border-t border-[#E5E5EA] px-6 py-6 flex flex-col gap-5">
          <NavLinks lang={lang} onClick={() => setMenuOpen(false)} />
          <div className="pt-2">
            <LanguageToggle lang={lang} onChange={setLang} />
          </div>
        </div>
      )}
    </nav>
  );
}
