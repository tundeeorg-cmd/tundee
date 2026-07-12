'use client';

/**
 * /terms — Terms of Use
 * ⚠️  DRAFT — pending review by a qualified person before launch.
 *
 * Version: 1.0  |  Last updated: 2026-07-12
 */

import { useState } from 'react';
import Link from 'next/link';

const LAST_UPDATED = '12 กรกฎาคม 2569 / 12 July 2026';

const CONTENT = {
  th: {
    title:  'ข้อกำหนดการใช้งาน',
    draft:  '⚠️ ฉบับร่าง — อยู่ระหว่างการตรวจสอบโดยผู้เชี่ยวชาญด้านกฎหมาย ยังไม่ใช่ฉบับสมบูรณ์',
    updated: `อัปเดตล่าสุด: ${LAST_UPDATED}`,
    sections: [
      {
        heading: '1. เกี่ยวกับทุนดี',
        body: 'ทุนดี (tundee.org) เป็นโครงการของนักศึกษาที่ให้บริการฟรีแก่นักเรียนและนักศึกษาไทย เพื่อช่วยค้นหาทุนการศึกษาที่ตรงกับคุณสมบัติ เราไม่ใช่บริษัท มูลนิธิ หรือหน่วยงานรัฐ',
      },
      {
        heading: '2. บริการฟรีตลอด',
        body: 'การใช้งานทุนดีไม่มีค่าใช้จ่ายทั้งในปัจจุบันและอนาคต เราไม่เรียกเก็บค่าธรรมเนียมในการสมัคร ค้นหา หรือดูข้อมูลทุนการศึกษา',
      },
      {
        heading: '3. ข้อมูลทุนการศึกษา',
        body: 'ทุนดีรวบรวมและตรวจสอบข้อมูลทุนการศึกษาโดยทีมงาน อย่างไรก็ตาม:\n\n• ข้อมูลเงื่อนไข จำนวนเงิน และกำหนดสมัครอาจมีการเปลี่ยนแปลงโดยผู้ให้ทุน\n• เราไม่รับประกันว่าข้อมูลจะถูกต้องสมบูรณ์หรือทันสมัยในทุกขณะ\n• เราไม่รับประกันว่ารายการทุนที่แสดงจะครบถ้วนทุกทุนที่มีอยู่\n• ทุนดีไม่มีส่วนเกี่ยวข้องกับการตัดสินใจให้ทุนของผู้ให้ทุน\n\nกรุณาตรวจสอบข้อมูลกับแหล่งทุนโดยตรงก่อนสมัคร',
      },
      {
        heading: '4. การสมัครทุน',
        body: 'การสมัครทุนเกิดขึ้นบนเว็บไซต์ของผู้ให้ทุน ไม่ใช่บนทุนดี ทุนดีไม่มีอำนาจในการรับหรือปฏิเสธการสมัคร ไม่รับผิดชอบต่อผลการสมัคร และไม่รับผิดชอบต่อการกระทำหรือนโยบายของผู้ให้ทุน',
      },
      {
        heading: '5. การใช้งานที่เหมาะสม',
        body: 'คุณตกลงที่จะใช้ทุนดีเพื่อวัตถุประสงค์ที่ชอบด้วยกฎหมายเท่านั้น ห้ามใช้ระบบเพื่อรบกวนการทำงานของเว็บไซต์ ดึงข้อมูลโดยไม่ได้รับอนุญาต หรือแอบอ้างเป็นบุคคลอื่น',
      },
      {
        heading: '6. บริการ "ตามที่เป็น"',
        body: 'ทุนดีให้บริการ "ตามที่เป็น" (as-is) โดยไม่มีการรับประกันใดๆ ทั้งโดยชัดแจ้งหรือโดยนัย ในขอบเขตที่กฎหมายอนุญาต เราไม่รับผิดชอบต่อความเสียหายที่เกิดจากการใช้หรือไม่สามารถใช้บริการได้',
      },
      {
        heading: '7. ทรัพย์สินทางปัญญา',
        body: 'เนื้อหา โค้ด และการออกแบบของทุนดีเป็นทรัพย์สินของผู้ดำเนินการ ข้อมูลทุนการศึกษาที่รวบรวมมานั้นอ้างอิงจากแหล่งสาธารณะและเว็บไซต์ผู้ให้ทุน',
      },
      {
        heading: '8. การเปลี่ยนแปลงข้อกำหนด',
        body: 'เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว การใช้งานต่อเนื่องหลังจากการเปลี่ยนแปลงถือว่าคุณยอมรับข้อกำหนดใหม่',
      },
      {
        heading: '9. ติดต่อเรา',
        body: 'หากคุณมีคำถามหรือพบปัญหาใดๆ กรุณาติดต่อ hello@tundee.org',
      },
    ],
  },
  en: {
    title:  'Terms of Use',
    draft:  '⚠️ DRAFT — Pending review by a qualified legal professional. Not final.',
    updated: `Last updated: ${LAST_UPDATED}`,
    sections: [
      {
        heading: '1. About TunDee',
        body: 'TunDee (tundee.org) is a free, student-led project that helps Thai students discover scholarships matching their profile. We are not a company, foundation, or government agency.',
      },
      {
        heading: '2. Always Free',
        body: 'TunDee is free to use now and always will be. We do not charge any fee for searching, viewing, or using scholarship information.',
      },
      {
        heading: '3. Scholarship Information',
        body: 'TunDee curates and manually verifies scholarship listings. However:\n\n• Eligibility, amounts, and deadlines may be changed by funders at any time.\n• We do not guarantee that information is always complete, accurate, or up to date.\n• We do not guarantee that all existing scholarships are listed.\n• TunDee has no involvement in funders\' selection or award decisions.\n\nAlways verify details directly with the funder before applying.',
      },
      {
        heading: '4. Applications',
        body: 'Applications are submitted on the funder\'s own website, not on TunDee. TunDee has no authority to accept or reject applications, is not responsible for application outcomes, and is not liable for funder actions or policies.',
      },
      {
        heading: '5. Acceptable Use',
        body: 'You agree to use TunDee only for lawful purposes. Do not use the platform to disrupt service, scrape data without permission, or impersonate others.',
      },
      {
        heading: '6. "As Is" Service',
        body: 'TunDee is provided "as is" without warranties of any kind, either express or implied. To the extent permitted by law, we are not liable for any damages arising from use of or inability to use the service.',
      },
      {
        heading: '7. Intellectual Property',
        body: 'TunDee\'s content, code, and design belong to the operator. Scholarship data is sourced from public-domain funder websites and official announcements.',
      },
      {
        heading: '8. Changes to Terms',
        body: 'We may update these terms periodically. Continued use after changes constitutes acceptance of the updated terms.',
      },
      {
        heading: '9. Contact',
        body: 'For questions or to report an issue: hello@tundee.org',
      },
    ],
  },
};

