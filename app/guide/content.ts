// Bilingual copy for /guide. Every string carries both `th` and `en` so the
// page never renders an empty node when a translation is missing.

export interface Bi {
  th: string;
  en: string;
}

export interface CalloutData {
  variant: 'tip' | 'warning' | 'privacy';
  text: Bi;
}

export interface StepSection {
  id: string;
  number: number;
  heading: Bi;
  intro?: Bi;
  listType: 'ordered' | 'unordered' | 'none';
  items?: Bi[];
  outro?: Bi;
  callouts?: CalloutData[];
}

export interface FaqItem {
  q: Bi;
  a: Bi;
}

export interface TroubleshootItem {
  problem: Bi;
  solution: Bi;
}

export const GUIDE_META = {
  title: { th: 'วิธีใช้งาน TunDee', en: 'How to Use TunDee' } as Bi,
  subtitle: {
    th: 'คู่มือฉบับเต็ม ตั้งแต่สมัครสมาชิกจนถึงยื่นใบสมัครทุน ใช้เวลาอ่านประมาณ 6 นาที',
    en: 'A complete walkthrough, from creating an account to submitting your first application. About a 6-minute read.',
  } as Bi,
  intro: {
    th: 'TunDee ไม่ใช่เว็บค้นหาทุน แต่เป็นระบบแนะนำทุนที่เรียนรู้จากข้อมูลของคุณ ยิ่งกรอกโปรไฟล์ครบเท่าไหร่ ทุนที่ระบบแนะนำก็ยิ่งตรงกับคุณมากเท่านั้น ทำตาม 6 ขั้นตอนนี้แล้วคุณจะใช้เว็บได้ครบทุกฟังก์ชัน',
    en: 'TunDee is not a search engine for scholarships — it is a recommendation system that learns from your profile. The more complete your profile, the more accurate your matches. Follow these six steps and you will know how to use every part of the site.',
  } as Bi,
  readTime: { th: '6 นาที', en: '6 min read' } as Bi,
};

