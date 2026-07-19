import type {
  TdAwardType,
  TdAwardValueTier,
  TdFunderType,
  TdImportReport,
  TdImportRow,
  TdLevel,
  TdSourceLanguage,
  TdStatus,
} from './types';
import { parseDeadline, parseDeadlineFromDate } from './deadlineParser';

// ── Column header mapping (28-field canonical schema) ────────────────────────
// Maps canonical field names → accepted Excel header strings.
// normalizeHeader() strips leading/trailing whitespace, collapses inner spaces,
// lowercases, and removes trailing asterisks — so e.g. " Award Value Tier " works.
const COLUMN_MAP: Record<string, string[]> = {
  scholarship_id:          ['scholarship id', 'id', 'ทุนid'],
  scholarship_name_en:     ['scholarship name (en)', 'name (en)', 'scholarship name en'],
  scholarship_name_th:     ['scholarship name (th)', 'name (th)', 'scholarship name th'],
  funder_en:               ['funder (en)', 'funder en'],
  funder_th:               ['funder (th)', 'funder th'],
  funder_type:             ['funder type', 'fundertype', 'ประเภทผู้ให้ทุน'],
  level:                   ['level', 'ระดับการศึกษา'],
  field_of_study:          ['field of study', 'fieldofstudy', 'สาขาวิชา'],
  award_value_tier:        ['award value tier', 'value tier', 'tier'],
  award_amount_thb_numeric:['award amount (thb) numeric', 'award amount numeric', 'amount numeric'],
  award_type:              ['award type', 'awardtype'],
  renewable:               ['renewable (y/n)', 'renewable'],
  bond_obligation:         ['bond/obligation (y/n)', 'bond obligation (y/n)', 'bond/obligation', 'bond obligation'],
  region_eligibility:      ['region eligibility', 'region', 'ภูมิภาค'],
  targets_low_income:      ['targets low-income (y/n)', 'targets low income (y/n)', 'targets low income', 'low income', 'รายได้น้อย'],
  welfare_card_priority:   ['welfare card priority (y/n)', 'welfare card priority', 'welfare card'],
  income_cap_thb:          ['income cap (thb/yr)', 'income cap', 'รายได้สูงสุด'],
  num_recipients:          ['no. of recipients', 'no of recipients', 'recipients', 'จำนวนผู้รับทุน'],
  min_gpa:                 ['min gpa', 'mingpa', 'gpa', 'เกรดขั้นต่ำ'],
  english_requirement:     ['english requirement', 'english req'],
  source_language:         ['source language', 'sourcelanguage'],
  deadline_raw:            ['deadline', 'วันหมดเขต'],
  status:                  ['status', 'สถานะ'],
  application_url:         ['application link', 'link', 'apply link', 'ลิงก์สมัคร'],
  source_url:              ['source', 'แหล่งข้อมูล'],
  verification_status:     ['verification status', 'verificationstatus', 'สถานะการตรวจสอบ'],
  last_verified:           ['last verified', 'lastverified', 'ตรวจสอบล่าสุด'],
  notes:                   ['notes', 'หมายเหตุ'],

  // Legacy headers still accepted for backward compatibility (map to deprecated fields)
  scholarship_name:        ['scholarship name', 'name', 'ชื่อทุน'],
  funder:                  ['funder', 'ผู้ให้ทุน'],
  award_amount_thb:        ['award amount (thb)', 'award amount', 'amount', 'จำนวนเงิน'],
  language:                ['language', 'ภาษา'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\*+$/, '');
}

function buildReverseMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      m.set(normalizeHeader(alias), field);
    }
  }
  return m;
}
const REVERSE = buildReverseMap();

// ── Normalizers ──────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function parseYN(v: unknown): boolean | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (s === 'y' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === 'n' || s === 'no'  || s === 'false'|| s === '0') return false;
  return null;
}

function parseYNBool(v: unknown): boolean {
  return parseYN(v) ?? false;
}

function parseIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const n = parseInt(String(v).replace(/[,\s฿]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseDecimalOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function normalizeFunderType(v: unknown): TdFunderType | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (s.includes('thai university') || s === 'university') return 'Thai University';
  if (s.includes('thai government') || s.includes('royal') || s === 'government') return 'Thai Government / Royal';
  if (s.includes('corporate') || s.includes('bank') || s.includes('foundation') || s === 'corporate') return 'Corporate / Bank / Foundation';
  if (s.includes('international')) return 'International (open to Thais)';
  return null;
}

function normalizeLevel(v: unknown): TdLevel | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (s === 'high school' || s === 'highschool' || s === 'secondary') return 'High school';
  if (s === 'undergraduate' || s === 'bachelor' || s === "bachelor's") return 'Undergraduate';
  if (s === "master's" || s === 'masters' || s === 'master') return "Master's";
  if (s === 'phd' || s === 'doctoral' || s === 'doctorate') return 'PhD';
  if (s === 'multiple' || s === 'all' || s === 'various') return 'Multiple';
  return null;
}

