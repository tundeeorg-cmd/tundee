/**
 * The research-consent wording shown on /start before the questions, in one place
 * so the study team can review exactly what a visitor reads.
 *
 * DRAFT — NOT APPROVED. ANON_RANDOMIZATION must stay off until the team has
 * approved this text as a rendering of the research consent form
 * (CURRENT_CONSENT_VERSION in lib/research/consentGate.ts) and decided how
 * participants under 18 are handled: /start does not ask age, and a checkbox
 * here is not a guardian's consent. See research/AMENDMENT-*.md.
 *
 * Rules the page follows (PART 2 step 6): the box is NEVER pre-ticked; declining
 * costs nothing — the visitor sees the same scholarships and the baseline ranking
 * and is simply not in the study; no dark pattern.
 */
export const START_CONSENT = {
  heading: 'คำตอบของคุณใช้ทำอะไร',
  body:
    'คำตอบ 3 ข้อนี้ใช้แนะนำทุนให้คุณ และใช้ในงานวิจัยการเข้าถึงทุนการศึกษาของนักเรียนไทยโดยไม่ระบุตัวตน ' +
    '(เราไม่เก็บชื่อหรืออีเมลในขั้นนี้) การเข้าร่วมวิจัยเป็นความสมัครใจ ไม่เข้าร่วมก็ใช้เว็บได้เต็มที่เหมือนเดิม',
  minorNote: 'ถ้าอายุต่ำกว่า 18 ปี ควรบอกผู้ปกครองก่อนเข้าร่วม',
  checkbox: 'ฉันยินยอมให้ใช้คำตอบของฉันในงานวิจัยที่ไม่ระบุตัวตน (ไม่บังคับ)',
  detailsLabel: 'อ่านรายละเอียด',
  detailsHref: '/privacy',
} as const;