export const STEPS: StepSection[] = [
  {
    id: 'step-1-account',
    number: 1,
    heading: { th: 'ขั้นตอนที่ 1 — สมัครสมาชิก', en: 'Step 1 — Create your account' },
    listType: 'ordered',
    items: [
      {
        th: 'กดปุ่ม "เข้าสู่ระบบ" ที่มุมขวาบน (บนมือถือให้กดเมนูสามขีดก่อน)',
        en: 'Tap "Login" in the top right corner. On a phone, open the menu (☰) first.',
      },
      {
        th: 'กรอกอีเมลของคุณ แล้วกด "ส่งลิงก์เข้าสู่ระบบ"',
        en: 'Enter your email address and tap "Send login link."',
      },
      {
        th: 'เปิดกล่องอีเมล คุณจะได้รับอีเมลจาก noreply@tundee.org ภายในไม่กี่นาที',
        en: 'Check your inbox. An email from noreply@tundee.org arrives within a few minutes.',
      },
      {
        th: 'กดลิงก์ในอีเมลนั้น ระบบจะพาคุณกลับมาที่ TunDee และเข้าสู่ระบบให้อัตโนมัติ',
        en: 'Tap the link in that email. You will be returned to TunDee, already logged in.',
      },
    ],
    callouts: [
      {
        variant: 'tip',
        text: {
          th: 'ไม่ต้องจำรหัสผ่าน TunDee ใช้ลิงก์เข้าสู่ระบบทางอีเมล ทุกครั้งที่เข้าใหม่ ให้กรอกอีเมลเดิมแล้วรับลิงก์ใหม่ ถ้าไม่เห็นอีเมล ให้ดูในโฟลเดอร์ Junk หรือ Spam',
          en: 'There is no password to remember. TunDee sends you a login link every time. If the email is not in your inbox, check your Junk or Spam folder.',
        },
      },
    ],
  },
  {
    id: 'step-2-profile',
    number: 2,
    heading: { th: 'ขั้นตอนที่ 2 — ตั้งค่าโปรไฟล์', en: 'Step 2 — Set up your profile' },
    intro: {
      th: 'โปรไฟล์คือหัวใจของ TunDee ระบบใช้ข้อมูลนี้ในการคัดทุนหลายพันทุนให้เหลือเฉพาะทุนที่คุณมีสิทธิ์สมัครจริง ใช้เวลาประมาณ 3 นาที และแก้ไขภายหลังได้ตลอด',
      en: 'Your profile is the engine of TunDee. It is what narrows thousands of scholarships down to the ones you are actually eligible for. It takes about 3 minutes, and you can edit it any time.',
    },
    listType: 'unordered',
    items: [
      {
        th: 'ระดับชั้น (ม.4 / ม.5 / ม.6 หรือระดับมหาวิทยาลัย) — กำหนดว่าทุนไหนเปิดรับคุณในปีนี้',
        en: 'Grade level (M4 / M5 / M6 or university year) — determines which scholarships are open to you this cycle',
      },
      {
        th: 'เกรดเฉลี่ยสะสม (GPAX) — ทุนส่วนใหญ่กำหนดเกรดขั้นต่ำ กรอกตามจริง',
        en: 'Cumulative GPA (GPAX) — most scholarships set a minimum. Enter your real number.',
      },
      {
        th: 'จังหวัด — ทุนจำนวนมากจำกัดเฉพาะบางพื้นที่',
        en: 'Province — many scholarships are restricted to specific regions',
      },
      {
        th: 'ช่วงรายได้ครัวเรือนต่อเดือน — ตัวกรองที่สำคัญที่สุดสำหรับทุนตามความจำเป็น',
        en: 'Monthly household income range — the single most important filter for need-based awards',
      },
      {
        th: 'สาขาที่สนใจเรียนต่อ — เลือกได้มากกว่าหนึ่งสาขา',
        en: 'Fields of study you are interested in — you can select more than one',
      },
      {
        th: 'บัตรสวัสดิการแห่งรัฐ (ถ้ามี) — ไม่บังคับ แต่ช่วยปลดล็อกทุนรัฐจำนวนมาก',
        en: 'Government welfare card (บัตรสวัสดิการแห่งรัฐ), if you have one — optional, but it unlocks a large number of government scholarships',
      },
    ],
    outro: {
      th: 'กดปุ่ม "บันทึกและเริ่มค้นหาทุน →" เมื่อกรอกเสร็จ ระบบจะพาไปหน้าทุนการศึกษาทันที',
      en: 'Tap "Save & Find Scholarships →" when you\'re done. You\'ll be taken straight to the scholarships page.',
    },
    callouts: [
      {
        variant: 'privacy',
        text: {
          th: 'ทำไมต้องถามเรื่องรายได้? เพราะทุนตามความจำเป็นส่วนใหญ่กำหนดเพดานรายได้ครัวเรือน ถ้าไม่กรอก ระบบจะไม่สามารถแนะนำทุนกลุ่มนี้ให้คุณได้เลย ข้อมูลของคุณถูกเก็บเป็นความลับ ไม่เปิดเผยต่อผู้ใช้คนอื่น และไม่ขายให้บุคคลที่สาม เป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) ถ้าคุณอายุต่ำกว่า 18 ปี ควรแจ้งผู้ปกครองก่อนสมัคร',
          en: "Why do we ask about income? Because most need-based scholarships set a household income ceiling. Without it, we cannot recommend that entire category to you. Your answers are private, never shown to other users, and never sold. We follow Thailand's Personal Data Protection Act (PDPA). If you are under 18, tell your parent or guardian before you sign up.",
        },
      },
      {
        variant: 'tip',
        text: {
          th: 'กรอกตามความจริงเสมอ การกรอกเกรดหรือรายได้ให้ดูดีกว่าความจริงจะทำให้ระบบแนะนำทุนที่คุณไม่มีสิทธิ์ และคุณจะเสียเวลาเปล่ากับใบสมัครที่ถูกตัดสิทธิ์ตั้งแต่รอบแรก',
          en: 'Always answer honestly. Inflating your GPA or income will surface scholarships you are not eligible for, and you will waste weeks on applications that get screened out immediately.',
        },
      },
    ],
  },
  {
    id: 'step-3-matches',
    number: 3,
    heading: { th: 'ขั้นตอนที่ 3 — อ่านผลการจับคู่ทุน', en: 'Step 3 — Read your matches' },
    intro: {
      th: 'หลังบันทึกโปรไฟล์ ระบบจะพาคุณไปหน้าทุนการศึกษา ให้กดแท็บ "ทุนที่ตรงกับคุณ" เพื่อดูรายการทุนที่เรียงลำดับตามความเหมาะสมกับคุณ แต่ละการ์ดทุนประกอบด้วย:',
      en: 'After you save your profile, you\'ll land on the scholarships page — tap the "My Matches" tab to see scholarships ranked by fit. Each card shows:',
    },
    listType: 'unordered',
    items: [
      { th: 'ชื่อทุนและหน่วยงานผู้ให้ทุน', en: 'The scholarship name and the funder' },
      { th: 'จำนวนเงินทุน', en: 'The award amount' },
      { th: 'วันปิดรับสมัคร', en: 'The application deadline' },
      {
        th: 'คะแนนความตรง (Match score) — ยิ่งสูงยิ่งตรงกับโปรไฟล์ของคุณ',
        en: 'A match score — higher means a closer fit to your profile',
      },
      {
        th: 'กล่อง "ทำไมทุนนี้ถึงตรงกับคุณ" — บอกเหตุผลเป็นข้อ ๆ เช่น เกรดของคุณผ่านเกณฑ์ขั้นต่ำ หรือ คุณอยู่ในจังหวัดที่ทุนนี้เปิดรับ',
        en: 'A "Why this matched you" panel listing the specific reasons, such as your GPA clearing the minimum, or your province being eligible',
      },
    ],
    outro: {
      th: 'อ่านกล่องเหตุผลก่อนเสมอ ถ้าเหตุผลไม่ตรงกับความจริงของคุณ แปลว่าโปรไฟล์อาจกรอกผิด ให้กลับไปแก้ที่หน้าโปรไฟล์',
      en: 'Always read the reasons panel first. If a reason does not describe you accurately, something in your profile is wrong — go back and fix it.',
    },
    callouts: [
      {
        variant: 'tip',
        text: {
          th: 'TunDee ปรับคะแนนเพื่อความเป็นธรรม นักเรียนในต่างจังหวัดมักสมัครทุนน้อยกว่านักเรียนในกรุงเทพ ทั้งที่โอกาสได้รับทุนใกล้เคียงกัน ระบบจึงถ่วงน้ำหนักเพื่อไม่ให้ประวัติการสมัครที่ไม่เท่าเทียมกลายเป็นอคติในการแนะนำทุน',
          en: 'TunDee adjusts scores for fairness. Students outside Bangkok apply at lower rates than Bangkok students even though their odds of winning are comparable. We reweight the ranking so that an unequal history of applications does not become a bias in what we recommend to you.',
        },
      },
    ],
  },
  {
    id: 'step-4-choose',
    number: 4,
    heading: { th: 'ขั้นตอนที่ 4 — เลือกทุนที่จะสมัคร', en: 'Step 4 — Choose which scholarships to apply for' },
    intro: {
      th: 'อย่าสมัครทุกทุนในรายการ และอย่าสมัครแค่ทุนเดียว แนวทางที่ใช้ได้ผลคือเลือกประมาณ 5–8 ทุน แบ่งเป็น: 1–2 ทุนที่ท้าทาย (ทุนใหญ่ แข่งขันสูง คุณผ่านคุณสมบัติขั้นต่ำพอดี), 3–4 ทุนที่ตรงกับคุณมาก (คะแนนความตรงสูง คุณผ่านเกณฑ์อย่างสบาย), และ 1–2 ทุนที่มีคู่แข่งน้อย (ทุนจากท้องถิ่น มูลนิธิเล็ก หรือทุนเฉพาะจังหวัดของคุณ)',
      en: 'Do not apply to every scholarship on the list, and do not apply to only one. A pattern that works: pick 5–8 and split them — 1–2 reach scholarships (large, competitive, where you just clear the minimum criteria), 3–4 strong fits (high match score, where you comfortably exceed the requirements), and 1–2 low-competition scholarships (local foundations, small funders, or awards restricted to your province).',
    },
    listType: 'ordered',
    items: [
      {
        th: 'ดูวันปิดรับสมัครก่อน ทุนที่ปิดในอีก 10 วันแต่ต้องใช้จดหมายรับรองจากครู อาจไม่ทัน',
        en: 'Check the deadline first. A scholarship closing in 10 days that requires a teacher recommendation letter may not be realistic.',
      },
      {
        th: 'เปิดอ่านรายละเอียดทุน แล้วเช็กคุณสมบัติทุกข้อด้วยตาตัวเอง TunDee ช่วยคัดกรอง แต่ประกาศอย่างเป็นทางการของผู้ให้ทุนคือข้อมูลที่ถูกต้องที่สุดเสมอ',
        en: "Open the scholarship detail page and verify every eligibility line yourself. TunDee filters for you, but the funder's official announcement is always the authority.",
      },
      {
        th: 'ดูรายการเอกสารที่ต้องใช้ ถ้าต้องใช้หนังสือรับรองรายได้จากผู้ใหญ่บ้านหรือ อบต. ให้เริ่มขอตั้งแต่วันนี้ เอกสารราชการใช้เวลาหลายวัน',
        en: 'Look at the required documents. If you need an income certificate from your village head or the local administrative office, start requesting it today — government paperwork takes days.',
      },
      {
        th: 'กดปุ่ม "🔖 บันทึก" บนการ์ดทุน เพื่อเก็บทุนนี้ไว้ในรายการติดตามก่อน แล้วค่อยตัดสินใจทีหลัง',
        en: 'Tap the "🔖 Track" button on the scholarship card to add it to your tracker and decide later.',
      },
    ],
    callouts: [
      {
        variant: 'warning',
        text: {
          th: 'ทุนเล็ก ๆ ที่คนไม่ค่อยรู้จักมักมีโอกาสได้สูงกว่าทุนใหญ่ที่มีคนสมัครหลักหมื่น อย่ามองข้ามทุนจากมูลนิธิท้องถิ่นหรือทุนเฉพาะจังหวัด นี่คือเหตุผลที่ TunDee มีอยู่',
          en: 'Small, low-profile scholarships often have far better odds than the famous ones with tens of thousands of applicants. Do not skip local foundations or province-specific awards — they are exactly the opportunities TunDee exists to surface.',
        },
      },
    ],
  },
  {
    id: 'step-5-track',
    number: 5,
    heading: { th: 'ขั้นตอนที่ 5 — ติดตามสถานะทุนที่คุณสนใจ', en: "Step 5 — Track each scholarship's status" },
    intro: {
      th: 'เมื่อกดปุ่ม "🔖 บันทึก" บนทุนใด ทุนนั้นจะถูกเพิ่มเข้าไปในหน้า "ติดตาม" ของคุณโดยอัตโนมัติ คุณสามารถอัปเดตสถานะ จดบันทึกส่วนตัว และเปิดการแจ้งเตือนได้จากที่เดียว',
      en: 'When you tap "🔖 Track" on a scholarship, it\'s added to your Tracker page automatically. From there you can update its status, add personal notes, and turn on reminders — all in one place.',
    },
    listType: 'ordered',
    items: [
      {
        th: 'เปลี่ยนสถานะทุนตามความคืบหน้าจริง: สนใจ → กำลังสมัคร → ส่งใบแล้ว → ได้รับทุน หรือ ไม่ผ่าน',
        en: 'Update the status as you go: Interested → Applying → Applied → Awarded or Not selected.',
      },
      {
        th: 'เพิ่มบันทึกส่วนตัว เช่น เอกสารที่ยังขาด หรือวันที่นัดขอจดหมายรับรองจากครู',
        en: "Add a personal note — for example, which document you're still missing, or when you asked a teacher for a recommendation letter.",
      },
      {
        th: 'เปิดสวิตช์ "แจ้งเตือน LINE ก่อนหมดเขต" บนทุนที่คุณจริงจัง เพื่อรับข้อความเตือนล่วงหน้า 14 วันและ 1 วันก่อนปิดรับ (ต้องเชื่อมต่อบัญชี LINE ก่อน ดูหัวข้อ "การแจ้งเตือน" ด้านล่าง)',
        en: 'Turn on "LINE deadline reminder" for scholarships you\'re serious about, to get a message 14 days and 1 day before the deadline (you\'ll need to connect your LINE account first — see "Notifications" below).',
      },
      {
        th: 'กดปุ่ม "สมัครทุน" เมื่อพร้อมยื่นใบสมัครจริงบนเว็บไซต์ของผู้ให้ทุน',
        en: "Tap \"Apply\" when you're ready to submit the real application on the funder's own website.",
      },
    ],
    callouts: [
      {
        variant: 'warning',
        text: {
          th: 'TunDee ไม่ได้ส่งใบสมัครแทนคุณ ใบสมัครจริงอยู่บนเว็บไซต์ของผู้ให้ทุน ปุ่ม "สมัครทุน" จะพาคุณไปที่นั่น ถ้าคุณไม่ได้กรอกและกดส่งบนเว็บไซต์ของผู้ให้ทุน แปลว่าคุณยังไม่ได้สมัคร',
          en: "TunDee cannot submit applications for you. The real application form lives on the funder's own website, and the \"Apply\" button takes you there. If you haven't filled in and submitted that form, you haven't applied.",
        },
      },
    ],
  },
  {
    id: 'step-6-outcome',
    number: 6,
    heading: { th: 'ขั้นตอนที่ 6 — เช็กหน้าติดตามและรายงานผล', en: 'Step 6 — Check your tracker and report the outcome' },
    intro: {
      th: 'หน้า "ติดตาม" รวมทุกทุนที่คุณบันทึกไว้ในที่เดียว พร้อมสถานะปัจจุบันและวันปิดรับสมัครที่ใกล้เข้ามา เข้ามาดูสัปดาห์ละครั้ง โดยเฉพาะช่วงใกล้ปิดรับสมัคร',
      en: 'The "Tracker" page collects every scholarship you\'ve saved in one place, along with its current status and upcoming deadline. Check it once a week, and more often as deadlines approach.',
    },
    listType: 'none',
    outro: {
      th: 'เมื่อรู้ผลแล้ว กลับมาเปลี่ยนสถานะเป็น "ได้รับทุน" หรือ "ไม่ผ่าน" ด้วย ไม่ว่าผลจะเป็นอย่างไร ข้อมูลนี้ช่วยให้ทุนดีแนะนำทุนได้แม่นยำขึ้นสำหรับรุ่นน้องคนต่อไป',
      en: "When you hear back, come back and update the status to \"Awarded\" or \"Not selected.\" Win or lose, that data helps TunDee's recommendations get better for the next student.",
    },
  },
];

