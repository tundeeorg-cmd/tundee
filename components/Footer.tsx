'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

export default function Footer() {
  const { lang } = useLang();
  const f = translations.footer;
  const nav = translations.nav;

  return (
    <footer className="bg-[#0F1C33] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <div className="mb-3">
              <span
                className="text-2xl font-light text-white block"
                style={{ fontFamily: 'var(--font-display, Cormorant Garamond, Georgia, serif)' }}
              >
                ทุนดี
              </span>
              <span
                className="text-[8px] font-medium text-[#8892A4] tracking-[3px] uppercase"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                TUNDEE
              </span>
            </div>
            <p
              className="text-sm text-[#8892A4] leading-relaxed"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'Inter, system-ui, sans-serif' }}
            >
              {f.tagline[lang]}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#4A5568] uppercase tracking-[2px] mb-4"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {f.links_title[lang]}
            </h4>
            <nav className="flex flex-col gap-2.5">
              <Link href="/" className="text-sm text-[#8892A4] hover:text-[#EEF2FF] transition-colors">{nav.home[lang]}</Link>
              <Link href="/scholarships" className="text-sm text-[#8892A4] hover:text-[#EEF2FF] transition-colors">{nav.search[lang]}</Link>
              <Link href="/about" className="text-sm text-[#8892A4] hover:text-[#EEF2FF] transition-colors">{nav.about[lang]}</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#4A5568] uppercase tracking-[2px] mb-4"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {f.contact_title[lang]}
            </h4>
            <a href="mailto:hello@tundee.org" className="text-sm text-[#5B8EF0] hover:text-[#EEF2FF] transition-colors block mb-1.5">
              hello@tundee.org
            </a>
            <p className="text-sm text-[#8892A4]">tundee.org</p>
            <a
              href="https://github.com/tundeeorg-cmd/tundee"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#8892A4] hover:text-[#EEF2FF] transition-colors mt-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </a>
          </div>
        </div>

        <div className="pt-8 border-t border-[#232B3E] flex flex-col items-center gap-1">
          <p className="text-xs text-[#4A5568] text-center">{f.copyright[lang]}</p>
          <p className="text-[11px] text-[#4A5568] text-center">{f.updated[lang]}</p>
        </div>
      </div>
    </footer>
  );
}
