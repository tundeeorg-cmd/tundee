import type { Language } from './types';

export const translations = {
  nav: {
    home: { th: 'หน้าแรก', en: 'Home' },
    search: { th: 'ค้นหาทุน', en: 'Browse Scholarships' },
    about: { th: 'เกี่ยวกับเรา', en: 'About Us' },
    logo_sub: { th: 'ค้นหาทุนการศึกษา', en: 'Scholarship Discovery' },
  },
  hero: {
    headline_th: 'หาทุนที่ใช่\nสำหรับคุณ',
    headline_en: 'Find the scholarship\nyou deserve',
    sub_th: 'ทุนดีรวบรวมทุนการศึกษาไทยกว่า 3,000 ทุน ให้คุณค้นหาได้ฟรี ตรงเป้า และง่ายดาย',
    sub_en: 'TunDee aggregates 3,000+ Thai scholarships so you can find the right one — free, targeted, and simple.',
    cta: { th: 'ค้นหาทุนของคุณ →', en: 'Find Your Scholarship →' },
  },
  stats: {
    scholarships: { th: '3,000+ ทุน', en: '3,000+ Scholarships' },
    provinces: { th: '77 จังหวัด', en: '77 Provinces' },
    free: { th: 'ฟรีตลอด', en: 'Always Free' },
  },
  howItWorks: {
    title: { th: 'วิธีใช้งาน', en: 'How It Works' },
    step1_title: { th: 'ค้นหา', en: 'Search' },
    step1_desc: { th: 'กรองทุนตามเกรด รายได้ จังหวัด และสาขาวิชาของคุณ', en: 'Filter by GPA, income, province, and field of study' },
    step2_title: { th: 'เปรียบเทียบ', en: 'Compare' },
    step2_desc: { th: 'ดูรายละเอียด เงื่อนไข และเอกสารที่ต้องใช้', en: 'View details, requirements, and documents needed' },
    step3_title: { th: 'สมัคร', en: 'Apply' },
    step3_desc: { th: 'ทำตาม 7 ขั้นตอนของเราและสมัครบนเว็บไซต์ทุน', en: 'Follow our 7-step checklist and apply on the funder\'s site' },
  },
  persona: {
    title: { th: 'เรื่องราวของพลอย', en: "Ploy's Story" },
    quote: {
      th: '"ก่อนเจอทุนดี หนูรู้จักทุนแค่ 3 ทุน ตอนนี้หนูได้ทุน กสศ. แล้ว 3,500 บาทต่อเดือน ช่วยแม่ได้มาก"',
      en: '"Before TunDee, I only knew about 3 scholarships. Now I\'ve received the EEF scholarship — 3,500 THB a month. It helps my family so much."',
    },
    name: { th: 'พลอย อายุ 17 ปี จ.สุรินทร์', en: 'Ploy, age 17, Surin Province' },
    detail: {
      th: 'ลูกสาวเกษตรกรชาวนา ค้นพบทุนเสมอภาคผ่านทุนดี ภายใน 10 นาที',
      en: 'Daughter of rice farmers, found the EEF equitable scholarship through TunDee in 10 minutes.',
    },
  },
  featured: {
    title: { th: 'ทุนแนะนำ', en: 'Featured Scholarships' },
    viewAll: { th: 'ดูทุนทั้งหมด →', en: 'View All Scholarships →' },
  },
  browse: {
    title: { th: 'ค้นหาทุนการศึกษา', en: 'Browse Scholarships' },
    subtitle: {
      th: 'กรองจากเงื่อนไขของคุณ เพื่อหาทุนที่ตรงที่สุด',
      en: 'Filter by your eligibility to find the most relevant scholarships',
    },
    filters: { th: 'ตัวกรอง', en: 'Filters' },
    clearFilters: { th: 'ล้างตัวกรอง', en: 'Clear Filters' },
    results: { th: 'ผลการค้นหา', en: 'Results' },
    noResults: { th: 'ไม่พบทุนที่ตรงกับเงื่อนไข', en: 'No scholarships match your filters' },
    noResultsSub: {
      th: 'ลองลดเงื่อนไขการค้นหาหรือล้างตัวกรอง',
      en: 'Try relaxing your filters or clearing all criteria',
    },
    funderType: { th: 'ประเภทผู้ให้ทุน', en: 'Funder Type' },
    funderAll: { th: 'ทั้งหมด', en: 'All Types' },
    minGpa: { th: 'เกรดเฉลี่ยขั้นต่ำ', en: 'Minimum GPA' },
    gpaAny: { th: 'ไม่จำกัด', en: 'Any GPA' },
    fieldOfStudy: { th: 'สาขาวิชา', en: 'Field of Study' },
    fieldAny: { th: 'ทุกสาขา', en: 'Any Field' },
    province: { th: 'จังหวัด', en: 'Province' },
    provinceAll: { th: 'ทั่วประเทศ', en: 'All Provinces' },
    welfareCard: { th: 'บัตรสวัสดิการแห่งรัฐ', en: 'State Welfare Card' },
    welfareCardSub: { th: 'แสดงเฉพาะทุนที่ให้ความสำคัญแก่ผู้ถือบัตร', en: 'Show only scholarships prioritizing card holders' },
  },
  card: {
    viewDetail: { th: 'ดูรายละเอียด →', en: 'View Details →' },
    deadline: { th: 'ปิดรับ', en: 'Deadline' },
    perMonth: { th: 'บาท/เดือน', en: 'THB/month' },
    perYear: { th: 'บาท/ปี', en: 'THB/year' },
    oneTime: { th: 'บาท (ครั้งเดียว)', en: 'THB (one-time)' },
    welfareTag: { th: 'บัตรสวัสดิการ', en: 'Welfare Card' },
    national: { th: 'ทั่วประเทศ', en: 'National' },
    anyField: { th: 'ทุกสาขา', en: 'All Fields' },
  },
  detail: {
    back: { th: '← กลับ', en: '← Back' },
    applyNow: { th: 'สมัครที่เว็บไซต์ทุน →', en: 'Apply at Official Website →' },
    startChecklist: { th: 'เริ่มขั้นตอนการสมัคร', en: 'Start Application Checklist' },
    amount: { th: 'มูลค่าทุน', en: 'Amount' },
    deadline: { th: 'วันปิดรับสมัคร', en: 'Application Deadline' },
    funderType: { th: 'ประเภทผู้ให้ทุน', en: 'Funder Type' },
    eligibility: { th: 'คุณสมบัติที่ต้องการ', en: 'Eligibility Requirements' },
    minGpa: { th: 'เกรดเฉลี่ยขั้นต่ำ', en: 'Minimum GPA' },
    gpaAny: { th: 'ไม่กำหนด', en: 'No minimum' },
    maxIncome: { th: 'รายได้ครอบครัวสูงสุด', en: 'Maximum Family Income' },
    incomeAny: { th: 'ไม่กำหนด', en: 'No limit' },
    provinces: { th: 'จังหวัดที่มีสิทธิ์', en: 'Eligible Provinces' },
    fields: { th: 'สาขาวิชา', en: 'Fields of Study' },
    welfareCard: { th: 'ผู้ถือบัตรสวัสดิการฯ', en: 'Welfare Card Priority' },
    welfareYes: { th: 'ได้รับสิทธิ์พิจารณาก่อน', en: 'Priority given' },
    welfareNo: { th: 'ไม่ได้ระบุ', en: 'Not specified' },
    documents: { th: 'เอกสารที่ต้องใช้', en: 'Required Documents' },
    description: { th: 'รายละเอียดทุน', en: 'Scholarship Details' },
    checklist: { th: '7 ขั้นตอนการสมัครทุน', en: '7-Step Application Guide' },
    checklistSub: {
      th: 'ทำตามขั้นตอนนี้เพื่อให้การสมัครสำเร็จ',
      en: 'Follow these steps to maximise your chances of success',
    },
    noDeadline: { th: 'ติดต่อผู้ให้ทุนโดยตรง', en: 'Contact funder directly' },
    perYear: { th: 'บาท / ปี', en: 'THB / year' },
    perMonth: { th: 'บาท / เดือน', en: 'THB / month' },
    oneTime: { th: 'บาท (ครั้งเดียว)', en: 'THB (one-time)' },
    contactFunder: { th: 'ติดต่อมูลนิธิโดยตรง', en: 'Contact funder directly' },
  },
  funderTypes: {
    government: { th: 'รัฐบาล', en: 'Government' },
    corporate: { th: 'เอกชน', en: 'Corporate' },
    foundation: { th: 'มูลนิธิ', en: 'Foundation' },
    royal: { th: 'ราชสกุล', en: 'Royal' },
    university: { th: 'มหาวิทยาลัย', en: 'University' },
  },
  about: {
    title: { th: 'เกี่ยวกับทุนดี', en: 'About TunDee' },
    mission_label: { th: 'พันธกิจ', en: 'Mission' },
    mission: {
      th: 'ทุนดีเชื่อว่าทุกคนสมควรได้รับโอกาสทางการศึกษา ไม่ว่าจะเกิดมาในครอบครัวไหน จังหวัดไหน หรือฐานะอะไร',
      en: 'TunDee believes everyone deserves access to education regardless of family background, province, or financial status.',
    },
    problem_label: { th: 'ปัญหาที่เราเห็น', en: 'The Problem We See' },
    problem: {
      th: 'นักเรียนไทยในชนบทส่วนใหญ่รู้จักทุนการศึกษาเพียง 2-3 ทุน ทั้งที่ประเทศไทยมีทุนมากกว่า 3,000 ทุน ข้อมูลกระจัดกระจายตามเว็บไซต์หน่วยงานต่าง ๆ ทำให้หลายคนพลาดโอกาสอันมีค่า',
      en: 'Most rural Thai students know of only 2-3 scholarships, yet Thailand has over 3,000 available. Information is scattered across government and private websites, causing thousands of students to miss out every year.',
    },
    solution_label: { th: 'วิธีแก้ปัญหาของเรา', en: 'Our Solution' },
    solution: {
      th: 'ทุนดีรวบรวมข้อมูลทุนการศึกษาไว้ในที่เดียว พร้อมระบบค้นหาที่ตรงเป้าและเป็นภาษาไทย ให้ทุกคนสามารถหาทุนที่เหมาะกับตัวเองได้ฟรีและง่ายดาย',
      en: 'TunDee centralizes scholarship data in one place with a targeted, Thai-first search system — free for everyone.',
    },
    team_label: { th: 'ทีมงาน', en: 'Our Team' },
    roadmap_label: { th: 'แผนการพัฒนา', en: 'Roadmap' },
    roadmap: [
      { th: '2025 Q1: เปิดตัว v1 — ค้นหาและกรองทุน', en: '2025 Q1: Launch v1 — search & filter scholarships' },
      { th: '2025 Q3: เพิ่ม AI จับคู่ทุนอัตโนมัติ', en: '2025 Q3: Add AI-powered scholarship matching' },
      { th: '2025 Q4: ระบบแจ้งเตือนก่อนหมดเขต', en: '2025 Q4: Deadline reminder system' },
      { th: '2026: แอปพลิเคชันมือถือ', en: '2026: Mobile application' },
    ],
  },
  footer: {
    tagline: { th: 'ทุกทุน ทุกโอกาส ในที่เดียว', en: 'Every scholarship. Every opportunity. In one place.' },
    copyright: { th: '© 2025 ทุนดี (TunDee) · tundee.org', en: '© 2025 TunDee · tundee.org' },
    links_title: { th: 'ลิงก์', en: 'Links' },
  },
  common: {
    loading: { th: 'กำลังโหลด...', en: 'Loading...' },
    error: { th: 'เกิดข้อผิดพลาด', en: 'Something went wrong' },
    thb: { th: 'บาท', en: 'THB' },
    national: { th: 'ทั่วประเทศ', en: 'National' },
    anyField: { th: 'ทุกสาขาวิชา', en: 'All fields of study' },
    notSpecified: { th: 'ไม่ระบุ', en: 'Not specified' },
  },
} as const;

