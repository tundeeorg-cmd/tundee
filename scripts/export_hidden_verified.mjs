/**
 * Export the verified scholarships that are hidden for want of a status value.
 *
 *   node scripts/export_hidden_verified.mjs [--out FILE]
 *
 * These rows have been checked by a person — deadline and link confirmed — and are
 * invisible to students anyway, because `status_effective` falls back to the sheet's
 * `status` column and that cell is blank. The display gate is working exactly as written;
 * there is simply nothing for it to read.
 *
 * The fix is upstream and manual: set `status` for these rows in the master sheet, then
 * re-import through /admin. No code change, no gate loosened, and the rows are already
 * verified so nothing unchecked reaches students.
 *
 * Output is a CSV worklist: the id to find the row by, enough context to decide a status,
 * and an empty `status` column to fill in. `suggested_status` is a hint from the raw
 * deadline text, deliberately left out of the `status` column — it is a reading aid, not
 * an answer, and a person should confirm every one.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY: hidden rows are not readable with the anon key.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const outIndex = process.argv.indexOf('--out');
const OUT = outIndex > -1 ? process.argv[outIndex + 1] : 'hidden_verified_scholarships.csv';

function env(name) {
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

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await db
  .from('td_scholarships')
  .select('scholarship_id, scholarship_name_th, scholarship_name_en, scholarship_name, ' +
          'funder_th, funder_en, funder, funder_type, level, deadline_raw, deadline_date, ' +
          'deadline_is_rolling, application_url, application_link, last_verified, verified_by')
  .eq('is_displayed', false)
  .is('status_effective', null)
  .eq('verification_status', 'verified')
  .order('scholarship_id');

if (error) { console.error('read failed:', error.message); process.exit(1); }

/** A reading aid only. Never written into the `status` column — a person decides that. */
function suggest(row) {
  if (row.deadline_date) {
    const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return row.deadline_date < todayBkk ? 'looks Closed' : 'looks Open (has a date)';
  }
  if (row.deadline_is_rolling) return 'rolling — check it is open now';
  if (!row.deadline_raw) return 'no deadline text — needs research';
  return 'prose deadline — read it';
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADERS = [
  'scholarship_id', 'status', 'suggested_status', 'scholarship_name_th', 'scholarship_name_en',
  'funder', 'funder_type', 'level', 'deadline_raw', 'deadline_date', 'deadline_is_rolling',
  'application_url', 'last_verified', 'verified_by',
];

const lines = [HEADERS.join(',')];
for (const row of data) {
  lines.push([
    row.scholarship_id,
    '',                                   // status — the column to fill in
    suggest(row),
    row.scholarship_name_th,
    row.scholarship_name_en ?? row.scholarship_name,
    row.funder_th ?? row.funder_en ?? row.funder,
    row.funder_type,
    row.level,
    row.deadline_raw,
    row.deadline_date,
    row.deadline_is_rolling,
    row.application_url ?? row.application_link,
    row.last_verified,
    row.verified_by,
  ].map(csvCell).join(','));
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const tally = {};
for (const row of data) { const s = suggest(row); tally[s] = (tally[s] ?? 0) + 1; }
console.log(`${data.length} verified rows hidden for a blank status → ${OUT}\n`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log('\nFill the `status` column (Open / Closing Soon / Opening Soon / Closed),');
console.log('copy those values into the master sheet by scholarship_id, and re-import via /admin.');