export const NOTIFICATIONS = {
  id: 'notifications',
  heading: { th: 'การแจ้งเตือน', en: 'Notifications' } as Bi,
  body: {
    th: 'เชื่อมต่อบัญชี LINE ของคุณเพื่อรับข้อความเตือนก่อนวันปิดรับสมัคร ไปที่หน้า "ติดตาม" แล้วกดปุ่ม "เชื่อมต่อ LINE" ในการ์ด "แจ้งเตือนผ่าน LINE" ระบบจะพาไปยืนยันตัวตนผ่านแอป LINE เมื่อเชื่อมต่อสำเร็จ ให้เปิดสวิตช์ "แจ้งเตือน LINE ก่อนหมดเขต" บนทุนแต่ละทุนที่ต้องการรับแจ้งเตือน คุณจะได้รับข้อความ 14 วัน และ 1 วัน ก่อนวันปิดรับสมัคร',
    en: 'Connect your LINE account to get a message before a scholarship\'s deadline. Go to the "Tracker" page and tap "Connect LINE" on the "LINE Reminders" card. You\'ll be taken to LINE to authorize the connection. Once connected, turn on the "LINE deadline reminder" switch on each scholarship you want reminders for. You\'ll get a message 14 days and 1 day before the deadline.',
  } as Bi,
};

