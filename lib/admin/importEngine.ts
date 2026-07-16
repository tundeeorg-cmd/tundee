import type { Scholarship } from '@/lib/types';

// ── Column aliases: field → accepted header names ────────────────────────────
// Asterisks (*) are stripped from both alias keys and incoming headers during lookup,
// so "name_th*" and "name_th" both resolve to the same canonical field.
const COLUMN_MAP: Record<string, string[]> = {
  name_th:                     ['name_th', 'ชื่อทุน (ภาษาไทย)', 'ชื่อทุน'],
  name_en:                     ['name_en', 'ชื่อทุน (ภาษาอังกฤษ)'],
  funder_name_th:              ['funder_name_th', 'funder', 'ผู้ให้ทุน (ภาษาไทย)', 'ผู้ให้ทุน'],
  funder_name_en:              ['funder_name_en', 'funder_en', 'ผู้ให้ทุน (ภาษาอังกฤษ)'],
  funder_type:                 ['funder_type', 'ประเภทผู้ให้ทุน'],
  amount_thb:                  ['amount_thb', 'จำนวนเงิน (บาท)', 'amount'],
  amount_type:                 ['amount_type', 'รูปแบบทุน'],
  is_loan:                     ['is_loan', 'เงินกู้ (TRUE/FALSE)'],
  min_gpa:                     ['min_gpa', 'เกรดขั้นต่ำ'],
  max_income_thb:              ['max_income_thb', 'รายได้สูงสุด (บาท/เดือน)'],
  welfare_card_priority:       ['welfare_card_priority', 'บัตรสวัสดิการ (TRUE/FALSE)'],
  grade_levels:                ['grade_levels', 'ระดับการศึกษา'],
  field_of_study:              ['field_of_study', 'field_ids', 'สาขาวิชา'],
  province_restriction:        ['province_restriction', 'province_ids', 'จังหวัด'],
  enrolled_university_required:['enrolled_university_required', 'ต้องเป็นนักศึกษาของ'],
  english_level:               ['english_level', 'ระดับภาษาอังกฤษ'],
  english_score_required:      ['english_score_required', 'คะแนนภาษาที่ต้องการ'],
  bond_obligation:             ['bond_obligation', 'มีข้อผูกพัน (TRUE/FALSE)'],
  renewable:                   ['renewable', 'ต่ออายุได้ (TRUE/FALSE)'],
  documents_required:          ['documents_required', 'เอกสารที่ต้องใช้'],
  description_th:              ['description_th', 'คำอธิบาย (ภาษาไทย)'],
  deadline_date:               ['deadline_date', 'วันปิดรับสมัคร'],
  application_url:             ['application_url', 'ลิงก์สมัคร'],
  source_url:                  ['source_url', 'ลิงก์แหล่งข้อมูล'],
  historical_bias_score:       ['historical_bias_score', 'Bias Score (วิจัย)'],
  review_status:               ['review_status'],
  is_active:                   ['is_active', 'แสดงบนเว็บ (TRUE/FALSE)'],
  notes:                       ['notes', 'หมายเหตุ'],
};

// Normalize a header key: lowercase, trim, strip trailing asterisks.
// This lets headers like "name_th*", "funder*", "review_status*" resolve correctly.
function normalizeKey(k: string): string {
  return k.toLowerCase().trim().replace(/\*+/g, '');
}

// Reverse map: normalized alias → canonical field name
function buildReverseMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      m.set(normalizeKey(alias), field);
    }
  }
  return m;
}
const REVERSE = buildReverseMap();

// ── Types ────────────────────────────────────────────────────────────────────
export type ConflictType = 'exact_duplicate' | 'same_name_diff_funder' | 'data_conflict';
export type ParsedAction = 'insert' | 'update' | 'skip';
export type ConflictResolution = 'overwrite' | 'skip';

export interface ParsedRow {
  rowNum: number;
  name_th: string;
  name_en: string | null;
  funder_name_th: string;
  funder_name_en: string | null;
  funder_type: string | null;
  amount_thb: number | null;
  amount_type: string | null;
  is_loan: boolean;
  min_gpa: number | null;
  max_income_thb: number | null;
  welfare_card_priority: boolean;
  grade_levels: string[] | null;
  field_of_study: string[] | null;
  province_restriction: string[] | null;
  enrolled_university_required: string | null;
  english_level: string | null;
  english_score_required: string | null;
  bond_obligation: boolean;
  renewable: boolean | null;
  documents_required: string[] | null;
  description_th: string | null;
  deadline_date: string | null;
  application_url: string | null;
  source_url: string | null;
  historical_bias_score: number;
  review_status: string;
  // Engine metadata
  action: ParsedAction;
  skipReason: string;
  conflictType: ConflictType | null;
  conflictWith: string | null; // existing scholarship id
  conflictResolution: ConflictResolution;
  autoFixed: string[];
  existingId: string | null;
}

export interface ImportParseResult {
  rows: ParsedRow[];
  totalRows: number;
  validCount: number;
  skipCount: number;
  conflictCount: number;
  autoFixCount: number;
}

