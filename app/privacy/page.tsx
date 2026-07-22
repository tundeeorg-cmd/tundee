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

import { useState } from 'react';
import Link from 'next/link';

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
    title:   'Privacy Policy',
    draft:   '⚠️ DRAFT — Pending review by a qualified legal professional. Not final.',
    version: `Version ${POLICY_VERSION} · Last updated ${LAST_UPDATED}`,
    toc: ['Data Controller', 'What We Collect', 'Purposes', 'Legal Basis', 'What We Do Not Do', 'Retention & Deletion', 'Your Rights (PDPA)', 'Users Under 18', 'Policy Changes', 'Contact Us'],
    sections: [
      {
        heading: '1. Data Controller',
        body: `TunDee (tundee.org) is a non-profit student-led project operated by ${RESPONSIBLE_PERSON_NAME.en}, who acts as the Data Controller under the Personal Data Protection Act B.E. 2562 (PDPA).\n\nContact: hello@tundee.org\nWebsite: tundee.org`,
      },
      {
        heading: '2. What We Collect',
        body: `We collect only what is necessary to match you with scholarships:\n\n• Email or Google account used for sign-in (managed by Supabase Auth — not stored directly in TunDee's database)\n• Display name (optional)\n• Grade level\n• GPA\n• Province\n• Household income bracket (stored as a range, e.g. "฿5,000–10,000/month" — never an exact figure)\n• State welfare card status (optional)\n• Fields of academic interest (optional)\n• Research data: number of scholarships known before TunDee, how you heard about TunDee (collected only with your separate consent)\n\nWe do NOT collect: national ID, full address, phone number, disability status, ethnicity, or any sensitive data under PDPA Section 26.`,
      },
      {
        heading: '3. Purposes',
        body: `• Primary purpose: match scholarship listings to your profile so you see only relevant opportunities.\n• Secondary purpose (opt-in only): use de-identified, aggregated data for academic research on scholarship access in Thailand, aimed at improving fairness in the scholarship system.\n• Deadline reminders: if you save a scholarship, we may send you an email reminder as the deadline approaches.`,
      },
      {
        heading: '4. Legal Basis',
        body: `We process your data on the basis of consent (PDPA Section 19). You provide this consent when you create an account and agree to this policy. Research processing requires a separate, optional consent.`,
      },
      {
        heading: '5. What We Do Not Do',
        body: `• We do not sell your data to any third party.\n• We do not show advertisements.\n• We do not share identifiable data with scholarship funders.\n• We do not use your data for any purpose beyond those stated above.`,
      },
      {
        heading: '6. Retention & Deletion',
        body: `We retain your data for as long as your account is active. To delete your data, email hello@tundee.org with the email address used to register. We will complete the deletion within 30 days.\n\nDe-identified aggregate research data may be retained after account deletion as it can no longer be linked to you.`,
      },
      {
        heading: '7. Your Rights Under PDPA',
        body: `As a data subject you have the right to:\n\n• Access — request a copy of data we hold about you.\n• Rectification — correct inaccurate data.\n• Erasure — request deletion of your data.\n• Withdraw consent — at any time, without affecting prior processing.\n• Lodge a complaint — with the Office of the Personal Data Protection Committee (PDPC).\n\nTo exercise any right, email hello@tundee.org.`,
      },
      {
        heading: '8. Users Under 18',
        body: `TunDee is designed to help students of all ages, including those under 18. We recommend that users under 18 inform a parent or guardian that they are using TunDee, as acknowledged during account creation.\n\n⚠️ Note: Full verified parental consent for minors is under legal review and is flagged as a pre-launch item.`,
      },
      {
        heading: '9. Policy Changes',
        body: `We may update this policy periodically. For material changes we will notify you by email or via a notice on the website. The version number and date at the top of this page will be updated accordingly.`,
      },
      {
        heading: '10. Contact Us',
        body: `For questions about this policy or to exercise your rights:\n\nEmail: hello@tundee.org\nWebsite: tundee.org\nResponsible person: ${RESPONSIBLE_PERSON_NAME.en}`,
      },
    ],
  },
};

// ─── component ──────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
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
      </div>
    </main>
  );
}
