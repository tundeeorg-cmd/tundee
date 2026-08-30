/**
 * The hidden scholarships worth a person's time, with the action for each one worked out.
 *
 *   npx tsx scripts/export_hidden_priority.mts
 *
 * Replaces export_hidden_verified_priority.mjs. Written as .mts so it imports the real
 * isUnqualifiedRolling and display-gate rules rather than restating them — a copy of that
 * regex here would drift, and the whole point of the file is to not list rows the code
 * already handles.
 *
 * Three filters, in order of how much time each one saves:
 *
 *   1. Rows the rolling rule already resolves are excluded. The nightly cron publishes
 *      them on its own; researching a deadline for one is wasted work.
 *   2. Only verified rows with a working link. An unverified row may change on the next
 *      import, so a deadline typed against it can be undone.
 *   3. Ordered by award size. A student never sees most of a 1,575-row catalogue, so the
 *      first page should be the one that changes someone's options.
 *
 * The `what_to_do` column is derived from what deadline_raw actually says, because the
 * work differs: some rows need a date looked up, some need the current round checked, and
 * some are genuinely unknowable today and should be left alone.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { isUnqualifiedRolling } from '../lib/tdScholarships/deadlineParser';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'hidden_priority.csv';

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim();
    }
  }
  return undefined;
}

const url = env('NEXT_PUBLIC_SUPABASE_URL');
const key = env('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required — hidden rows are not readable with the anon key.');
  process.exit(1);
}

/**
 * What a person actually has to do, given what the sheet says today.
 *
 * Kept blunt on purpose: "recheck" and "varies" are not instructions, they are the
 * previous person's note to themselves, and turning them into an instruction is most of
 * the value of this file.
 */
function whatToDo(deadlineRaw: string | null): string {
  const d = (deadlineRaw ?? '').trim();
  if (!d) return 'เปิดลิงก์ หาวันปิดรับของรอบปัจจุบัน';
  if (/\b(19|20|25|26)\d{2}\b/.test(d) && /[A-Za-z]{3}|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./.test(d))
    return 'มีเดือนและปีอยู่แล้ว — ยืนยันวันที่แน่นอนจากลิงก์';
  if (/roll|ongoing|year-round|ตลอด/i.test(d)) return 'เปิดลิงก์ ถ้ารับตลอดให้ใส่ new_status = Open';
  if (/aligned|admission|tcas/i.test(d)) return 'ผูกกับรอบรับสมัคร — ดูปฏิทินรับสมัครของสถาบัน';
  if (/committee|nominat/i.test(d)) return 'ต้องเสนอชื่อ/คณะกรรมการ — ถ้าไม่มีรอบเปิด ปล่อยว่างไว้';
  return 'เปิดลิงก์ หาวันปิดรับของรอบปัจจุบัน';
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Paginated: PostgREST caps a response at 1000 rows in silence, and this table is larger.
const rows: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('td_scholarships')
    .select('scholarship_id, scholarship_name_th, scholarship_name_en, funder_th, funder_en, funder, ' +
            'funder_type, level, award_value_tier, deadline_raw, verification_status, ' +
            'application_url, application_link, is_displayed, status_effective, notes')
    .order('scholarship_id')
    .range(from, from + 999);
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}

const TIER_RANK: Record<string, number> = {
  full_ride: 0, full_tuition: 1, large: 2, medium: 3, small: 4, stipend_only: 5,
};

const hidden = rows.filter(r => !r.is_displayed && !r.status_effective);
const rollingHandled = hidden.filter(r => isUnqualifiedRolling(r.deadline_raw ?? null));

const priority = hidden
  .filter(r => !isUnqualifiedRolling(r.deadline_raw ?? null))   // the cron gets these
  .filter(r => r.application_url || r.application_link)
  .filter(r => r.verification_status === 'verified')
  .sort((a, b) =>
    (TIER_RANK[a.award_value_tier] ?? 9) - (TIER_RANK[b.award_value_tier] ?? 9) ||
    a.scholarship_id.localeCompare(b.scholarship_id));

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const HEADERS = ['scholarship_id', 'new_deadline', 'new_status', 'what_to_do',
                 'award_value_tier', 'scholarship_name_th', 'scholarship_name_en',
                 'funder', 'level', 'deadline_raw', 'application_url', 'notes'];

const lines = [HEADERS.join(',')];
for (const r of priority) {
  lines.push([
    r.scholarship_id, '', '',                       // the two columns to fill in
    whatToDo(r.deadline_raw ?? null),
    r.award_value_tier, r.scholarship_name_th, r.scholarship_name_en,
    r.funder_th ?? r.funder_en ?? r.funder,
    r.level, r.deadline_raw, r.application_url ?? r.application_link, r.notes,
  ].map(csvCell).join(','));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const big = priority.filter(r => r.award_value_tier === 'full_ride' || r.award_value_tier === 'full_tuition');
console.log(`hidden, verified, has a link → ${OUT}: ${priority.length} rows`);
console.log(`  of which full_ride or full_tuition: ${big.length}   <- the first ${big.length} lines`);
console.log(`  excluded, the rolling rule publishes them: ${rollingHandled.length}`);
console.log('');
console.log('Fill ONE of two columns per row:');
console.log('  new_deadline  a real date (D-Mon-YYYY). Best: the sheet formula keeps the status current.');
console.log('  new_status    Open | Opening Soon | Closing Soon — when the round is running but no date is published.');
console.log('');
console.log('Leaving a row blank is a valid answer. It stays hidden, which is correct when');
console.log('no round is open — and costs nothing, so stopping early is fine.');
