/**
 * Pure logic + canonical option lists for the student_profile research form
 * (app/profile/student/page.tsx). Kept in a plain .ts module (no JSX) so it's
 * directly unit-testable, same pattern as lib/formatDate.ts / lib/tracker/display.ts.
 *
 * Canonical values (option `value`s below) must exactly match the CHECK
 * constraints in scripts/20260719_full_research_migration.sql — labels are
 * translated, values are not.
 */

// ─── Provinces (77) — Thai names match public.derive_region()'s CASE list ────
// value = canonical Thai province name stored in student_profile.province.

export interface BilingualOption { value: string; th: string; en: string }

export const PROVINCES: BilingualOption[] = [
  { value: 'กรุงเทพมหานคร', th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  { value: 'สมุทรปราการ', th: 'สมุทรปราการ', en: 'Samut Prakan' },
  { value: 'นนทบุรี', th: 'นนทบุรี', en: 'Nonthaburi' },
  { value: 'ปทุมธานี', th: 'ปทุมธานี', en: 'Pathum Thani' },
  { value: 'พระนครศรีอยุธยา', th: 'พระนครศรีอยุธยา', en: 'Ayutthaya' },
  { value: 'อ่างทอง', th: 'อ่างทอง', en: 'Ang Thong' },
  { value: 'ลพบุรี', th: 'ลพบุรี', en: 'Lop Buri' },
  { value: 'สิงห์บุรี', th: 'สิงห์บุรี', en: 'Sing Buri' },
  { value: 'ชัยนาท', th: 'ชัยนาท', en: 'Chai Nat' },
  { value: 'สระบุรี', th: 'สระบุรี', en: 'Saraburi' },
  { value: 'ชลบุรี', th: 'ชลบุรี', en: 'Chon Buri' },
  { value: 'ระยอง', th: 'ระยอง', en: 'Rayong' },
  { value: 'จันทบุรี', th: 'จันทบุรี', en: 'Chanthaburi' },
  { value: 'ตราด', th: 'ตราด', en: 'Trat' },
  { value: 'ฉะเชิงเทรา', th: 'ฉะเชิงเทรา', en: 'Chachoengsao' },
  { value: 'ปราจีนบุรี', th: 'ปราจีนบุรี', en: 'Prachin Buri' },
  { value: 'นครนายก', th: 'นครนายก', en: 'Nakhon Nayok' },
  { value: 'สระแก้ว', th: 'สระแก้ว', en: 'Sa Kaeo' },
  { value: 'นครราชสีมา', th: 'นครราชสีมา', en: 'Nakhon Ratchasima' },
  { value: 'บุรีรัมย์', th: 'บุรีรัมย์', en: 'Buri Ram' },
  { value: 'สุรินทร์', th: 'สุรินทร์', en: 'Surin' },
  { value: 'ศรีสะเกษ', th: 'ศรีสะเกษ', en: 'Si Sa Ket' },
  { value: 'อุบลราชธานี', th: 'อุบลราชธานี', en: 'Ubon Ratchathani' },
  { value: 'ยโสธร', th: 'ยโสธร', en: 'Yasothon' },
  { value: 'ชัยภูมิ', th: 'ชัยภูมิ', en: 'Chaiyaphum' },
  { value: 'อำนาจเจริญ', th: 'อำนาจเจริญ', en: 'Amnat Charoen' },
  { value: 'บึงกาฬ', th: 'บึงกาฬ', en: 'Bueng Kan' },
  { value: 'หนองบัวลำภู', th: 'หนองบัวลำภู', en: 'Nong Bua Lam Phu' },
  { value: 'ขอนแก่น', th: 'ขอนแก่น', en: 'Khon Kaen' },
  { value: 'อุดรธานี', th: 'อุดรธานี', en: 'Udon Thani' },
  { value: 'เลย', th: 'เลย', en: 'Loei' },
  { value: 'หนองคาย', th: 'หนองคาย', en: 'Nong Khai' },
  { value: 'มหาสารคาม', th: 'มหาสารคาม', en: 'Maha Sarakham' },
  { value: 'ร้อยเอ็ด', th: 'ร้อยเอ็ด', en: 'Roi Et' },
  { value: 'กาฬสินธุ์', th: 'กาฬสินธุ์', en: 'Kalasin' },
  { value: 'สกลนคร', th: 'สกลนคร', en: 'Sakon Nakhon' },
  { value: 'นครพนม', th: 'นครพนม', en: 'Nakhon Phanom' },
  { value: 'มุกดาหาร', th: 'มุกดาหาร', en: 'Mukdahan' },
  { value: 'เชียงใหม่', th: 'เชียงใหม่', en: 'Chiang Mai' },
  { value: 'ลำพูน', th: 'ลำพูน', en: 'Lamphun' },
  { value: 'ลำปาง', th: 'ลำปาง', en: 'Lampang' },
  { value: 'อุตรดิตถ์', th: 'อุตรดิตถ์', en: 'Uttaradit' },
  { value: 'แพร่', th: 'แพร่', en: 'Phrae' },
  { value: 'น่าน', th: 'น่าน', en: 'Nan' },
  { value: 'พะเยา', th: 'พะเยา', en: 'Phayao' },
  { value: 'เชียงราย', th: 'เชียงราย', en: 'Chiang Rai' },
  { value: 'แม่ฮ่องสอน', th: 'แม่ฮ่องสอน', en: 'Mae Hong Son' },
  { value: 'นครสวรรค์', th: 'นครสวรรค์', en: 'Nakhon Sawan' },
  { value: 'อุทัยธานี', th: 'อุทัยธานี', en: 'Uthai Thani' },
  { value: 'กำแพงเพชร', th: 'กำแพงเพชร', en: 'Kamphaeng Phet' },
  { value: 'ตาก', th: 'ตาก', en: 'Tak' },
  { value: 'สุโขทัย', th: 'สุโขทัย', en: 'Sukhothai' },
  { value: 'พิษณุโลก', th: 'พิษณุโลก', en: 'Phitsanulok' },
  { value: 'พิจิตร', th: 'พิจิตร', en: 'Phichit' },
  { value: 'เพชรบูรณ์', th: 'เพชรบูรณ์', en: 'Phetchabun' },
  { value: 'ราชบุรี', th: 'ราชบุรี', en: 'Ratchaburi' },
  { value: 'กาญจนบุรี', th: 'กาญจนบุรี', en: 'Kanchanaburi' },
  { value: 'สุพรรณบุรี', th: 'สุพรรณบุรี', en: 'Suphan Buri' },
  { value: 'นครปฐม', th: 'นครปฐม', en: 'Nakhon Pathom' },
  { value: 'สมุทรสาคร', th: 'สมุทรสาคร', en: 'Samut Sakhon' },
  { value: 'สมุทรสงคราม', th: 'สมุทรสงคราม', en: 'Samut Songkhram' },
  { value: 'เพชรบุรี', th: 'เพชรบุรี', en: 'Phetchaburi' },
  { value: 'ประจวบคีรีขันธ์', th: 'ประจวบคีรีขันธ์', en: 'Prachuap Khiri Khan' },
  { value: 'นครศรีธรรมราช', th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat' },
  { value: 'กระบี่', th: 'กระบี่', en: 'Krabi' },
  { value: 'พังงา', th: 'พังงา', en: 'Phangnga' },
  { value: 'ภูเก็ต', th: 'ภูเก็ต', en: 'Phuket' },
  { value: 'สุราษฎร์ธานี', th: 'สุราษฎร์ธานี', en: 'Surat Thani' },
  { value: 'ระนอง', th: 'ระนอง', en: 'Ranong' },
  { value: 'ชุมพร', th: 'ชุมพร', en: 'Chumphon' },
  { value: 'สงขลา', th: 'สงขลา', en: 'Songkhla' },
  { value: 'สตูล', th: 'สตูล', en: 'Satun' },
  { value: 'ตรัง', th: 'ตรัง', en: 'Trang' },
  { value: 'พัทลุง', th: 'พัทลุง', en: 'Phatthalung' },
  { value: 'ปัตตานี', th: 'ปัตตานี', en: 'Pattani' },
  { value: 'ยะลา', th: 'ยะลา', en: 'Yala' },
  { value: 'นราธิวาส', th: 'นราธิวาส', en: 'Narathiwat' },
];

/**
 * Client-side mirror of public.derive_region() (scripts/20260719_full_research_migration.sql)
 * — gives instant "ภาค: ..." feedback without waiting on the DB's GENERATED column.
 * The DB value is always authoritative; this is presentation-only.
 */
const REGION_MAP: Record<string, string> = {};
(function buildRegionMap() {
  const groups: [string, string[]][] = [
    ['Bangkok', ['กรุงเทพมหานคร']],
    ['Central', ['นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'สระบุรี', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'อ่างทอง', 'นครนายก', 'ปราจีนบุรี', 'สระแก้ว']],
    ['North', ['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'พะเยา', 'แพร่', 'น่าน', 'อุตรดิตถ์', 'ตาก', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร', 'กำแพงเพชร', 'นครสวรรค์', 'เพชรบูรณ์', 'อุทัยธานี']],
    ['Northeast', ['นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'อุบลราชธานี', 'ยโสธร', 'ชัยภูมิ', 'อำนาจเจริญ', 'หนองบัวลำภู', 'ขอนแก่น', 'อุดรธานี', 'เลย', 'หนองคาย', 'มหาสารคาม', 'ร้อยเอ็ด', 'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร', 'บึงกาฬ']],
    ['South', ['นครศรีธรรมราช', 'สุราษฎร์ธานี', 'ภูเก็ต', 'พังงา', 'กระบี่', 'ตรัง', 'พัทลุง', 'สงขลา', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส', 'ชุมพร', 'ระนอง']],
    ['East', ['ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'สมุทรปราการ']],
    ['West', ['กาญจนบุรี', 'สุพรรณบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์', 'สมุทรสาคร', 'สมุทรสงคราม', 'นครปฐม']],
  ];
  for (const [region, provinces] of groups) {
    for (const p of provinces) REGION_MAP[p] = region;
  }
})();

const REGION_LABEL: Record<string, { th: string; en: string }> = {
  Bangkok:   { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  Central:   { th: 'ภาคกลาง', en: 'Central' },
  North:     { th: 'ภาคเหนือ', en: 'North' },
  Northeast: { th: 'ภาคอีสาน', en: 'Northeast' },
  South:     { th: 'ภาคใต้', en: 'South' },
  East:      { th: 'ภาคตะวันออก', en: 'East' },
  West:      { th: 'ภาคตะวันตก', en: 'West' },
  Other:     { th: 'อื่นๆ', en: 'Other' },
};

export function deriveRegion(province: string): string {
  return REGION_MAP[province] ?? 'Other';
}

export function regionLabel(region: string, lang: string): string {
  const l = REGION_LABEL[region] ?? REGION_LABEL.Other;
  return lang === 'th' ? l.th : l.en;
}

// ─── Option lists (values match student_profile CHECK constraints exactly) ───

export const AREA_TYPES: BilingualOption[] = [
  { value: 'urban',      th: 'เมือง / ในเขตเทศบาล', en: 'Urban / municipal' },
  { value: 'peri_urban', th: 'ชานเมือง',            en: 'Peri-urban / suburban' },
  { value: 'rural',      th: 'ชนบท / นอกเขตเทศบาล', en: 'Rural / outside municipal' },
];

/** v3 human-readable bands (canonical going forward; v2 band_1..7 kept only for reading older rows). */
export const INCOME_BANDS: BilingualOption[] = [
  { value: '<100k',    th: 'น้อยกว่า ฿100,000 / ปี',       en: '< ฿100,000 / year' },
  { value: '100-200k', th: '฿100,000 – ฿200,000 / ปี',      en: '฿100k – ฿200k / year' },
  { value: '200-360k', th: '฿200,000 – ฿360,000 / ปี',      en: '฿200k – ฿360k / year' },
  { value: '360-600k', th: '฿360,000 – ฿600,000 / ปี',      en: '฿360k – ฿600k / year' },
  { value: '600k+',    th: 'มากกว่า ฿600,000 / ปี',         en: '> ฿600,000 / year' },
  { value: 'unknown',  th: 'ไม่ทราบ / ไม่ขอระบุ',           en: 'Unknown / prefer not to say' },
];

export const SCHOOL_TYPES: BilingualOption[] = [
  { value: 'government',    th: 'รัฐบาล',        en: 'Government' },
  { value: 'private',       th: 'เอกชน',         en: 'Private' },
  { value: 'international', th: 'นานาชาติ',       en: 'International' },
  { value: 'vocational',    th: 'อาชีวศึกษา',     en: 'Vocational' },
  { value: 'home_school',   th: 'เรียนที่บ้าน',   en: 'Home school' },
  { value: 'other',         th: 'อื่นๆ',          en: 'Other' },
];

export const PARENT_EDUCATION: BilingualOption[] = [
  { value: 'none',       th: 'ไม่ได้เรียน',              en: 'No formal education' },
  { value: 'primary',    th: 'ประถมศึกษา',               en: 'Primary school' },
  { value: 'secondary',  th: 'มัธยมศึกษา',                en: 'Secondary school' },
  { value: 'vocational', th: 'ปวช./ปวส.',                 en: 'Vocational certificate' },
  { value: 'bachelor',   th: 'ปริญญาตรี',                 en: "Bachelor's degree" },
  { value: 'postgrad',   th: 'ปริญญาโท/เอก',              en: 'Postgraduate degree' },
  { value: 'unknown',    th: 'ไม่ทราบ',                   en: 'Unknown' },
];

export const INTENDED_LEVELS: BilingualOption[] = [
  { value: 'high_school',            th: 'มัธยมศึกษา',   en: 'High school' },
  { value: 'vocational_certificate', th: 'ปวช./ปวส.',    en: 'Vocational certificate' },
  { value: 'associate_degree',       th: 'อนุปริญญา',    en: 'Associate degree' },
  { value: 'bachelor',               th: 'ปริญญาตรี',    en: "Bachelor's" },
  { value: 'master',                 th: 'ปริญญาโท',     en: "Master's" },
  { value: 'phd',                    th: 'ปริญญาเอก',    en: 'PhD' },
];

/** Same taxonomy used by /profile (fields_of_interest) and TdScholarshipCard, so intended_field stays canonical across the app. */
export const INTENDED_FIELDS: BilingualOption[] = [
  { value: 'engineering',      th: 'วิศวกรรมศาสตร์',      en: 'Engineering' },
  { value: 'medicine',         th: 'แพทยศาสตร์',          en: 'Medicine' },
  { value: 'science',          th: 'วิทยาศาสตร์',         en: 'Science' },
  { value: 'business',         th: 'บริหารธุรกิจ',        en: 'Business' },
  { value: 'computer_science', th: 'วิทยาการคอมพิวเตอร์', en: 'Computer Science' },
  { value: 'data_science',     th: 'วิทยาศาสตร์ข้อมูล',   en: 'Data Science' },
  { value: 'agriculture',      th: 'เกษตรศาสตร์',         en: 'Agriculture' },
  { value: 'education',        th: 'ศึกษาศาสตร์',         en: 'Education' },
  { value: 'law',              th: 'นิติศาสตร์',          en: 'Law' },
  { value: 'arts',             th: 'ศิลปะ',               en: 'Arts' },
];

export const LANGUAGE_PREFS: BilingualOption[] = [
  { value: 'th',    th: 'ภาษาไทยเท่านั้น',      en: 'Thai only' },
  { value: 'en',    th: 'ภาษาอังกฤษเท่านั้น',   en: 'English only' },
  { value: 'th_en', th: 'ทั้งสองภาษา',          en: 'Both Thai & English' },
];

/** Mirrors TdAwardValueTier — same canonical values used across scholarship cards. */
export const SCHOLARSHIP_TYPE_PREFS: BilingualOption[] = [
  { value: 'full_ride',    th: 'ทุนเต็มจำนวน',        en: 'Full-ride' },
  { value: 'full_tuition', th: 'ค่าเล่าเรียนเต็มจำนวน', en: 'Full-tuition' },
  { value: 'large',        th: 'ทุนขนาดใหญ่ (≥100k)',  en: 'Large (≥100k)' },
  { value: 'medium',       th: 'ทุนขนาดกลาง',         en: 'Medium' },
  { value: 'small',        th: 'ทุนขนาดเล็ก',         en: 'Small' },
  { value: 'stipend_only', th: 'ค่าครองชีพ/เบี้ยเลี้ยง', en: 'Stipend only' },
];

// ─── Age / minor / consent helpers ─────────────────────────────────────────

/** birth_year CHECK constraint on student_profile: BETWEEN 1990 AND 2015. */
export const BIRTH_YEAR_MIN = 1990;
export const BIRTH_YEAR_MAX = 2015;

export function computeAge(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}

export function isMinor(birthYear: number | null, now: Date = new Date()): boolean {
  if (birthYear === null || Number.isNaN(birthYear)) return false;
  return computeAge(birthYear, now) < 18;
}

// ─── Validators — return a localized error message, or null if valid ────────

export function validateGpa(gpaStr: string, lang: string): string | null {
  if (!gpaStr.trim()) return null;
  const n = parseFloat(gpaStr);
  if (Number.isNaN(n) || n < 0 || n > 4) {
    return lang === 'th' ? 'เกรดเฉลี่ยต้องอยู่ระหว่าง 0.00 – 4.00' : 'GPA must be between 0.00 and 4.00';
  }
  return null;
}

export function validateBirthYear(yearStr: string, lang: string): string | null {
  if (!yearStr.trim()) return null;
  const n = parseInt(yearStr, 10);
  if (Number.isNaN(n) || n < BIRTH_YEAR_MIN || n > BIRTH_YEAR_MAX) {
    return lang === 'th'
      ? `ปีเกิดต้องอยู่ระหว่าง ${BIRTH_YEAR_MIN} – ${BIRTH_YEAR_MAX}`
      : `Birth year must be between ${BIRTH_YEAR_MIN} and ${BIRTH_YEAR_MAX}`;
  }
  return null;
}

export function validateMonthlyIncome(v: string, lang: string): string | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) {
    return lang === 'th' ? 'รายได้ต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0' : 'Income must be a number ≥ 0';
  }
  return null;
}

export function validateClassRankPct(v: string, lang: string): string | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    return lang === 'th' ? 'ต้องอยู่ระหว่าง 0 – 100' : 'Must be between 0 and 100';
  }
  return null;
}

export function validateHouseholdSize(v: string, lang: string): string | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 1 || n > 30 || !Number.isInteger(n)) {
    return lang === 'th' ? 'จำนวนสมาชิกในครัวเรือนไม่ถูกต้อง' : 'Household size looks invalid';
  }
  return null;
}

// ─── Profile completeness ────────────────────────────────────────────────────
// Boolean fields with a false default (welfare_card) are excluded — a default
// "false" can't be distinguished from "never answered," so counting it would
// understate real completeness for anyone who hasn't touched the toggle.

export interface CompletenessInput {
  province: string;
  area_type: string;
  household_income_band: string;
  school_type: string;
  school_province: string;
  gpa: string;
  intended_level: string;
  intended_field: string;
  birth_year: string;
  gender: string;
  monthly_income_thb: string;
  parent_education: string;
  household_size: string;
  class_rank_pct: string;
  disability_status: string;
  first_generation: boolean | null;
  preferred_scholarship_types: string[];
}

const COMPLETENESS_FIELD_COUNT = 17;

export function computeCompleteness(f: CompletenessInput): number {
  let filled = 0;
  if (f.province.trim()) filled++;
  if (f.area_type.trim()) filled++;
  if (f.household_income_band.trim()) filled++;
  if (f.school_type.trim()) filled++;
  if (f.school_province.trim()) filled++;
  if (f.gpa.trim()) filled++;
  if (f.intended_level.trim()) filled++;
  if (f.intended_field.trim()) filled++;
  if (f.birth_year.trim()) filled++;
  if (f.gender.trim()) filled++;
  if (f.monthly_income_thb.trim()) filled++;
  if (f.parent_education.trim()) filled++;
  if (f.household_size.trim()) filled++;
  if (f.class_rank_pct.trim()) filled++;
  if (f.disability_status.trim()) filled++;
  if (f.first_generation !== null) filled++;
  if (f.preferred_scholarship_types.length > 0) filled++;
  return Math.round((filled / COMPLETENESS_FIELD_COUNT) * 100);
}