function normalizeStatus(v: unknown): TdStatus | null {
  const s = str(v).toLowerCase();
  if (s === 'open') return 'Open';
  if (s === 'recheck') return 'Recheck';
  if (s === 'closed') return 'Closed';
  return null;
}

function normalizeAwardType(v: unknown): TdAwardType | null {
  const s = str(v).toLowerCase();
  if (s === 'once' || s === 'one-time' || s === 'onetime') return 'once';
  if (s === 'annual' || s === 'yearly') return 'annual';
  if (s === 'monthly') return 'monthly';
  if (s === 'full' || s === 'full tuition' || s === 'full-tuition') return 'full';
  return null;
}

function normalizeSourceLanguage(v: unknown): TdSourceLanguage | null {
  const s = str(v).toLowerCase();
  if (s === 'th' || s === 'thai') return 'th';
  if (s === 'en' || s === 'english') return 'en';
  return null;
}

/**
 * Map the raw "Award Value Tier" display string (which may contain ≥, en-dashes,
 * Thai text, etc.) to a normalized code stored in the DB.
 * Blank / unrecognized → null.
 */
export function normalizeAwardValueTier(v: unknown): TdAwardValueTier | null {
  const s = str(v).toLowerCase()
    .replace(/[–—]/g, '-')   // normalize dashes
    .replace(/[≥]/g, '>=')   // normalize ≥
    .trim();
  if (!s) return null;
  if (s.includes('full') && (s.includes('ride') || s.includes('living'))) return 'full_ride';
  if (s.includes('full') && s.includes('tuition') && !s.includes('living')) return 'full_tuition';
  if (s.includes('medium')) return 'medium';
  if (s.includes('large') || s.includes('>=100k') || s.includes('100k')) return 'large';
  if (s.includes('20k') && s.includes('100k')) return 'medium';
  if (s.includes('small') || s.includes('<20k')) return 'small';
  if (s.includes('stipend')) return 'stipend_only';
  return null;
}

