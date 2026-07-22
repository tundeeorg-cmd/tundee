'use client';

/**
 * /privacy — Privacy Policy
 * ⚠️  DRAFT — pending review by a qualified person before launch.
 *
 * PDPA-aware draft for TunDee (tundee.org), a student-led project.
 * Remove the "Draft" banner once reviewed.
 *
 * Policy version: 1.0  |  Last updated: 2026-07-12
 */

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';

const POLICY_VERSION = '1.0';
const LAST_UPDATED   = '12 กรกฎาคม 2569 / 12 July 2026';
const CONTACT_EMAIL  = 'hello@tundee.org';

// Data-controller / "responsible person" name shown in §1 and §10 — switches
// with the page's TH/EN toggle, same as every other string in SECTIONS below.
const RESPONSIBLE_PERSON_NAME = { th: 'ทุนดี', en: 'tundee' };

// ─── bilingual content ──────────────────────────────────────────────────────

const SECTIONS = {
  th: {
    title:   'นโยบายความเป็นส่วนตัว',
    draft:   '⚠️ ฉบับร่าง — อยู่ระหว่างการตรวจสอบโดยผู้เชี่ยวชาญด้านกฎหมาย ยังไม่ใช่ฉบับสมบูรณ์',
    version: `เวอร์ชัน ${POLICY_VERSION} · อัปเดตล่าสุด ${LAST_UPDATED}`,
    footerNote: '© 2569 ทุนดี · สร้างขึ้นเพื่อนักเรียนไทยทุกคน · ข้อมูลทุนการศึกษาอัปเดตล่าสุด: มิถุนายน 2569',
    toc: ['ผู้รับผิดชอบข้อมูล', 'ข้อมูลที่เราเก็บ', 'วัตถุประสงค์', 'ฐานทางกฎหมาย', 'สิ่งที่เราไม่ทำ', 'การเก็บรักษาและการลบ', 'สิทธิของคุณ (PDPA)', 'ผู้ใช้อายุต่ำกว่า 18 ปี', 'การเปลี่ยนแปลงนโยบาย', 'ติดต่อเรา'],
    sections: [
      {
        heading: '1. ผู้รับผิดชอบข้อมูล (Data Controller)',
        body: `ทุนดี (tundee.org) เป็นโครงการของนักศึกษาที่ไม่แสวงหากำไร ดำเนินการโดย ${RESPONSIBLE_PERSON_NAME.th} ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)\n\nช่องทางติดต่อ: hello@tundee.org\nเว็บไซต์: tundee.org`,
      },
      {
        heading: '2. ข้อมูลที่เราเก็บรวบรวม',
        body: `เราเก็บเฉพาะข้อมูลที่จำเป็นสำหรับการจับคู่ทุนการศึกษา:\n\n• อีเมลหรือบัญชี Google ที่ใช้เข้าสู่ระบบ (จัดการโดย Supabase Auth — ไม่ได้เก็บไว้ในฐานข้อมูลของทุนดีโดยตรง)\n• ชื่อที่แสดง (ไม่บังคับ)\n• ระดับการศึกษา\n• เกรดเฉลี่ย (GPA)\n• จังหวัดที่อยู่\n• ช่วงรายได้ครัวเรือน (เก็บเป็นช่วง เช่น "5,000–10,000 บาท/เดือน" ไม่ใช่ตัวเลขที่แน่นอน)\n• สถานะบัตรสวัสดิการแห่งรัฐ (ไม่บังคับ)\n• สาขาที่สนใจ (ไม่บังคับ)\n• ข้อมูลวิจัย: จำนวนทุนที่รู้จักก่อนใช้ทุนดี, ช่องทางที่รู้จักทุนดี (เก็บเฉพาะผู้ที่ยินยอมสำหรับงานวิจัย)\n\nเราไม่เก็บ: เลขบัตรประชาชน, ที่อยู่เต็ม, เบอร์โทรศัพท์, สถานะความพิการ, เชื้อชาติ, หรือข้อมูลอ่อนไหวตาม PDPA มาตรา 26`,
      },
      {
        heading: '3. วัตถุประสงค์ในการใช้ข้อมูล',
        body: `• วัตถุประสงค์หลัก: จับคู่ทุนการศึกษากับโปรไฟล์ของคุณ เพื่อให้คุณเห็นทุนที่ตรงกับเงื่อนไขจริง\n• วัตถุประสงค์รอง (เฉพาะผู้ที่เลือกยินยอม): ใช้ข้อมูลที่ผ่านการลบข้อมูลระบุตัวตนแล้วสำหรับงานวิจัยเรื่องการเข้าถึงทุนการศึกษาของนักเรียนไทย งานวิจัยนี้มีเป้าหมายเพื่อปรับปรุงระบบทุนการศึกษาให้เป็นธรรมยิ่งขึ้น\n• การส่งอีเมลแจ้งเตือน: หากคุณบันทึกทุน ระบบอาจส่งอีเมลแจ้งใกล้ถึงกำหนดสมัคร`,
      },
      {
        heading: '4. ฐานทางกฎหมาย',
        body: `เราประมวลผลข้อมูลของคุณบนฐาน "ความยินยอม" (PDPA มาตรา 19) คุณให้ความยินยอมเมื่อสร้างบัญชีและยอมรับนโยบายนี้ สำหรับงานวิจัย เราขอความยินยอมแยกต่างหากและไม่บังคับ`,
      },
      {
        heading: '5. สิ่งที่เราไม่ทำ',
        body: `• เราไม่ขายข้อมูลของคุณให้กับบุคคลที่สาม\n• เราไม่แสดงโฆษณา\n• เราไม่แบ่งปันข้อมูลที่ระบุตัวตนได้กับผู้ให้ทุน\n• เราไม่ใช้ข้อมูลของคุณเพื่อวัตถุประสงค์อื่นนอกจากที่ระบุข้างต้น`,
      },
      {
        heading: '6. การเก็บรักษาและการลบข้อมูล',
        body: `เราเก็บข้อมูลของคุณตลอดระยะเวลาที่คุณใช้บัญชี หากคุณต้องการลบข้อมูล กรุณาส่งอีเมลมาที่ hello@tundee.org โดยระบุอีเมลที่ใช้ลงทะเบียน เราจะดำเนินการภายใน 30 วัน\n\nข้อมูลวิจัยที่ผ่านการลบข้อมูลระบุตัวตนแล้วอาจถูกเก็บในรูปแบบรวม (aggregate) หลังจากที่คุณลบบัญชี เนื่องจากไม่สามารถระบุตัวตนได้อีกต่อไป`,
      },
      {
        heading: '7. สิทธิของคุณภายใต้ PDPA',
        body: `ในฐานะเจ้าของข้อมูล คุณมีสิทธิดังต่อไปนี้:\n\n• สิทธิในการเข้าถึงข้อมูล — ขอดูข้อมูลที่เราเก็บเกี่ยวกับคุณ\n• สิทธิแก้ไขข้อมูล — แก้ไขข้อมูลที่ไม่ถูกต้อง\n• สิทธิในการลบข้อมูล — ขอให้ลบข้อมูลของคุณ\n• สิทธิในการถอนความยินยอม — ถอนความยินยอมได้ทุกเมื่อโดยไม่มีผลย้อนหลัง\n• สิทธิในการร้องเรียน — ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล\n\nในการใช้สิทธิเหล่านี้ กรุณาส่งอีเมลมาที่ hello@tundee.org`,
      },
      {
        heading: '8. ผู้ใช้อายุต่ำกว่า 18 ปี',
        body: `ทุนดีออกแบบมาเพื่อช่วยนักเรียนทุกระดับ รวมถึงผู้ที่อายุต่ำกว่า 18 ปี เราแนะนำให้ผู้ที่อายุต่ำกว่า 18 ปีแจ้งให้ผู้ปกครองรับทราบการใช้งาน ตามที่คุณได้รับทราบระหว่างการสร้างบัญชี\n\n⚠️ หมายเหตุ: การขอความยินยอมจากผู้ปกครองแบบเต็มรูปแบบสำหรับผู้เยาว์อยู่ระหว่างการพิจารณาทางกฎหมาย (flagged for legal review)`,
      },
      {
        heading: '9. การเปลี่ยนแปลงนโยบาย',
        body: `เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว เมื่อมีการเปลี่ยนแปลงสาระสำคัญ เราจะแจ้งผ่านทางอีเมลหรือแสดงข้อความบนเว็บไซต์ วันที่และเวอร์ชันจะอัปเดตที่ด้านบนของหน้านี้`,
      },
      {
        heading: '10. ติดต่อเรา',
        body: `หากคุณมีคำถามเกี่ยวกับนโยบายนี้หรือต้องการใช้สิทธิ์ของคุณ:\n\nอีเมล: hello@tundee.org\nเว็บไซต์: tundee.org\nผู้รับผิดชอบ: ${RESPONSIBLE_PERSON_NAME.th}`,
      },
    ],
  },
  en: {
    title:   'TunDee — Find Thai Scholarships',
    draft:   'Draft — under legal review, not final',
    version: `Version ${POLICY_VERSION} · Last updated: 12 July 2026`,
    footerNote: '© 2026 TunDee · Made for every Thai student · Scholarship data last updated: June 2026',
    toc: ['Data Controller', 'Information We Collect', 'How We Use Your Data', 'Legal Basis', 'What We Do Not Do', 'Data Retention and Deletion', 'Your Rights Under the PDPA', 'Users Under 18', 'Changes to This Policy', 'Contact Us'],
    sections: [
      {
        heading: '1. Data Controller',
        body: `TunDee is a non-profit student initiative. It acts as the data controller under Thailand's Personal Data Protection Act B.E. 2562 (PDPA). Contact: hello@tundee.org. Website: tundee.org`,
      },
      {
        heading: '2. Information We Collect',
        body: `We collect only the information needed to match you with scholarships: your email or Google account (managed by Supabase Auth); display name (optional); education level; GPA; province of residence; household income range (stored as a bracket, never an exact figure); government welfare card status (optional); fields of interest (optional); and, from research volunteers only, research data such as how many scholarships you knew about before using TunDee and how you found us. We do not collect national ID numbers, full addresses, phone numbers, disability status, ethnicity, or other sensitive data as defined in PDPA Section 26.`,
      },
      {
        heading: '3. How We Use Your Data',
        body: `Primary: matching scholarships to your profile so you see genuinely relevant opportunities. Secondary (only with your consent): using anonymized data to research Thai students' access to scholarships and improve funding equity. Communications: sending deadline reminders for scholarships you've saved.`,
      },
      {
        heading: '4. Legal Basis',
        body: `We process your data on the basis of consent (PDPA Section 19), given when you create an account and accept this policy. Taking part in research requires a separate, optional consent.`,
      },
      {
        heading: '5. What We Do Not Do',
        body: `We never sell your data. We show no advertising. We do not share personally identifiable information with scholarship providers. We do not use your data for any purpose beyond those described here.`,
      },
      {
        heading: '6. Data Retention and Deletion',
        body: `We keep your data while your account is active. To request deletion, email hello@tundee.org from your registered email address; we process requests within 30 days. Anonymized research data may be kept in aggregated form after deletion, as it cannot be traced back to any individual.`,
      },
      {
        heading: '7. Your Rights Under the PDPA',
        body: `You have the right to access the data we hold, correct inaccurate information, request deletion, withdraw consent at any time (without retroactive effect), and file a complaint with Thailand's Personal Data Protection Committee. To exercise any of these rights, contact hello@tundee.org.`,
      },
      {
        heading: '8. Users Under 18',
        body: `TunDee serves students at all levels, including minors. We ask users under 18 to inform their parents about their use of the platform, as noted during account creation. Full parental-consent handling for minors is flagged for legal review.`,
      },
      {
        heading: '9. Changes to This Policy',
        body: `We may update this policy from time to time. We'll communicate material changes by email or a notice on the website, and update the version number and date at the top of this page.`,
      },
      {
        heading: '10. Contact Us',
        body: `Email: hello@tundee.org. Website: tundee.org. Responsible party: TunDee.`,
      },
    ],
  },
};

