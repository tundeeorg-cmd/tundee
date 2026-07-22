'use client';

/**
 * /terms — Terms of Use
 * ⚠️  DRAFT — pending review by a qualified person before launch.
 *
 * Version: 1.0  |  Last updated: 2026-07-12
 */

import Link from 'next/link';
import { useLang } from '@/lib/LanguageContext';

const LAST_UPDATED = '12 กรกฎาคม 2569 / 12 July 2026';

const CONTENT = {
  th: {
    title:  'ข้อกำหนดการใช้งาน',
    draft:  '⚠️ ฉบับร่าง — อยู่ระหว่างการตรวจสอบโดยผู้เชี่ยวชาญด้านกฎหมาย ยังไม่ใช่ฉบับสมบูรณ์',
    updated: `อัปเดตล่าสุด: ${LAST_UPDATED}`,
    footerNote: '© 2569 ทุนดี · สร้างขึ้นเพื่อนักเรียนไทยทุกคน · ข้อมูลทุนการศึกษาอัปเดตล่าสุด: มิถุนายน 2569',
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
    title:  'Terms of Service',
    draft:  'Draft — under legal review, not final',
    updated: 'Last updated: 12 July 2026',
    footerNote: '© 2026 TunDee · Made for every Thai student · Scholarship data last updated: June 2026',
    sections: [
      {
        heading: '1. About TunDee',
        body: 'TunDee is a free, student-run project that helps Thai students find scholarships matched to their qualifications. TunDee is not a company, a foundation, or a government agency.',
      },
      {
        heading: '2. Free Forever',
        body: 'TunDee is completely free — now and in the future. There is no charge to register, to search, or to access any scholarship information.',
      },
      {
        heading: '3. Scholarship Information',
        body: 'Our team compiles and verifies scholarship information, but conditions, amounts, and deadlines can change at any time. We do not guarantee that the information is accurate, complete, or that every scholarship is listed, and TunDee plays no part in any scholarship\'s selection or approval decisions.',
      },
      {
        heading: '4. Applying for Scholarships',
        body: 'Applications are submitted on the scholarship provider\'s own website, not on TunDee. TunDee has no authority over, and no involvement in, any acceptance or rejection decision.',
      },
      {
        heading: '5. Acceptable Use',
        body: 'You agree not to use TunDee for any unlawful purpose, to disrupt or interfere with its operation, to extract its data without authorization, or to impersonate any person or organization.',
      },
      {
        heading: '6. Service Provided "As Is"',
        body: 'TunDee is provided "as is," without warranties of any kind, whether express or implied. To the fullest extent permitted by law, we are not liable for any damages arising from your use of, or inability to use, the service.',
      },
      {
        heading: '7. Intellectual Property',
        body: 'The content, code, and design of TunDee belong to its operator. Scholarship data is drawn from public sources and the websites of the scholarship providers.',
      },
      {
        heading: '8. Changes to These Terms',
        body: 'We may update these terms from time to time. Continuing to use TunDee after changes are posted means you accept the updated terms.',
      },
      {
        heading: '9. Contact Us',
        body: 'Questions about these terms? Email hello@tundee.org.',
      },
    ],
  },
};

export default function TermsPage() {
  const { lang, setLang } = useLang();
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
        <p className="mt-3 text-xs text-[#AEAEB2] dark:text-[#636366]"
          style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'inherit' }}>
          {c.footerNote}
        </p>
      </div>
    </main>
  );
}
