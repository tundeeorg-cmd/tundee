import type { TdFunderType, TdImportReport, TdImportRow, TdLevel, TdStatus } from './types';
import { parseDeadline, parseDeadlineFromDate } from './deadlineParser';

// ── Column header mapping ────────────────────────────────────────────────────
// Maps canonical field names → accepted Excel header strings (case/whitespace-insensitive)
const COLUMN_MAP: Record<string, string[]> = {
  scholarship_id:     ['scholarship id', 'id', 'ทุนid'],
  scholarship_name:   ['scholarship name', 'name', 'ชื่อทุน'],
  funder:             ['funder', 'ผู้ให้ทุน'],
  funder_type:        ['funder type', 'fundertype', 'ประเภทผู้ให้ทุน'],
  level:              ['level', 'ระดับการศึกษา'],
  field_of_study:     ['field of study', 'fieldofstudy', 'สาขาวิชา'],
  award_amount_thb:   ['award amount (thb)', 'award amount', 'amount', 'จำนวนเงิน'],
  region_eligibility: ['region eligibility', 'region', 'ภูมิภาค'],
  targets_low_income: ['targets low-income (y/n)', 'targets low income', 'low income', 'รายได้น้อย'],
  num_recipients:     ['no. of recipients', 'no of recipients', 'recipients', 'จำนวนผู้รับทุน'],
  min_gpa:            ['min gpa', 'mingpa', 'gpa', 'เกรดขั้นต่ำ'],
  income_cap_thb:     ['income cap (thb/yr)', 'income cap', 'รายได้สูงสุด'],
  language:           ['language', 'ภาษา'],
  deadline_raw:       ['deadline', 'วันหมดเขต'],
  status:             ['status', 'สถานะ'],
  application_link:   ['application link', 'link', 'ลิงก์สมัคร'],
  source:             ['source', 'แหล่งข้อมูล'],
  verification_status:['verification status', 'verificationstatus', 'สถานะการตรวจสอบ'],
  last_verified:      ['last verified', 'lastverified', 'ตรวจสอบล่าสุด'],
  notes:              ['notes', 'หมายเหตุ'],
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

function parseYN(v: unknown): boolean {
  const s = str(v).toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
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
  return null; // unknown value — don't violate DB CHECK constraint
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

function normalizeVerificationStatus(v: unknown): string {
  // Only exact case-insensitive "verified" counts as verified
  return str(v);
}

function parseLastVerified(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear() > 2400 ? v.getFullYear() - 543 : v.getFullYear();
    if (y < 2000) return null;
    return `${y}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = str(v);
  if (!s) return null;
  // ISO
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

  // Track scholarship_id occurrences to detect duplicates within the file
  const idCount = new Map<string, number>();

  const rows: TdImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // +1 header, +1 for 1-indexing

    // Map headers → canonical field names
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, val] of Object.entries(raw)) {
      const canon = REVERSE.get(normalizeHeader(rawKey));
      if (canon) mapped[canon] = val;
    }

    // Skip fully-empty rows (no scholarship_id and no scholarship_name)
    const idRaw = str(mapped.scholarship_id);
    const nameRaw = str(mapped.scholarship_name);
    if (!idRaw && !nameRaw) continue;

    // Track duplicate IDs
    if (idRaw) {
      idCount.set(idRaw, (idCount.get(idRaw) ?? 0) + 1);
    }

    // Parse deadline (accepts Date objects from cellDates:true)
    const deadlineRaw = mapped.deadline_raw;
    const deadlineParsed = deadlineRaw instanceof Date
      ? parseDeadlineFromDate(deadlineRaw)
      : parseDeadline(str(deadlineRaw) || null);

    const row: TdImportRow = {
      rowNum,
      scholarship_id:     idRaw,
      scholarship_name:   nameRaw,
      funder:             str(mapped.funder),
      funder_type:        normalizeFunderType(mapped.funder_type),
      level:              normalizeLevel(mapped.level),
      field_of_study:     str(mapped.field_of_study) || null,
      award_amount_thb:   str(mapped.award_amount_thb) || null,
      region_eligibility: str(mapped.region_eligibility) || null,
      targets_low_income: parseYN(mapped.targets_low_income),
      num_recipients:     parseIntOrNull(mapped.num_recipients),
      min_gpa:            parseDecimalOrNull(mapped.min_gpa),
      income_cap_thb:     parseIntOrNull(mapped.income_cap_thb),
      language:           str(mapped.language) || null,
      deadline_raw:       deadlineParsed.deadline_note || null,
      status:             normalizeStatus(mapped.status),
      application_link:   str(mapped.application_link) || null,
      source:             str(mapped.source) || null,
      verification_status: normalizeVerificationStatus(mapped.verification_status) || null,
      last_verified:      parseLastVerified(mapped.last_verified),
      notes:              str(mapped.notes) || null,
      action:             'insert',
      skipReason:         '',
      isDuplicate:        false,
    };

    // Validate required fields
    if (!row.scholarship_id) {
      row.action = 'skip';
      row.skipReason = 'Missing Scholarship ID';
    } else if (!row.scholarship_name) {
      row.action = 'skip';
      row.skipReason = 'Missing Scholarship Name';
    } else if (!row.funder) {
      row.action = 'skip';
      row.skipReason = 'Missing Funder';
    } else if (!row.application_link) {
      row.action = 'skip';
      row.skipReason = 'Missing Application Link';
    } else if (!isValidUrl(row.application_link)) {
      row.action = 'skip';
      row.skipReason = `Application Link is not a valid URL: "${row.application_link}"`;
    } else {
      // Flag free-text error in verification_status (not a recognized status value)
      const verif = (row.verification_status ?? '').toLowerCase().trim();
      const knownVerifValues = ['verified', 'unverified', '', 'auto-extracted (confirm deadline + link)', 'pending'];
      // If it looks like an error message (long text, no known prefix), flag it
      if (verif.length > 60) {
        row.action = 'skip';
        row.skipReason = `Verification Status looks like an error message: "${(row.verification_status ?? '').slice(0, 60)}…"`;
      }
    }

    rows.push(row);
  }

  // Mark duplicate IDs (keep first occurrence, skip rest)
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
        if (!duplicateIds.includes(row.scholarship_id)) {
          duplicateIds.push(row.scholarship_id);
        }
      } else {
        seenIds.add(row.scholarship_id);
      }
    }
  }

  // Determine insert vs update: if the server already has the ID, it'll be an upsert.
  // We don't pre-fetch existing IDs client-side — the server handles upsert.
  // We label everything non-skipped as 'insert' here; the server returns real counts.

  const willInsert = rows.filter(r => r.action === 'insert').length;
  const willSkip = rows.filter(r => r.action === 'skip').length;

  return {
    rows,
    totalRows: rows.length,
    willInsert,
    willUpdate: 0, // server will report actuals
    willSkip,
    duplicateIds,
  };
}