// ─── component ──────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const { lang, setLang } = useLang();
  const c = SECTIONS[lang];

  return (
    <main className="min-h-screen bg-[#F7F9FC] dark:bg-[#111111] pt-20 pb-20">
      <div className="max-w-3xl mx-auto px-4">

        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] overflow-hidden text-xs font-medium">
            {(['th', 'en'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 transition-colors ${lang === l ? 'bg-[#2E6BE6] text-white' : 'bg-white dark:bg-[#1D1D1F] text-[#6E6E73]'}`}>
                {l === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        {/* Draft banner */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800 dark:text-amber-300 font-medium">
          {c.draft}
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1D1D1F] dark:text-white mb-2"
            style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
            {c.title}
          </h1>
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">{c.version}</p>
        </div>

        {/* Table of contents */}
        <div className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-xl p-5 mb-8">
          <p className="text-xs font-semibold text-[#6E6E73] dark:text-[#8E8E93] uppercase tracking-wider mb-3">
            {lang === 'th' ? 'สารบัญ' : 'Contents'}
          </p>
          <ol className="list-decimal list-inside space-y-1">
            {c.toc.map((item, i) => (
              <li key={i} className="text-sm text-[#2E6BE6] hover:underline cursor-pointer"
                onClick={() => document.getElementById(`s${i}`)?.scrollIntoView({ behavior: 'smooth' })}>
                {item}
              </li>
            ))}
          </ol>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {c.sections.map((s, i) => (
            <section key={i} id={`s${i}`}
              className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-xl p-6">
              <h2 className="text-base font-bold text-[#1D1D1F] dark:text-white mb-4"
                style={{ borderLeft: '3px solid #2E6BE6', paddingLeft: 12, fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
                {s.heading}
              </h2>
              <div className="text-sm text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed whitespace-pre-line"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
                {s.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer nav */}
        <div className="mt-10 pt-6 border-t border-[#E5E5EA] dark:border-[#3A3A3C] flex flex-wrap gap-4 text-sm text-[#6E6E73] dark:text-[#8E8E93]">
          <Link href="/" className="hover:text-[#2E6BE6] transition-colors">← {lang === 'th' ? 'หน้าแรก' : 'Home'}</Link>
          <Link href="/terms" className="hover:text-[#2E6BE6] transition-colors">{lang === 'th' ? 'ข้อกำหนดการใช้งาน' : 'Terms of Use'}</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#2E6BE6] transition-colors">{CONTACT_EMAIL}</a>
        </div>
        <p className="mt-3 text-xs text-[#AEAEB2] dark:text-[#636366]"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
          {c.footerNote}
        </p>
      </div>
    </main>
  );
}
