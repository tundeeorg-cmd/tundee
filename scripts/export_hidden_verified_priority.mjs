/**
 * The hidden scholarships worth a person's time first.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export_hidden_verified_priority.mjs
 *
 * scripts/export_hidden_worklist.mjs narrowed 798 hidden rows to 225 with a usable
 * link. This narrows those 225 again, because they are not equally worth doing and
 * no further automation will help:
 *
 *   Of the 225, exactly ONE ("Jan 31 (annual)") states a date a parser could derive.
 *   The rest say "recheck", "varies", "cycle-based", "~Mar" or nothing at all. Those
 *   are not badly formatted dates, they are an accurate report that the deadline is
 *   not published — so a parser would be inventing deadlines, which is worse for a
 *   student than showing nothing.
 *
 * What IS left is that 48 of the 225 are human-verified with a working link, and 25
 * of those carry a full_ride or full_tuition award. They include กยศ., ทุนมูลนิธิ-
 * อานันทมหิดล, โครงการช้างเผือก and ทุนโครงการจุฬาฯ-ชนบท — among the most consequential
 * financial aid in Thailand — all invisible today because the deadline column says
 * "recheck" instead of a date.
 *
 * Verified first, then by award tier: if only the first page ever gets filled in,
 * it should be the page that changes the most students' options.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'hidden_priority.csv';

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

// Paginated: PostgREST caps a response at 1000 rows in silence, and this table is larger.
const rows = [];
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

const TIER_RANK = { full_ride: 0, full_tuition: 1, large: 2, medium: 3, small: 4, stipend_only: 5 };

const priority = rows
  .filter(r => !r.is_displayed && !r.status_effective)
  .filter(r => r.application_url || r.application_link)
  .filter(r => r.verification_status === 'verified')
  .sort((a, b) =>
    (TIER_RANK[a.award_value_tier] ?? 9) - (TIER_RANK[b.award_value_tier] ?? 9) ||
    a.scholarship_id.localeCompare(b.scholarship_id));

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const HEADERS = ['scholarship_id', 'new_deadline', 'new_status', 'award_value_tier', 'funder_type',
                 'scholarship_name_th', 'scholarship_name_en', 'funder', 'level',
                 'deadline_raw', 'application_url', 'notes'];

const lines = [HEADERS.join(',')];
for (const r of priority) {
  lines.push([
    r.scholarship_id, '', '',                      // the two columns to fill in
    r.award_value_tier, r.funder_type,
    r.scholarship_name_th, r.scholarship_name_en,
    r.funder_th ?? r.funder_en ?? r.funder,
    r.level, r.deadline_raw, r.application_url ?? r.application_link, r.notes,
  ].map(csvCell).join(','));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const tally = (f) => priority.reduce((m, r) => (m[r[f] ?? '(none)'] = (m[r[f] ?? '(none)'] ?? 0) + 1, m), {});
const big = priority.filter(r => r.award_value_tier === 'full_ride' || r.award_value_tier === 'full_tuition');
console.log(`verified + hidden + has a link → ${OUT}: ${priority.length} rows`);
console.log(`  of which full_ride or full_tuition: ${big.length}\n`);
console.log('  by award tier:', tally('award_value_tier'));
console.log('  by funder    :', tally('funder_type'));
console.log('\nFill `new_deadline` (a real date) or `new_status`, paste into the master sheet by');
console.log('scholarship_id, and re-import. A date is better: the sheet formula then keeps it current.');
