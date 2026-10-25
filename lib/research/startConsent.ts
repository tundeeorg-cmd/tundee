/**
 * The research-consent wording shown on /start before the questions, in one place
 * so the study team can review exactly what a visitor reads.
 *
 * DRAFT — NOT APPROVED. ANON_RANDOMIZATION must stay off until the team has
 * approved this text as a rendering of the research consent form
 * (CURRENT_CONSENT_VERSION in lib/research/consentGate.ts) and settled the age
 * threshold (START_ADULT_AGE). /start now asks age first and offers the study only to
 * visitors who say they have reached it; the answer is self-declared and cannot be
 * checked, and a checkbox is never a guardian's consent. See research/AMENDMENT-*.md.
 *
 * Rules the page follows (PART 2 step 6): the box is NEVER pre-ticked; declining
 * costs nothing — the visitor sees the same scholarships and the baseline ranking
 * and is simply not in the study; no dark pattern.
 */
import { START_ADULT_AGE } from './startEligibility';

export const START_CONSENT = {
  /** The age question comes first: it decides whether the visitor is offered the study at all. */
  ageQuestion: `คุณอายุ ${START_ADULT_AGE} ปีขึ้นไปหรือยัง`,
  ageHint: 'ใช้ตัดสินว่าจะเชิญเข้าร่วมงานวิจัยได้หรือไม่ (ไม่บังคับ ข้ามได้) ไม่มีผลต่อทุนที่คุณเห็น',
  ageYes: `ใช่ ${START_ADULT_AGE} ปีขึ้นไป`,
  ageNo: 'ยังไม่ถึง',
  /** Shown to a visitor under the threshold: full service, outside the study. */
  minorOutcome: 'ขอบคุณที่บอกเรา คุณใช้ทุนดีได้เต็มที่เหมือนทุกคน เพียงแต่ยังไม่เข้าร่วมงานวิจัยในตอนนี้',
  heading: 'คำตอบของคุณใช้ทำอะไร',
  body:
    'คำตอบ 3 ข้อนี้ใช้แนะนำทุนให้คุณ และใช้ในงานวิจัยการเข้าถึงทุนการศึกษาของนักเรียนไทยโดยไม่ระบุตัวตน ' +
    '(เราไม่เก็บชื่อหรืออีเมลในขั้นนี้) การเข้าร่วมวิจัยเป็นความสมัครใจ ไม่เข้าร่วมก็ใช้เว็บได้เต็มที่เหมือนเดิม',
  checkbox: 'ฉันยินยอมให้ใช้คำตอบของฉันในงานวิจัยที่ไม่ระบุตัวตน (ไม่บังคับ)',
  detailsLabel: 'อ่านรายละเอียด',
  detailsHref: '/privacy',
} as const;
