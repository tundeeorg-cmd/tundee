'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

export default function Footer() {
  const { lang } = useLang();
  const f = translations.footer;
  const nav = translations.nav;

  return (
    <footer className="bg-[#F5F5F7] dark:bg-[#1C1C1E] border-t border-[#E5E5EA] dark:border-[#38383A] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <div className="flex flex-col leading-tight mb-4">
              <span className="text-2xl font-semibold text-[#1D1D1F] dark:text-white" style={{ fontFamily: 'Sarabun, sans-serif' }}>ทุนดี</span>
              <span className="text-xs font-light text-[#6E6E73] dark:text-[#8E8E93] tracking-widest uppercase" style={{ fontFamily: 'DM Sans, sans-serif' }}>TunDee</span>
            </div>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed">{f.tagline[lang]}</p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-4">{f.links_title[lang]}</h4>
            <nav className="flex flex-col gap-3">
              <Link href="/" className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors">{nav.home[lang]}</Link>
              <Link href="/scholarships" className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors">{nav.search[lang]}</Link>
              <Link href="/about" className="text-sm text-[#1D1D1F] dark:text-[#F5F5F7] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors">{nav.about[lang]}</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-widest mb-4">{f.contact_title[lang]}</h4>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">hello@tundee.org</p>
            <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93] mt-2">tundee.org</p>
            <a
              href="https://github.com/jenissavichiansin/tundee"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#6E6E73] dark:text-[#8E8E93] hover:text-[#F0A500] dark:hover:text-[#F0A500] transition-colors mt-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-[#E5E5EA] dark:border-[#38383A] flex flex-col items-center gap-1">
          <p className="text-xs text-[#6E6E73] dark:text-[#8E8E93] text-center">{f.copyright[lang]}</p>
          <p className="text-[11px] text-[#ADADB8] dark:text-[#6E6E73] text-center">{f.updated[lang]}</p>
        </div>
      </div>
    </footer>
  );
}