export default function TermsPage() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const c = CONTENT[lang];

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
          <p className="text-sm text-[#6E6E73] dark:text-[#8E8E93]">{c.updated}</p>
        </div>

        {/* Sections */}
        <div className="space-y-5">
          {c.sections.map((s, i) => (
            <section key={i}
              className="bg-white dark:bg-[#1D1D1F] border border-[#E5E5EA] dark:border-[#3A3A3C] rounded-xl p-6">
              <h2 className="text-base font-bold text-[#1D1D1F] dark:text-white mb-3"
                style={{ borderLeft: '3px solid #2E6BE6', paddingLeft: 12, fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
                {s.heading}
              </h2>
              <p className="text-sm text-[#3A3A3C] dark:text-[#ADADB8] leading-relaxed whitespace-pre-line"
                style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
                {s.body}
              </p>
            </section>
          ))}
        </div>

        {/* Footer nav */}
        <div className="mt-10 pt-6 border-t border-[#E5E5EA] dark:border-[#3A3A3C] flex flex-wrap gap-4 text-sm text-[#6E6E73] dark:text-[#8E8E93]">
          <Link href="/" className="hover:text-[#2E6BE6] transition-colors">← {lang === 'th' ? 'หน้าแรก' : 'Home'}</Link>
          <Link href="/privacy" className="hover:text-[#2E6BE6] transition-colors">{lang === 'th' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy'}</Link>
          <a href="mailto:hello@tundee.org" className="hover:text-[#2E6BE6] transition-colors">hello@tundee.org</a>
        </div>
      </div>
    </main>
  );
}
