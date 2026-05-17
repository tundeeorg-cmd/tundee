'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import ScholarshipCard from '@/components/ScholarshipCard';
import ScholarshipFilters from '@/components/ScholarshipFilters';
import { useLanguage } from '@/components/LanguageToggle';
import { getScholarships } from '@/lib/supabase';
import { translations } from '@/lib/translations';
import type { FilterState, Scholarship } from '@/lib/types';

const EMPTY_FILTERS: FilterState = {
  funderType: '',
  minGpa: null,
  fieldOfStudy: '',
  province: '',
  welfareCard: false,
};

function applyFilters(scholarships: Scholarship[], f: FilterState): Scholarship[] {
  return scholarships.filter((s) => {
    if (f.funderType && s.funder_type !== f.funderType) return false;

    if (f.minGpa !== null && s.min_gpa !== null && s.min_gpa > f.minGpa) return false;

    if (f.fieldOfStudy) {
      const fields = s.field_of_study ?? [];
      if (!fields.includes('any') && !fields.some((fd) => fd.includes(f.fieldOfStudy) || f.fieldOfStudy.includes(fd))) {
        return false;
      }
    }

    if (f.province) {
      const provinces = s.province_restriction ?? [];
      if (!provinces.includes('national') && !provinces.includes(f.province)) return false;
    }

    if (f.welfareCard && !s.welfare_card_priority) return false;

    return true;
  });
}

export default function BrowsePage() {
  const [lang] = useLanguage();
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const b = translations.browse;

  useEffect(() => {
    getScholarships().then((data) => {
      setScholarships(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => applyFilters(scholarships, filters), [scholarships, filters]);

  return (
    <div className="bg-white min-h-screen">
      {/* Page header */}
      <div className="bg-[#F5F5F7] border-b border-[#E5E5EA]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <h1
            className="text-3xl md:text-4xl text-[#1D1D1F] mb-3"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontWeight: 300,
            }}
          >
            {b.title[lang]}
          </h1>
          <p className="text-[#6E6E73]">{b.subtitle[lang]}</p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="flex gap-8">
          {/* Sidebar — desktop */}
          <aside className="hidden md:block w-72 shrink-0">
            <div className="sticky top-24">
              <ScholarshipFilters
                filters={filters}
                onChange={setFilters}
                lang={lang}
                resultCount={filtered.length}
              />
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Mobile filter toggle */}
            <button
              className="md:hidden flex items-center gap-2 text-sm font-medium text-[#1D1D1F] border border-[#E5E5EA] rounded-lg px-4 py-2 mb-6 w-full justify-center"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {b.filters[lang]} {filtered.length > 0 && `(${filtered.length})`}
            </button>

            {/* Mobile filter panel */}
            {filtersOpen && (
              <div className="md:hidden mb-6">
                <ScholarshipFilters
                  filters={filters}
                  onChange={setFilters}
                  lang={lang}
                  resultCount={filtered.length}
                />
              </div>
            )}

            {/* Results header */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm text-[#6E6E73]">
                {filtered.length} {b.results[lang]}
              </span>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-52 bg-[#F5F5F7] rounded-[12px] animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-24">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] mb-2">{b.noResults[lang]}</h3>
                <p className="text-[#6E6E73] text-sm mb-6">{b.noResultsSub[lang]}</p>
                <button
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-sm text-[#F0A500] font-medium hover:underline"
                >
                  {b.clearFilters[lang]}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filtered.map((s) => (
                  <ScholarshipCard key={s.id} scholarship={s} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
