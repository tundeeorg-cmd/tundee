/**
 * POST /api/admin/import
 *
 * Accepts a multipart/form-data upload:
 *   file     — .csv (UTF-8, BOM-OK) or .xlsx
 *   dry_run  — "true" (default) | "false"
 *
 * Returns ImportSummary JSON (see lib/import-types.ts).
 *
 * Safety guarantees:
 *  • Only rows with review_status == "verified" AND a future deadline are written.
 *  • is_active = true on every upserted row → passes the existing RLS gate.
 *  • Existing verified gate (Public read, USING is_active IS NOT FALSE) is UNCHANGED.
 *  • Uses SUPABASE_SERVICE_ROLE_KEY for writes (bypasses RLS — server-only, never sent
 *    to the browser). Anon key is used only for session auth verification.
 *  • dry_run=true (the default) never touches the database.
 *
 * Dependencies (run in project root before first use):
 *   npm install papaparse xlsx @types/papaparse
 */

export const runtime = 'nodejs'

import { NextResponse }              from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient }               from '@supabase/supabase-js'
import type { ImportRowResult, ImportSummary } from '@/lib/import-types'

// ─── lazy-load parse libraries (avoids breaking the build if not yet installed) ──
async function loadPapa() {
  try {
    const mod = await import('papaparse')
    return mod.default ?? mod
  } catch {
    throw new Error('papaparse is not installed. Run: npm install papaparse @types/papaparse')
  }
}
async function loadXLSX() {
  try {
    return await import('xlsx')
  } catch {
    throw new Error('xlsx is not installed. Run: npm install xlsx')
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

/** Known field_of_study values. Unrecognized values are flagged but kept. */
const KNOWN_FIELDS = new Set([
  'any', 'วิทยาศาสตร์', 'วิศวกรรมศาสตร์', 'แพทยศาสตร์', 'พยาบาลศาสตร์',
  'เกษตรศาสตร์', 'บริหารธุรกิจ', 'ครุศาสตร์', 'ศิลปศาสตร์', 'นิติศาสตร์',
  'เภสัชศาสตร์', 'สถาปัตยกรรมศาสตร์', 'เทคโนโลยีสารสนเทศ', 'สังคมศาสตร์',
  'มนุษยศาสตร์', 'วิทยาศาสตร์สุขภาพ', 'ทันตแพทยศาสตร์', 'สัตวแพทยศาสตร์',
])

/** Accepted province values. "national" = no restriction. */
const KNOWN_PROVINCES = new Set([
  'national',
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร',
  'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
  'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง',
  'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
  'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส',
  'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พระแสง',
  'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่',
  'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร',
  'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ',
  'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม',
  'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย',
  'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
  'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
])

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function makeDedupeKey(funder: string, nameTh: string): string {
  return normalize(funder) + '||' + normalize(nameTh)
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false
  return ['true', '1', 'yes'].includes(v.trim().toLowerCase())
}

function parseNum(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = parseFloat(v.trim())
  return isNaN(n) ? null : n
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = globalThis.parseInt(v.trim(), 10)
  return isNaN(n) ? null : n
}

/**
 * Parse a comma-separated (or semicolon-separated) list.
 * "any"      → ['any']
 * "national" → ['national']
 * blank      → null
 */
function parseArray(v: string | undefined): string[] | null {
  if (!v || v.trim() === '') return null
  const items = v.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  return items.length > 0 ? items : null
}

/**
 * Naive Thai → English name generation.
 * Tries a small lookup table of common funders; returns null for anything unknown.
 * This is display-only — matching never depends on name_en.
 */
function tryGenerateNameEn(nameTh: string, funder: string): string | null {
  const knownFunders: Record<string, string> = {
    'กสศ.': 'EEF',
    'กองทุนเพื่อความเสมอภาคทางการศึกษา': 'Equitable Education Fund',
    'กยศ.': 'Student Loan Fund',
    'กองทุนเงินให้กู้ยืมเพื่อการศึกษา': 'Student Loan Fund',
    'สำนักงาน ก.พ.': 'OCSC',
    'มหาวิทยาลัยเชียงใหม่': 'Chiang Mai University',
    'จุฬาลงกรณ์มหาวิทยาลัย': 'Chulalongkorn University',
    'มหาวิทยาลัยมหิดล': 'Mahidol University',
    'สวทช.': 'NSTDA',
  }
  for (const [th, en] of Object.entries(knownFunders)) {
    if (funder.includes(th)) return `${nameTh} (${en})`
  }
  return null
}

function nextReviewDate(deadlineDate: string): string {
  const deadline  = new Date(deadlineDate)
  const today     = new Date()
  const daysLeft  = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000)
  const review    = new Date()
  review.setDate(review.getDate() + (daysLeft <= 30 ? 7 : 90))
  return review.toISOString()
}

// ─── CSV / XLSX → raw rows ────────────────────────────────────────────────────

async function parseFile(
  buffer: Buffer,
  filename: string,
): Promise<Record<string, string>[]> {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await loadXLSX()
    const wb   = XLSX.read(buffer, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    // sheet_to_json with defval '' ensures every cell is a string (not undefined)
    return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
  }

  // Default: CSV
  const Papa = await loadPapa()
  // Strip UTF-8 BOM if present
  const text = buffer.toString('utf-8').replace(/^﻿/, '')
  const { data } = Papa.parse<Record<string, string>>(text, {
    header:         true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })
  return data
}

// ─── main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── 1. Auth check ───────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!session || !adminEmail || session.user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse form data ──────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }
  const fileEntry = formData.get('file')
  const dryRun    = formData.get('dry_run') !== 'false'   // default: true

  if (!fileEntry || typeof fileEntry === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  const file   = fileEntry as File
  const buffer = Buffer.from(await file.arrayBuffer())

  // ── 3. Parse file ───────────────────────────────────────────────────────────
  let rawRows: Record<string, string>[]
  try {
    rawRows = await parseFile(buffer, file.name)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `File parse error: ${msg}` }, { status: 400 })
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 })
  }

  // ── 4. Load existing dedupe_keys (to classify insert vs update) ────────────
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: existingRows, error: fetchErr } = await adminClient
    .from('scholarships')
    .select('dedupe_key, name_en')
  if (fetchErr) {
    return NextResponse.json(
      { error: `DB fetch error: ${fetchErr.message}` },
      { status: 500 },
    )
  }
  const existingMap = new Map<string, string | null>()
  for (const row of existingRows ?? []) {
    if (row.dedupe_key) existingMap.set(row.dedupe_key, row.name_en ?? null)
  }

  // ── 5. Process each row ─────────────────────────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const summary: ImportSummary = {
    dry_run:                dryRun,
    inserted:               0,
    updated:                0,
    skipped_not_verified:   0,
    skipped_past_deadline:  0,
    skipped_no_deadline:    0,
    skipped_invalid:        0,
    translated:             0,
    rows:                   [],
  }

  // Rows that pass all checks — queued for upsert
  const toUpsert: Array<{
    payload: Record<string, unknown>
    action:  'insert' | 'update'
    rowResult: ImportRowResult
  }> = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw      = rawRows[i]
    const rowNum   = i + 2    // 1 = header, data starts at 2
    const nameTh   = (raw['name_th']  ?? '').trim()
    const funder   = (raw['funder']   ?? '').trim()
    const flags: string[] = []

    const result: ImportRowResult = {
      row:       rowNum,
      name_th:   nameTh  || '(blank)',
      funder:    funder  || '(blank)',
      dedupe_key: makeDedupeKey(funder, nameTh),
      action:    'skip',
      flags,
    }

    // ── Rule 2: review_status filter ─────────────────────────────────────────
    const reviewStatus = (raw['review_status'] ?? '').trim().toLowerCase()
    if (reviewStatus !== 'verified') {
      result.action      = 'skip'
      result.skip_reason = `review_status = "${raw['review_status'] ?? ''}" (not "verified")`
      summary.skipped_not_verified++
      summary.rows.push(result)
      continue
    }

    // ── Deadline checks ───────────────────────────────────────────────────────
    const deadlineRaw = (raw['deadline_date'] ?? '').trim()
    if (!deadlineRaw) {
      result.action      = 'skip'
      result.skip_reason = 'deadline_date is blank'
      summary.skipped_no_deadline++
      summary.rows.push(result)
      continue
    }
    const deadline = new Date(deadlineRaw)
    if (isNaN(deadline.getTime())) {
      result.action      = 'invalid'
      result.skip_reason = `deadline_date "${deadlineRaw}" is not a valid date`
      summary.skipped_invalid++
      summary.rows.push(result)
      continue
    }
    deadline.setHours(0, 0, 0, 0)
    if (deadline < today) {
      result.action      = 'skip'
      result.skip_reason = `deadline ${deadlineRaw} is in the past`
      summary.skipped_past_deadline++
      summary.rows.push(result)
      continue
    }

    // ── Rule 6: field validation ──────────────────────────────────────────────
    const appUrl = (raw['application_url'] ?? '').trim()
    if (!appUrl) {
      result.action      = 'invalid'
      result.skip_reason = 'application_url is missing'
      summary.skipped_invalid++
      summary.rows.push(result)
      continue
    }

    const minGpa = parseNum(raw['min_gpa'])
    if (minGpa !== null && (minGpa < 0 || minGpa > 4)) {
      result.action      = 'invalid'
      result.skip_reason = `min_gpa ${minGpa} is out of range (must be 0–4 or blank)`
      summary.skipped_invalid++
      summary.rows.push(result)
      continue
    }

    // ── Rule 5: parse + flag array fields ─────────────────────────────────────
    const fieldOfStudy       = parseArray(raw['field_ids'])
    const provinceRestriction = parseArray(raw['province_ids'])

    if (fieldOfStudy) {
      const unknown = fieldOfStudy.filter(f => !KNOWN_FIELDS.has(f))
      if (unknown.length) flags.push(`Unrecognized field_ids: ${unknown.join(', ')}`)
    }
    if (provinceRestriction) {
      const unknown = provinceRestriction.filter(p => !KNOWN_PROVINCES.has(p))
      if (unknown.length) flags.push(`Unrecognized province_ids: ${unknown.join(', ')}`)
    }

    // ── Classify insert vs update ──────────────────────────────────────────────
    const dedupeKey   = makeDedupeKey(funder, nameTh)
    const existingEntry = existingMap.get(dedupeKey)   // undefined = new row
    const isUpdate    = existingEntry !== undefined
    result.action     = isUpdate ? 'update' : 'insert'

    // ── Rule 4: name_en handling ──────────────────────────────────────────────
    let nameEn: string | null = null
    if (isUpdate && existingEntry) {
      // Preserve existing name_en — do not overwrite
      nameEn = existingEntry
    } else {
      // Try static generation
      const generated = tryGenerateNameEn(nameTh, funder)
      if (generated) {
        nameEn = generated
        summary.translated++
        flags.push('name_en auto-generated (verify)')
      }
    }

    // ── Rule 3: build upsert payload ──────────────────────────────────────────
    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
      name_th:              nameTh,
      name_en:              nameEn,
      funder_name_th:       funder  || null,
      amount_thb:           parseIntOrNull(raw['amount_thb']),
      min_gpa:              minGpa,
      max_income_thb:       parseIntOrNull(raw['max_income_thb']),
      welfare_card_priority: parseBool(raw['welfare_card_priority']),
      field_of_study:       fieldOfStudy,
      province_restriction: provinceRestriction,
      deadline_date:        deadlineRaw,
      application_url:      appUrl,
      // Verified gate: is_active=true makes the row publicly visible
      is_active:            true,
      last_verified_at:     now,
      verified_at:          now,
      next_review_at:       nextReviewDate(deadlineRaw),
      dedupe_key:           dedupeKey,
    }
    // On updates, don't overwrite name_en if it was already set (handled above)
    if (isUpdate && existingEntry) {
      // Remove name_en from payload — we'll let the DB keep its current value
      delete payload['name_en']
    }

    toUpsert.push({ payload, action: result.action, rowResult: result })
    summary.rows.push(result)
  }

  // ── 6. Write (or simulate) ──────────────────────────────────────────────────
  if (!dryRun && toUpsert.length > 0) {
    // Upsert all valid rows; onConflict='dedupe_key' handles insert vs update
    const payloads = toUpsert.map(r => r.payload)
    const { error: upsertErr } = await adminClient
      .from('scholarships')
      .upsert(payloads, { onConflict: 'dedupe_key' })
    if (upsertErr) {
      return NextResponse.json(
        { error: `Upsert failed: ${upsertErr.message}` },
        { status: 500 },
      )
    }
    for (const { action } of toUpsert) {
      if (action === 'insert') summary.inserted++
      else                     summary.updated++
    }
  } else {
    // Dry-run: count but don't write
    for (const { action } of toUpsert) {
      if (action === 'insert') summary.inserted++
      else                     summary.updated++
    }
  }

  return NextResponse.json(summary)
}
