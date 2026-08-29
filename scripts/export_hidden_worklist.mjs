/**
 * Export the hidden scholarships where a person's time actually pays.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export_hidden_worklist.mjs
 *
 * 798 scholarships are hidden with a blank status, and no further rule will move them —
 * that avenue is exhausted (see the header of lib/tdScholarships/displayGate.ts for the
 * rolling rule, which was the last one). What is left is triage, and the 798 are not
 * equally worth triaging:
 *
 *   520  deadline reads literally "Not specified". Every one is auto-extracted, none
 *        verified, all International, and not one has a Thai name. Publishing them would
 *        put unverified, untranslated foreign entries in front of Thai students — the
 *        opposite of what the product claims. They are excluded here deliberately.
 *   278  everything else, of which this exports the subset that is Thai-funded or
 *        already verified AND has a working application link.
 *
 * Ordered by award tier, because if only part of the list ever gets done it should be
 * the part that matters most to a student.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'hidden_worklist.csv';

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

const INTERNATIONAL = 'International (open to Thais)';
/** Biggest award first — if only half the list gets done, it should be the useful half. */
const TIER_RANK = { full_ride: 0, full_tuition: 1, large: 2, medium: 3, small: 4, stipend_only: 5 };

const hidden = rows.filter(r => !r.is_displayed && !r.status_effective);
const worklist = hidden
  .filter(r => (r.deadline_raw ?? '').trim() !== 'Not specified')
  .filter(r => r.verification_status === 'verified' || r.funder_type !== INTERNATIONAL)
  .filter(r => r.application_url || r.application_link)
  .sort((a, b) =>
    (TIER_RANK[a.award_value_tier] ?? 9) - (TIER_RANK[b.award_value_tier] ?? 9) ||
    a.scholarship_id.localeCompare(b.scholarship_id));

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const HEADERS = ['scholarship_id', 'new_deadline', 'new_status', 'award_value_tier', 'funder_type',
                 'verification_status', 'scholarship_name_th', 'scholarship_name_en', 'funder',
                 'level', 'deadline_raw', 'application_url', 'notes'];

const lines = [HEADERS.join(',')];
for (const r of worklist) {
  lines.push([
    r.scholarship_id, '', '',                      // the two columns to fill in
    r.award_value_tier, r.funder_type, r.verification_status,
    r.scholarship_name_th, r.scholarship_name_en,
    r.funder_th ?? r.funder_en ?? r.funder,
    r.level, r.deadline_raw, r.application_url ?? r.application_link, r.notes,
  ].map(csvCell).join(','));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const tally = (f) => worklist.reduce((m, r) => (m[r[f] ?? '(none)'] = (m[r[f] ?? '(none)'] ?? 0) + 1, m), {});
console.log(`hidden with a blank status: ${hidden.length}`);
console.log(`  excluded — deadline "Not specified", all unverified/international: ${hidden.length - worklist.length - (hidden.filter(r => (r.deadline_raw ?? '').trim() !== 'Not specified').length - worklist.length)}`);
console.log(`\nworklist → ${OUT}: ${worklist.length} rows\n`);
console.log('  by award tier:', tally('award_value_tier'));
console.log('  by funder    :', tally('funder_type'));
console.log('\nFill `new_deadline` (a real date) or `new_status`, paste into the master sheet by');
console.log('scholarship_id, and re-import. A date is better: the sheet formula then keeps it current.');