export const FAQ_HEADING: Bi = { th: 'คำถามที่พบบ่อย', en: 'Frequently asked questions' };

export const FAQ: FaqItem[] = [
  {
    q: { th: 'ใช้ TunDee ต้องเสียเงินไหม', en: 'Does TunDee cost anything?' },
    a: {
      th: 'ไม่เสีย การค้นหาทุน การจับคู่ และการติดตามสถานะการสมัคร ใช้ได้ฟรีทั้งหมด',
      en: 'No. Matching, browsing, and tracking your applications are all free.',
    },
  },
  {
    q: { th: 'สมัครทุนผ่าน TunDee ได้เลยไหม', en: 'Can I apply for a scholarship directly on TunDee?' },
    a: {
      th: 'ไม่ได้ ใบสมัครอยู่บนเว็บของผู้ให้ทุนแต่ละราย TunDee ช่วยหาทุนที่ใช่ เตือนวันปิดรับ และติดตามความคืบหน้าให้คุณ แต่การกดส่งใบสมัครต้องทำที่เว็บผู้ให้ทุน',
      en: "No. Applications live on each funder's own website. TunDee finds the right scholarships, warns you about deadlines, and tracks your progress — but the submit button is on their site.",
    },
  },
  {
    q: { th: 'ข้อมูลส่วนตัวของฉันปลอดภัยแค่ไหน', en: 'How safe is my personal information?' },
    a: {
      th: 'ข้อมูลของคุณเข้าถึงได้เฉพาะบัญชีของคุณเอง ไม่แสดงต่อผู้ใช้คนอื่น และไม่ขายให้บุคคลที่สาม เราปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
      en: "Only your own account can see your data. It is never shown to other users and never sold. We operate under Thailand's PDPA.",
    },
  },
  {
    q: { th: 'ทำไมระบบแนะนำทุนให้ฉันน้อยจัง', en: 'Why am I only seeing a few matches?' },
    a: {
      th: 'มักเกิดจากโปรไฟล์ยังกรอกไม่ครบ ลองเพิ่มสาขาที่สนใจให้มากขึ้น กรอกช่วงรายได้ และระบุสถานะบัตรสวัสดิการแห่งรัฐ ฐานข้อมูลของเรายังเติบโตขึ้นทุกสัปดาห์ด้วย',
      en: 'Usually an incomplete profile. Add more fields of study, fill in your income range, and set your welfare card status. Our database also grows every week.',
    },
  },
  {
    q: { th: 'ฐานข้อมูลทุนของ TunDee เชื่อถือได้ไหม', en: "Is TunDee's scholarship data reliable?" },
    a: {
      th: 'ทุกทุนในระบบถูกตรวจสอบกับแหล่งข้อมูลต้นทางของผู้ให้ทุน เราไม่สร้างข้อมูลขึ้นเอง แต่ประกาศอย่างเป็นทางการอาจเปลี่ยนแปลงได้ ให้ตรวจสอบที่เว็บผู้ให้ทุนก่อนสมัครเสมอ',
      en: "Every scholarship is verified against the funder's own source. We never invent entries. Official announcements can still change, so always confirm on the funder's site before you apply.",
    },
  },
  {
    q: { th: 'แก้ไขโปรไฟล์ทีหลังได้ไหม', en: 'Can I change my profile later?' },
    a: {
      th: 'ได้ตลอดเวลา เมื่อแก้แล้วระบบจะคำนวณผลการจับคู่ใหม่ทันที ควรอัปเดตเกรดทุกภาคเรียน',
      en: 'Any time. Your matches recalculate immediately. Update your GPA every semester.',
    },
  },
  {
    q: { th: 'อายุต่ำกว่า 18 ปีใช้ได้ไหม', en: 'Can I use TunDee if I am under 18?' },
    a: {
      th: 'ใช้ได้ แต่ควรแจ้งและขอความยินยอมจากผู้ปกครองก่อนสร้างบัญชีและกรอกข้อมูลส่วนตัว',
      en: 'Yes, but tell your parent or guardian and get their consent before you create an account and enter personal information.',
    },
  },
];

