'use client';

import { useState } from 'react';
import { useLang } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import type { ChecklistStep } from '@/lib/types';

interface Props {
  steps: ChecklistStep[];
}

const STATIC_STEPS: ChecklistStep[] = [
  { id: 1, step_number: 1, name_th: 'ยืนยันคุณสมบัติ', name_en: 'Confirm Eligibility', description_th: 'ตรวจสอบเกรด รายได้ครอบครัว และเงื่อนไขอื่น ๆ ให้ครบถ้วนก่อนสมัคร', description_en: 'Check your GPA, family income, and other requirements before applying' },
  { id: 2, step_number: 2, name_th: 'รวบรวมเอกสาร', name_en: 'Gather Documents', description_th: 'เตรียมเอกสารทุกอย่าง เช่น ใบแสดงผลการเรียน สำเนาบัตรประชาชน และหนังสือรับรองรายได้', description_en: 'Prepare all required documents: transcript, ID copy, income certificate' },
  { id: 3, step_number: 3, name_th: 'เขียนเรียงความ', name_en: 'Write Personal Statement', description_th: 'เขียนเรียงความหรือจดหมายแนะนำตัวเองที่สะท้อนความตั้งใจและเป้าหมายของคุณ', description_en: 'Write an essay or statement that reflects your motivation and goals' },
  { id: 4, step_number: 4, name_th: 'ขอจดหมายแนะนำ', name_en: 'Get Recommendation Letter', description_th: 'ติดต่ออาจารย์หรือผู้บังคับบัญชาเพื่อขอจดหมายแนะนำอย่างน้อย 2 สัปดาห์ล่วงหน้า', description_en: 'Contact a teacher or supervisor for a recommendation letter at least 2 weeks in advance' },
  { id: 5, step_number: 5, name_th: 'สมัครบนเว็บไซต์ทุน', name_en: 'Submit Application Online', description_th: 'กรอกใบสมัครและอัปโหลดเอกสารทั้งหมดบนระบบออนไลน์ของผู้ให้ทุน', description_en: "Fill in the application form and upload all documents on the funder's online system" },
  { id: 6, step_number: 6, name_th: 'ยืนยันการส่งใบสมัคร', name_en: 'Confirm Submission', description_th: 'บันทึกหมายเลขอ้างอิงและตรวจสอบอีเมลยืนยันจากผู้ให้ทุน', description_en: 'Save your reference number and check for a confirmation email from the funder' },
  { id: 7, step_number: 7, name_th: 'รายงานผล', name_en: 'Report Outcome', description_th: 'แจ้งผลการสมัครให้ครอบครัวและโรงเรียนทราบ และเตรียมเอกสารสำหรับขั้นตอนถัดไป', description_en: 'Inform your family and school of the result, and prepare documents for next steps' },
];

export default function ChecklistUI({ steps }: Props) {
  const { lang } = useLang();
  const displaySteps = steps.length > 0 ? steps : STATIC_STEPS;
  const [expanded, setExpanded] = useState<number | null>(1);
  const d = translations.detail;

  return (
    <div>
      <h2
        className="text-xl md:text-2xl text-[#1D1D1F] mb-2"
        style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif', fontWeight: 400 }}
      >
        {d.checklist[lang]}
      </h2>
      <p className="text-sm text-[#6E6E73] mb-8">{d.checklistSub[lang]}</p>

      <ol className="space-y-3">
        {displaySteps.map((step) => {
          const name = lang === 'th' ? step.name_th : step.name_en;
          const desc = lang === 'th' ? step.description_th : step.description_en;
          const isOpen = expanded === step.step_number;
          return (
            <li key={step.id}>
              <button className="w-full text-left" onClick={() => setExpanded(isOpen ? null : step.step_number)}>
                <div className={`flex items-center gap-4 p-4 rounded-[12px] border transition-all duration-200 ${isOpen ? 'border-[#F0A500] bg-[#FFF8E7]' : 'border-[#E5E5EA] bg-white hover:border-[#F0A500]/50'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${isOpen ? 'bg-[#F0A500] text-white' : 'bg-[#F5F5F7] text-[#6E6E73]'}`}>
                    {step.step_number}
                  </div>
                  <span className="font-medium flex-1 text-[#1D1D1F]" style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
                    {name}
                  </span>
                  <svg className={`w-4 h-4 text-[#6E6E73] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {isOpen && desc && (
                <div className="px-4 pt-2 pb-4">
                  <p className="text-sm text-[#6E6E73] leading-relaxed pl-12" style={{ fontFamily: lang === 'th' ? 'Sarabun, sans-serif' : 'DM Sans, sans-serif' }}>
                    {desc}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