function parseLastVerified(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear() > 2400 ? v.getFullYear() - 543 : v.getFullYear();
    if (y < 2000) return null;
    return `${y}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1]);
    return y < 2000 ? null : `${y}-${m[2]}-${m[3]}`;
  }
  return null;
}

function isValidUrl(s: string | null | undefined): boolean {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseTdImportFile(file: File): Promise<TdImportReport> {
  const XLSX = await import('xlsx');

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { cellDates: true, type: 'array' });

  const sheetName =
    wb.SheetNames.find(n => n === 'Scholarships') ??
    wb.SheetNames.find(n => n.toLowerCase().includes('scholarship')) ??
    wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    blankrows: false,
  });

  const idCount = new Map<string, number>();
  const rows: TdImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2;

    // Map headers → canonical field names (case/whitespace insensitive)
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, val] of Object.entries(raw)) {
      const canon = REVERSE.get(normalizeHeader(rawKey));
      if (canon) mapped[canon] = val;
    }

    // Skip fully-empty rows
    const idRaw = str(mapped.scholarship_id);
    const nameEnRaw = str(mapped.scholarship_name_en);
    const nameThRaw = str(mapped.scholarship_name_th);
    const nameLegacy = str(mapped.scholarship_name);
    if (!idRaw && !nameEnRaw && !nameThRaw && !nameLegacy) continue;

    if (idRaw) {
      idCount.set(idRaw, (idCount.get(idRaw) ?? 0) + 1);
    }

    // Resolve bilingual name/funder (canonical takes priority; fall back to legacy)
    const resolvedNameEn = nameEnRaw || nameLegacy || null;
    const resolvedNameTh = nameThRaw || nameLegacy || null;
    const resolvedFunderEn = str(mapped.funder_en) || str(mapped.funder) || null;
    const resolvedFunderTh = str(mapped.funder_th) || str(mapped.funder) || null;

    // Derived backward-compat name/funder (EN preferred, fall back to TH)
    const derivedName = resolvedNameEn ?? resolvedNameTh ?? '';
    const derivedFunder = resolvedFunderEn ?? resolvedFunderTh ?? '';

    // Parse deadline
    const deadlineRaw = mapped.deadline_raw;
    const deadlineParsed = deadlineRaw instanceof Date
      ? parseDeadlineFromDate(deadlineRaw)
      : parseDeadline(str(deadlineRaw) || null);

    // Canonical URL fields
    const applicationUrl = str(mapped.application_url) || str(mapped.application_link) || null;
    const sourceUrl = str(mapped.source_url) || str(mapped.source) || null;

    const row: TdImportRow = {
      rowNum,
      scholarship_id:           idRaw,

      scholarship_name_en:      resolvedNameEn,
      scholarship_name_th:      resolvedNameTh,
      funder_en:                resolvedFunderEn,
      funder_th:                resolvedFunderTh,
      source_language:          normalizeSourceLanguage(mapped.source_language),

      // Backward-compat derived fields
      scholarship_name:         derivedName,
      funder:                   derivedFunder,

      funder_type:              normalizeFunderType(mapped.funder_type),
      level:                    normalizeLevel(mapped.level),
      field_of_study:           str(mapped.field_of_study) || null,

      award_value_tier:         normalizeAwardValueTier(mapped.award_value_tier),
      award_amount_thb_numeric: parseIntOrNull(mapped.award_amount_thb_numeric),
      award_type:               normalizeAwardType(mapped.award_type),
      award_amount_thb:         str(mapped.award_amount_thb) || null,

      renewable:                parseYN(mapped.renewable),
      bond_obligation:          parseYN(mapped.bond_obligation),
      region_eligibility:       str(mapped.region_eligibility) || null,
      targets_low_income:       parseYNBool(mapped.targets_low_income),
      welfare_card_priority:    parseYN(mapped.welfare_card_priority),
      income_cap_thb:           parseIntOrNull(mapped.income_cap_thb),
      num_recipients:           parseIntOrNull(mapped.num_recipients),
      min_gpa:                  parseDecimalOrNull(mapped.min_gpa),
      english_requirement:      str(mapped.english_requirement) || null,

      deadline_raw:             deadlineParsed.deadline_note || str(deadlineRaw) || null,
      deadline_date:            deadlineParsed.deadline_date,
      deadline_is_rolling:      deadlineParsed.deadline_is_rolling,
      deadline_note:            deadlineParsed.deadline_note || null,

      status:                   normalizeStatus(mapped.status),

      application_url:          applicationUrl,
      source_url:               sourceUrl,
      application_link:         applicationUrl,  // kept for API compat
      source:                   sourceUrl,       // kept for API compat

      verification_status:      str(mapped.verification_status) || null,
      last_verified:            parseLastVerified(mapped.last_verified),
      notes:                    str(mapped.notes) || null,

      action:      'insert',
      skipReason:  '',
      isDuplicate: false,
    };

    // Validate required fields
    if (!row.scholarship_id) {
      row.action = 'skip';
      row.skipReason = 'Missing Scholarship ID';
    } else if (!row.scholarship_name_en && !row.scholarship_name_th) {
      row.action = 'skip';
      row.skipReason = 'Missing Scholarship Name (need at least one of EN or TH)';
    } else if (!row.funder_en && !row.funder_th) {
      row.action = 'skip';
      row.skipReason = 'Missing Funder (need at least one of EN or TH)';
    } else if (!row.application_url) {
      row.action = 'skip';
      row.skipReason = 'Missing Application Link';
    } else if (!isValidUrl(row.application_url)) {
      row.action = 'skip';
      row.skipReason = `Application Link is not a valid URL: "${row.application_url}"`;
    } else {
      // Flag free-text error in verification_status
      const verif = (row.verification_status ?? '').toLowerCase().trim();
      if (verif.length > 60) {
        row.action = 'skip';
        row.skipReason = `Verification Status looks like an error message: "${(row.verification_status ?? '').slice(0, 60)}…"`;
      }
    }

    rows.push(row);
  }

  // Mark duplicate IDs within file
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  for (const row of rows) {
    if (!row.scholarship_id) continue;
    const isDup = (idCount.get(row.scholarship_id) ?? 1) > 1;
    if (isDup) {
      if (seenIds.has(row.scholarship_id)) {
        row.isDuplicate = true;
        if (row.action !== 'skip') {
          row.action = 'skip';
          row.skipReason = `Duplicate Scholarship ID "${row.scholarship_id}" within this file`;
        }
        if (!duplicateIds.includes(row.scholarship_id)) duplicateIds.push(row.scholarship_id);
      } else {
        seenIds.add(row.scholarship_id);
      }
    }
  }

  const willInsert = rows.filter(r => r.action === 'insert').length;
  const willSkip   = rows.filter(r => r.action === 'skip').length;

  return {
    rows,
    totalRows:  rows.length,
    willInsert,
    willUpdate: 0,
    willSkip,
    duplicateIds,
  };
}