export const TROUBLESHOOTING_HEADING: Bi = { th: 'แก้ปัญหาที่พบบ่อย', en: 'Troubleshooting' };

export const TROUBLESHOOTING: TroubleshootItem[] = [
  {
    problem: { th: 'ไม่ได้รับอีเมลลิงก์เข้าสู่ระบบ', en: 'No login email' },
    solution: {
      th: 'ดูในโฟลเดอร์ Junk/Spam รอ 2–3 นาที ตรวจว่าพิมพ์อีเมลถูกต้อง แล้วกดขอลิงก์ใหม่ ลิงก์เก่าจะใช้ไม่ได้หลังขอลิงก์ใหม่',
      en: 'Check Junk/Spam, wait 2–3 minutes, confirm you typed the address correctly, then request a new link. Older links stop working once you request a new one.',
    },
  },
  {
    problem: { th: 'บันทึกโปรไฟล์ไม่ได้', en: 'Profile will not save' },
    solution: {
      th: 'ตรวจว่าช่องบังคับกรอกครบ โดยเฉพาะเกรดเฉลี่ยต้องอยู่ระหว่าง 0.00–4.00 ถ้ายังไม่ได้ ให้ออกจากระบบแล้วเข้าใหม่ผ่านลิงก์อีเมล',
      en: 'Check that all required fields are filled, and that your GPA is between 0.00 and 4.00. If it still fails, log out and log back in with a fresh email link.',
    },
  },
  {
    problem: { th: 'กดลิงก์เว็บผู้ให้ทุนแล้วเปิดไม่ได้', en: "A funder's link does not open" },
    solution: {
      th: 'เว็บของผู้ให้ทุนอาจปิดปรับปรุงหรือเปลี่ยน URL ลองค้นชื่อทุนใน Google และแจ้งเราให้แก้ไขลิงก์',
      en: 'Their site may be down or the URL may have changed. Search the scholarship name on Google, and tell us so we can fix the link.',
    },
  },
  {
    problem: { th: 'เว็บแสดงผลเพี้ยนบนมือถือ', en: 'The site looks broken on mobile' },
    solution: {
      th: 'ลองรีเฟรชหน้า หรือเปิดใน Chrome หรือ Safari รุ่นล่าสุด',
      en: 'Refresh the page, or open it in an up-to-date Chrome or Safari.',
    },
  },
];

export const CLOSING_CTA = {
  text: {
    th: 'พร้อมเริ่มแล้วใช่ไหม ตั้งค่าโปรไฟล์ของคุณแล้วดูว่ามีทุนไหนรอคุณอยู่บ้าง',
    en: 'Ready? Set up your profile and see which scholarships are waiting for you.',
  } as Bi,
  button: { th: 'ตั้งค่าโปรไฟล์', en: 'Set up my profile' } as Bi,
  href: '/auth?from=signup',
};

// Table of contents entries — id must match a StepSection id or one of the
// standalone section ids above.
export const TOC_ENTRIES: { id: string; label: Bi }[] = [
  ...STEPS.map((s) => ({ id: s.id, label: s.heading })),
  { id: NOTIFICATIONS.id, label: NOTIFICATIONS.heading },
  { id: 'faq', label: FAQ_HEADING },
  { id: 'troubleshooting', label: TROUBLESHOOTING_HEADING },
];