// ── Auto-fix helpers ─────────────────────────────────────────────────────────

function fixAmountType(raw: unknown): [string | null, string | null] {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return [null, null];
  if (['annual', 'yearly', 'ปีละ', 'ต่อปี', 'ปี', '/ปี'].includes(s)) return ['annual', s !== 'annual' ? `amount_type: "${s}" → "annual"` : null];
  if (['monthly', 'เดือนละ', 'ต่อเดือน', 'เดือน', '/เดือน'].includes(s)) return ['monthly', s !== 'monthly' ? `amount_type: "${s}" → "monthly"` : null];
  if (['once', 'one-time', 'onetime', 'ครั้งเดียว', 'ทุน'].includes(s)) return ['once', s !== 'once' ? `amount_type: "${s}" → "once"` : null];
  if (['full', 'เต็ม', 'เต็มจำนวน', 'ทุนเต็ม'].includes(s)) return ['full', s !== 'full' ? `amount_type: "${s}" → "full"` : null];
  return [s, null]; // pass through
}

function fixFunderType(raw: unknown): [string | null, string | null] {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return [null, null];
  const MAP: Record<string, string> = {
    รัฐบาล: 'government', ราชการ: 'government', government: 'government',
    เอกชน: 'corporate', บริษัท: 'corporate', corporate: 'corporate',
    มูลนิธิ: 'foundation', foundation: 'foundation',
    พระราชทาน: 'royal', ราชวงศ์: 'royal', royal: 'royal',
    มหาวิทยาลัย: 'university', university: 'university',
  };
  const canon = MAP[s];
  if (canon && canon !== s) return [canon, `funder_type: "${s}" → "${canon}"`];
  if (canon) return [canon, null];
  return [s, null];
}

function parseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (['true', 'yes', 'ใช่', '1', 'y', 'จริง'].includes(s)) return true;
  if (['false', 'no', 'ไม่', '0', 'n', 'เท็จ'].includes(s)) return false;
  return null;
}

function parseNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  // Strip Thai baht sign, commas, spaces
  const s = String(raw).replace(/[฿,\s]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseArr(raw: unknown): string[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw)
    .split(/[,،، ]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  // xlsx with cellDates:true returns Date objects
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    const year = y > 2400 ? y - 543 : y;
    return `${year}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const year = parseInt(s.substring(0, 4));
    const rest = s.substring(4);
    return year > 2400 ? `${year - 543}${rest}` : s.substring(0, 10);
  }
  // Slash/dash/dot separated: detect format by part sizes
  const parts = s.split(/[/\-.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    let day: number, month: number, year: number;
    if (a > 31) {
      // YYYY/M/D
      year = a; month = b; day = c;
    } else if (b > 12) {
      // M/D/YYYY — Excel US format (e.g. 9/30/2026)
      month = a; day = b; year = c;
    } else if (c > 31) {
      // D/M/YYYY or M/D/YYYY (ambiguous when b ≤ 12) — assume D/M/YYYY
      day = a; month = b; year = c;
    } else {
      day = a; month = b; year = c;
    }
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    if (!day || !month || !year || month > 12 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseImportFile(
  file: File,
  existingScholarships: Scholarship[]
): Promise<ImportParseResult> {
  const XLSX = await import('xlsx');

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    cellDates: true,
    type: 'array',
  });

  // Use sheet named "Scholarships", otherwise first sheet with "scholarship" in name, otherwise sheet 0
  const sheetName =
    workbook.SheetNames.find(n => n === 'Scholarships') ??
    workbook.SheetNames.find(n => n.toLowerCase().includes('scholarship')) ??
    workbook.SheetNames[0];

  console.log('[Import] All sheets:', workbook.SheetNames, '→ using:', sheetName);

  const sheet = workbook.Sheets[sheetName];

  // Use object-based parse without defval so that rows where ALL cells are empty are omitted.
  // (defval:'' would force-include all 1001 rows in a default Excel sheet.)
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    blankrows: false,
  });

  console.log('[Import] Rows from sheet_to_json:', rawRows.length);
  if (rawRows.length > 0) {
    console.log('[Import] First row keys:', Object.keys(rawRows[0]).slice(0, 8));
  }

  const existingByNameTh = new Map<string, Scholarship>();
  for (const s of existingScholarships) {
    existingByNameTh.set(s.name_th.trim().toLowerCase(), s);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: ParsedRow[] = [];
  let autoFixCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header row

    // Map raw keys → canonical field names; strip * from headers (e.g. "name_th*" → "name_th")
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, val] of Object.entries(raw)) {
      const canon = REVERSE.get(normalizeKey(rawKey));
      if (canon) mapped[canon] = val;
    }

    const nameTh = String(mapped.name_th ?? '').trim();

    // Skip empty rows
    if (!nameTh) continue;

    // Skip Thai-label description row (row 2 in the template)
    if (nameTh.startsWith('ชื่อทุน') || nameTh.includes('จำเป็น')) continue;

    // Skip example rows
    if (nameTh.startsWith('◆')) continue;

    const autoFixed: string[] = [];

    // ── Field parsing with auto-fix ─────────────────────────────────────────

    const [amtType, amtTypeFix] = fixAmountType(mapped.amount_type);
    if (amtTypeFix) { autoFixed.push(amtTypeFix); autoFixCount++; }

    const [funderTypeParsed, funderTypeFix] = fixFunderType(mapped.funder_type);
    if (funderTypeFix) { autoFixed.push(funderTypeFix); autoFixCount++; }

    const deadlineRaw = mapped.deadline_date;
    const deadlineStr = parseDate(deadlineRaw);

    const reviewStatus = String(mapped.review_status ?? '').trim().toLowerCase();
    const isVerified = reviewStatus === 'verified';
    const funderTh = String(mapped.funder_name_th ?? '').trim();
    const welfareRaw = parseBool(mapped.welfare_card_priority);
    const isLoanRaw = parseBool(mapped.is_loan);
    const bondRaw = parseBool(mapped.bond_obligation);
    const renewableRaw = parseBool(mapped.renewable);

    const row: ParsedRow = {
      rowNum,
      name_th: nameTh,
      name_en: String(mapped.name_en ?? '').trim() || null,
      funder_name_th: funderTh,
      funder_name_en: String(mapped.funder_name_en ?? '').trim() || null,
      funder_type: funderTypeParsed,
      amount_thb: parseNum(mapped.amount_thb),
      amount_type: amtType,
      is_loan: isLoanRaw ?? false,
      min_gpa: parseNum(mapped.min_gpa),
      max_income_thb: parseNum(mapped.max_income_thb),
      welfare_card_priority: welfareRaw ?? false,
      grade_levels: parseArr(mapped.grade_levels),
      field_of_study: parseArr(mapped.field_of_study),
      province_restriction: parseArr(mapped.province_restriction),
      enrolled_university_required: String(mapped.enrolled_university_required ?? '').trim() || null,
      english_level: String(mapped.english_level ?? '').trim() || null,
      english_score_required: String(mapped.english_score_required ?? '').trim() || null,
      bond_obligation: bondRaw ?? false,
      renewable: renewableRaw,
      documents_required: parseArr(mapped.documents_required),
      description_th: String(mapped.description_th ?? '').trim() || null,
      deadline_date: deadlineStr,
      application_url: String(mapped.application_url ?? '').trim() || null,
      source_url: String(mapped.source_url ?? '').trim() || null,
      historical_bias_score: parseNum(mapped.historical_bias_score) ?? 0.5,
      review_status: reviewStatus,
      // Engine metadata
      action: 'insert',
      skipReason: '',
      conflictType: null,
      conflictWith: null,
      conflictResolution: 'overwrite',
      autoFixed,
      existingId: null,
    };

    // ── Skip rules ───────────────────────────────────────────────────────────
    if (!isVerified) {
      row.action = 'skip';
      row.skipReason = `review_status = "${reviewStatus}" (need "verified")`;
    } else if (!deadlineStr) {
      row.action = 'skip';
      row.skipReason = 'no deadline_date';
    } else {
      const deadline = new Date(deadlineStr);
      if (deadline < today) {
        row.action = 'skip';
        row.skipReason = `deadline ${deadlineStr} is in the past`;
      }
    }

    // ── Conflict detection (only for rows we'd otherwise import) ─────────────
    if (row.action !== 'skip') {
      const existing = existingByNameTh.get(nameTh.toLowerCase());
      if (existing) {
        row.existingId = existing.id;
        const sameFunder = (existing.funder_name_th ?? '').trim().toLowerCase() === funderTh.toLowerCase();
        const sameAmount = existing.amount_thb === row.amount_thb;
        if (sameFunder && sameAmount) {
          row.conflictType = 'exact_duplicate';
          row.action = 'update';
          row.conflictResolution = 'skip'; // default: skip exact dupes
        } else if (!sameFunder) {
          row.conflictType = 'same_name_diff_funder';
          row.action = 'update';
        } else {
          row.conflictType = 'data_conflict';
          row.action = 'update';
        }
      }
    }

    rows.push(row);
  }

  const validCount = rows.filter(r => r.action !== 'skip').length;
  const skipCount = rows.filter(r => r.action === 'skip').length;
  const conflictCount = rows.filter(r => r.conflictType !== null && r.action !== 'skip').length;

  console.log('[Import] Result — valid:', validCount, 'skip:', skipCount, 'conflicts:', conflictCount, 'autoFix:', autoFixCount);
  if (rows.filter(r => r.action !== 'skip').length > 0) {
    console.log('[Import] First valid row name_th:', rows.find(r => r.action !== 'skip')?.name_th);
  }
  rows.filter(r => r.action === 'skip').forEach(r =>
    console.log(`[Import] Skipped row ${r.rowNum}: ${r.skipReason}`)
  );

  return { rows, totalRows: rows.length, validCount, skipCount, conflictCount, autoFixCount };
}