export function t(
  key: string,
  lang: Language,
  dict: typeof translations = translations
): string {
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = dict;
  for (const part of parts) {
    node = node?.[part];
    if (node === undefined) return key;
  }
  if (typeof node === 'object' && (node.th || node.en)) {
    return node[lang] ?? node['th'] ?? key;
  }
  return key;
}

export const PROVINCES_TH = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร',
  'ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท',
  'ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง',
  'ตราด','ตาก','นครนายก','นครปฐม','นครพนม',
  'นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส',
  'น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์',
  'ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา',
  'พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์',
  'แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน',
  'ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง',
  'ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย',
  'ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ',
  'สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี',
  'สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย',
  'หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์',
  'อุทัยธานี','อุบลราชธานี',
];

export const FIELDS_OF_STUDY = [
  { th: 'วิศวกรรมศาสตร์', en: 'Engineering' },
  { th: 'วิทยาศาสตร์', en: 'Science' },
  { th: 'แพทยศาสตร์', en: 'Medicine' },
  { th: 'เภสัชศาสตร์', en: 'Pharmacy' },
  { th: 'พยาบาลศาสตร์', en: 'Nursing' },
  { th: 'บริหารธุรกิจ', en: 'Business Administration' },
  { th: 'เศรษฐศาสตร์', en: 'Economics' },
  { th: 'บัญชี', en: 'Accounting' },
  { th: 'เกษตรศาสตร์', en: 'Agriculture' },
  { th: 'สถาปัตยกรรมศาสตร์', en: 'Architecture' },
  { th: 'ครุศาสตร์/ศึกษาศาสตร์', en: 'Education' },
  { th: 'วิทยาการคอมพิวเตอร์', en: 'Computer Science' },
  { th: 'นิติศาสตร์', en: 'Law' },
  { th: 'รัฐศาสตร์', en: 'Political Science' },
  { th: 'สังคมศาสตร์', en: 'Social Sciences' },
];
