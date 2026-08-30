/**
 * The cheapest way to upgrade the provenance labels: review hostnames, not scholarships.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export_source_host_review.mjs
 *
 * lib/scholarships/sourceLink only awards "ดูประกาศต้นทางจาก {funder}" to URLs on
 * registry-controlled suffixes (.ac.th, .edu, .ac.uk, …), because membership there is a
 * documented fact rather than something I know. That leaves a set of hosts that plainly
 * do belong to their funder — chevening.org, gatescambridge.org, ethz.ch — sitting on the
 * weaker label for want of a human saying so.
 *
 * This exports exactly those hosts, deduplicated, with the funders and scholarship counts
 * attached. It is a few dozen lines to tick rather than hundreds of scholarships to
 * research, and each approved host upgrades every row that uses it at once.
 *
 * The list is not safe to accept wholesale. forms.gle appears in it: a Google Form is not
 * a funder's announcement, and it is the reason this is a review file and not an
 * automatic rule.
 *
 * Fill `is_funder_site` with y or n. Nothing here writes to the database.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'source_host_review.csv';

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
  console.error('SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

/** Kept in step with lib/scholarships/sourceLink — see the note there on why it is structural. */
const REGISTRY_CONTROLLED = /\.(?:ac|go|gov|or|mi|edu)\.[a-z]{2}$|\.(?:edu|gov|mil)$/;

/** Known listing sites. Only used to keep them out of the review file, never to grant a label. */
const AGGREGATORS = new Set([
  'scholarshiptab.com', 'eduzones.com', 'dek-d.com', 'gooduniversity.net', 'u-hit.net',
  'dekuni.com', 'study-d.com', 'thaiedunews.net', 'learninfinity.net', 'educationlovers.net',
  'contest-thailand.com', 'trueplookpanya.com', 'kapook.com', 'admissionpremium.com',
  'wegointer.com', 'interscholarship.com', 'scholarship.in.th',
]);

const hostOf = (u) => {
  try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
};

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Paginated: PostgREST caps a response at 1000 rows silently, and this table is larger.
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('td_scholarships')
    .select('scholarship_id, is_displayed, source_url, application_url, application_link, ' +
            'funder_th, funder_en, funder, award_value_tier, verification_status')
    .order('scholarship_id')
    .range(from, from + 999);
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}

const funderName = (r) => (r.funder_th || r.funder_en || r.funder || '').trim();
const isBig = (r) => r.award_value_tier === 'full_ride' || r.award_value_tier === 'full_tuition';

const byHost = new Map();
for (const r of rows.filter(r => r.is_displayed)) {
  // Already earns the strong label somewhere — nothing to review.
  const already = [r.application_url, r.application_link, r.source_url]
    .map(hostOf).filter(Boolean).some(h => REGISTRY_CONTROLLED.test(h));
  if (already) continue;

  const host = hostOf(r.application_url) ?? hostOf(r.application_link);
  if (!host || AGGREGATORS.has(host)) continue;   // no candidate, or a known listing site

  const entry = byHost.get(host) ?? { host, rows: 0, big: 0, funders: new Set(), example: r.scholarship_id };
  entry.rows++;
  if (isBig(r)) entry.big++;
  const n = funderName(r);
  if (n) entry.funders.add(n);
  byHost.set(host, entry);
}

const review = [...byHost.values()].sort((a, b) => b.big - a.big || b.rows - a.rows || a.host.localeCompare(b.host));

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const HEADERS = ['host', 'is_funder_site', 'rows_affected', 'big_award_rows', 'example_scholarship_id', 'funders'];
const lines = [HEADERS.join(',')];
for (const e of review) {
  lines.push([
    e.host, '', e.rows, e.big, e.example, [...e.funders].slice(0, 3).join(' | '),
  ].map(csvCell).join(','));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

console.log(`hosts to review → ${OUT}: ${review.length}`);
console.log(`  scholarships they would upgrade: ${review.reduce((s, e) => s + e.rows, 0)}`);
console.log(`  of those, full_ride or full_tuition: ${review.reduce((s, e) => s + e.big, 0)}`);
console.log('\nMark is_funder_site y where the host is the funder\'s own site. Do not accept the');
console.log('list wholesale — form and link-shortener hosts appear in it.');
