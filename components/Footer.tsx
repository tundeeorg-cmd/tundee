'use client';

import Link from 'next/link';
import { useLanguage } from './LanguageToggle';
import { translations } from '@/lib/translations';

export default function Footer() {
  const [lang] = useLanguage();
  const f = translations.footer;
  const nav = translations.nav;

  return (
    <footer className="bg-[#F5F5F7] border-t border-[#E5E5EA] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <div className="flex flex-col leading-tight mb-4">
              <span className="text-2xl font-semibold text-[#1D1D1F]" style={{ fontFamily: 'Sarabun, sans-serif' }}>
                ทุนดี
              </span>
              <span className="text-xs font-light text-[#6E6E73] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                TunDee
              </span>
            </div>
            <p className="text-sm text-[#6E6E73] leading-relaxed">{f.tagline[lang]}</p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">
              {f.links_title[lang]}
            </h4>
            <nav className="flex flex-col gap-3">
              <Link href="/" className="text-sm text-[#1D1D1F] hover:text-[#F0A500] transition-colors">{nav.home[lang]}</Link>
              <Link href="/scholarships" className="text-sm text-[#1D1D1F] hover:text-[#F0A500] transition-colors">{nav.search[lang]}</Link>
              <Link href="/about" className="text-sm text-[#1D1D1F] hover:text-[#F0A500] transition-colors">{nav.about[lang]}</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">Contact</h4>
            <p className="text-sm text-[#6E6E73]">hello@tundee.org</p>
            <p className="text-sm text-[#6E6E73] mt-2">tundee.org</p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-[#E5E5EA]">
          <p className="text-xs text-[#6E6E73] text-center">{f.copyright[lang]}</p>
        </div>
      </div>
    </footer>
  );
}
