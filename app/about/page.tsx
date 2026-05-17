'use client';

import { useLanguage } from '@/components/LanguageToggle';
import { translations } from '@/lib/translations';

const FOUNDER = {
  initial: 'J',
  name_th: 'เจนิสาศ์ วิเชียรสินธุ์ — ผู้ก่อตั้ง',
  name_en: 'Jenissa Vichiansin — Founder',
  role_th: 'นักเรียนชั้นมัธยมศึกษาปีที่ 5 โรงเรียนนานาชาติกรุงเทพ (ISB) มีความหลงใหลในไวโอลิน การทำอาหาร เทนนิส และวิทยาศาสตร์ข้อมูล สร้างทุนดีเพื่อให้นักเรียนไทยทุกคนได้รับโอกาสที่ดีที่สุด',
  role_en: 'Grade 11 at International School Bangkok (ISB). Passionate about violin, competitive cooking, tennis, and data science. Building TunDee to give every Thai student the scholarship navigator she never had.',
  color: '#F0A500',
};

export default function AboutPage() {
  const [lang] = useLanguage();
  const a = translations.about;

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="bg-[#F5F5F7] border-b border-[#E5E5EA]">
        <div className="max-w-[1200px] mx-auto px-6 py-16">
          <h1
            className="text-3xl md:text-5xl text-[#1D1D1F] mb-4"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontWeight: 300,
            }}
          >
            {a.title[lang]}
          </h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-16 space-y-20">
        {/* Mission */}
        <section className="max-w-2xl">
          <h2 className="text-xs font-semibold text-[#F0A500] uppercase tracking-widest mb-4">
            {a.mission_label[lang]}
          </h2>
          <p
            className="text-xl md:text-2xl text-[#1D1D1F] leading-relaxed"
            style={{
              fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif',
              fontWeight: 300,
            }}
          >
            {a.mission[lang]}
          </p>
        </section>

        {/* Problem */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">
                {a.problem_label[lang]}
              </h2>
              <p
                className="text-base text-[#1D1D1F] leading-relaxed"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {a.problem[lang]}
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-4">
                {a.solution_label[lang]}
              </h2>
              <p
                className="text-base text-[#1D1D1F] leading-relaxed"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {a.solution[lang]}
              </p>
            </div>
          </div>
        </section>

        {/* Stats banner */}
        <section className="bg-[#FFF8E7] border border-[#F0A500]/20 rounded-[12px] p-8 md:p-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { value: '3,000+', label_th: 'ทุนในฐานข้อมูล', label_en: 'Scholarships in database' },
              { value: '77', label_th: 'จังหวัดครอบคลุม', label_en: 'Provinces covered' },
              { value: '฿0', label_th: 'ค่าใช้จ่ายสำหรับผู้ใช้', label_en: 'Cost to students' },
            ].map((stat, i) => (
              <div key={i}>
                <div
                  className="text-4xl font-semibold text-[#F0A500] mb-2"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {stat.value}
                </div>
                <div className="text-sm text-[#6E6E73]">
                  {lang === 'th' ? stat.label_th : stat.label_en}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section>
          <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-8">
            {a.team_label[lang]}
          </h2>
          <div className="max-w-sm mx-auto">
            <div className="bg-white border border-[#E5E5EA] rounded-[12px] p-8 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-shadow">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-semibold mb-5"
                style={{ background: FOUNDER.color }}
              >
                {FOUNDER.initial}
              </div>
              <h3
                className="font-semibold text-[#1D1D1F] mb-3"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {lang === 'th' ? FOUNDER.name_th : FOUNDER.name_en}
              </h3>
              <p
                className="text-sm text-[#6E6E73] leading-relaxed"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
              >
                {lang === 'th' ? FOUNDER.role_th : FOUNDER.role_en}
              </p>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section>
          <h2 className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest mb-8">
            {a.roadmap_label[lang]}
          </h2>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-[#E5E5EA]" />
            <ol className="space-y-6">
              {a.roadmap.map((item, i) => (
                <li key={i} className="pl-12 relative">
                  <div
                    className={`absolute left-0 top-1 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? 'bg-[#F0A500] border-[#F0A500] text-white'
                        : 'bg-white border-[#E5E5EA] text-[#6E6E73]'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <p
                    className={`text-sm leading-relaxed ${i === 0 ? 'text-[#1D1D1F] font-medium' : 'text-[#6E6E73]'}`}
                    style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
                  >
                    {lang === 'th' ? item.th : item.en}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#F5F5F7] rounded-[12px] p-8 md:p-12 text-center">
          <h2
            className="text-xl md:text-2xl text-[#1D1D1F] mb-4"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 300 }}
          >
            {lang === 'th' ? 'มาค้นหาทุนที่ใช่ด้วยกัน' : 'Let\'s find the right scholarship together'}
          </h2>
          <a
            href="/scholarships"
            className="inline-flex items-center bg-[#F0A500] text-white font-semibold px-8 py-4 rounded-full hover:bg-[#D4920A] transition-colors duration-200 text-sm"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}
          >
            {lang === 'th' ? 'ค้นหาทุนของคุณ →' : 'Browse Scholarships →'}
          </a>
        </section>
      </div>
    </div>
  );
}
