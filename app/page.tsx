'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import HeroSection from '@/components/HeroSection';
import StatsBar from '@/components/StatsBar';
import ScholarshipCard from '@/components/ScholarshipCard';
import { useLanguage } from '@/components/LanguageToggle';
import { getScholarships } from '@/lib/supabase';
import { translations } from '@/lib/translations';
import type { Scholarship } from '@/lib/types';

function HowItWorksStep({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="w-12 h-12 rounded-full bg-[#FFF8E7] border border-[#F0A500]/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-[#1D1D1F] mb-1">{title}</h3>
        <p className="text-[#6E6E73] text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

const SearchIcon = () => (
  <svg className="w-5 h-5 text-[#F0A500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const CompareIcon = () => (
  <svg className="w-5 h-5 text-[#F0A500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const ApplyIcon = () => (
  <svg className="w-5 h-5 text-[#F0A500]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function HomePage() {
  const [lang] = useLanguage();
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);

  const h = translations.howItWorks;
  const p = translations.persona;
  const f = translations.featured;

  useEffect(() => {
    getScholarships().then((data) => {
      setScholarships(data.slice(0, 6));
      setLoading(false);
    });
  }, []);

  return (
    <>
      <HeroSection lang={lang} />
      <StatsBar lang={lang} />

      {/* How It Works */}
      <section className="section-pad bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2
            className="text-2xl md:text-3xl font-light text-[#1D1D1F] mb-12"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {h.title[lang]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <HowItWorksStep
              icon={<SearchIcon />}
              title={h.step1_title[lang]}
              desc={h.step1_desc[lang]}
            />
            <HowItWorksStep
              icon={<CompareIcon />}
              title={h.step2_title[lang]}
              desc={h.step2_desc[lang]}
            />
            <HowItWorksStep
              icon={<ApplyIcon />}
              title={h.step3_title[lang]}
              desc={h.step3_desc[lang]}
            />
          </div>
        </div>
      </section>

      {/* Persona card */}
      <section className="section-pad bg-[#F5F5F7]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto bg-white border border-[#E5E5EA] rounded-[12px] p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              {/* Avatar placeholder */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                style={{ background: 'linear-gradient(135deg, #F0A500 0%, #E08A00 100%)' }}
              >
                พ
              </div>
              <div>
                <div className="font-semibold text-[#1D1D1F] text-sm">{p.name[lang]}</div>
                <div className="text-xs text-[#6E6E73]">{p.detail[lang]}</div>
              </div>
            </div>
            <h3
              className="text-xs font-semibold text-[#F0A500] uppercase tracking-widest mb-4"
            >
              {p.title[lang]}
            </h3>
            <blockquote
              className="text-lg md:text-xl text-[#1D1D1F] leading-relaxed font-light"
              style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
            >
              {p.quote[lang]}
            </blockquote>
          </div>
        </div>
      </section>

      {/* Featured Scholarships */}
      <section className="section-pad bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-end justify-between mb-10">
            <h2
              className="text-2xl md:text-3xl text-[#1D1D1F]"
              style={{
                fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
                fontWeight: 300,
              }}
            >
              {f.title[lang]}
            </h2>
            <Link
              href="/scholarships"
              className="text-sm text-[#F0A500] font-medium hover:underline hidden md:block"
            >
              {f.viewAll[lang]}
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-52 bg-[#F5F5F7] rounded-[12px] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scholarships.map((s) => (
                <ScholarshipCard key={s.id} scholarship={s} lang={lang} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center md:hidden">
            <Link
              href="/scholarships"
              className="inline-block text-sm text-[#F0A500] font-medium hover:underline"
            >
              {f.viewAll[lang]}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
