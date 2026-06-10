'use client';

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';

export default function Footer() {
  const { lang } = useLang();
  const nav = translations.nav;
  const f = translations.footer;

  const wordmarkStyle: React.CSSProperties = {
    fontFamily: "'Sarabun', system-ui, sans-serif",
    fontWeight: 600,
  };

  return (
    <footer className="bg-[#0A2342] mt-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-lg text-white" style={wordmarkStyle}>ทุนดี</span>
              <span
                className="text-[10px] tracking-[0.14em] text-white/40 uppercase"
                style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
              >
                TUNDEE
              </span>
            </div>
            <p
              className="text-sm text-white/50 leading-relaxed"
              style={{ fontFamily: lang === 'th' ? "'Sarabun', sans-serif" : 'var(--font-lato), Lato, sans-serif' }}
            >
              {f.tagline[lang]}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4
              className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em] mb-4"
              style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
            >
              {f.links_title[lang]}
            </h4>
            <nav className="flex flex-col gap-2.5">
              <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">{nav.home[lang]}</Link>
              <Link href="/scholarships" className="text-sm text-white/40 hover:text-white/70 transition-colors">{nav.search[lang]}</Link>
              <Link href="/tracker" className="text-sm text-white/40 hover:text-white/70 transition-colors">{lang === 'th' ? 'ติดตาม' : 'Tracker'}</Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4
              className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.1em] mb-4"
              style={{ fontFamily: 'var(--font-lato), Lato, sans-serif' }}
            >
              {f.contact_title[lang]}
            </h4>
            <a href="mailto:hello@tundee.org" className="text-sm text-white/40 hover:text-white/70 transition-colors block mb-1.5">
              hello@tundee.org
            </a>
            <p className="text-sm text-white/30">tundee.org</p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/25 text-center">{f.copyright[lang]}</p>
          <p className="text-[11px] text-white/20 text-center">{f.updated[lang]}</p>
        </div>
      </div>
    </footer>
  );
}
