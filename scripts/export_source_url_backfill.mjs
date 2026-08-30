/**
 * The scholarships whose origin we genuinely do not have, ordered by who they matter to.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export_source_url_backfill.mjs
 *
 * These are the rows where source_url and application_url both point at a listing site,
 * so there is no funder URL anywhere on the record and nothing can be derived. Finding
 * one is research: open the funder's site, locate the announcement, paste the URL. 289
 * distinct funders are involved, so this is not an afternoon.
 *
 * Which is why the order matters more than the list. A student never sees most of these
 * — they see what the matcher ranks highly and what a big award pulls them toward — so
 * the file leads with verified, large-award scholarships and trails off into the ones
 * where a correct URL changes nothing anyone will read.
 *
 * Do scripts/export_source_host_review.mjs first. It upgrades a comparable number of
 * scholarships for a fraction of the effort, because it works per host rather than per
 * scholarship.
 *
 * Fill `new_source_url` with the funder's own announcement page — not the funder's
 * homepage, and not a listing site. Leaving a row blank is fine and costs nothing: it
 * keeps the label it has, which is already true.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'source_url_backfill.csv';

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

/** Kept in step with lib/scholarships/sourceLink. */
const REGISTRY_CONTROLLED = /\.(?:ac|go|gov|or|mi|edu)\.[a-z]{2}$|\.(?:edu|gov|mil)$/;

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

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('td_scholarships')
    .select('scholarship_id, is_displayed, source_url, application_url, application_link, ' +
            'funder_th, funder_en, funder, funder_type, level, award_value_tier, ' +
            'verification_status, scholarship_name_th, scholarship_name_en')
    .order('scholarship_id')
    .range(from, from + 999);
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}

const TIER_RANK = { full_ride: 0, full_tuition: 1, large: 2, medium: 3, small: 4, stipend_only: 5 };
const funderName = (r) => (r.funder_th || r.funder_en || r.funder || '').trim();

const needs = rows
  .filter(r => r.is_displayed)
  // Nothing on the record earns the strong label…
  .filter(r => ![r.application_url, r.application_link, r.source_url]
    .map(hostOf).filter(Boolean).some(h => REGISTRY_CONTROLLED.test(h)))
  // …and there is no candidate host either: a review pass cannot help these.
  .filter(r => {
    const h = hostOf(r.application_url) ?? hostOf(r.application_link);
    return !h || AGGREGATORS.has(h);
  })
  .sort((a, b) => {
    // Verified first: a human already vouched for the rest of the record, so a URL
    // added here is worth more than one added to a row that may change anyway.
    const av = a.verification_status === 'verified' ? 0 : 1;
    const bv = b.verification_status === 'verified' ? 0 : 1;
    return av - bv
      || (TIER_RANK[a.award_value_tier] ?? 9) - (TIER_RANK[b.award_value_tier] ?? 9)
      || a.scholarship_id.localeCompare(b.scholarship_id);
  });

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const HEADERS = ['scholarship_id', 'new_source_url', 'funder', 'scholarship_name_th',
                 'scholarship_name_en', 'award_value_tier', 'verification_status',
                 'funder_type', 'level', 'current_source_url', 'current_application_url'];

const lines = [HEADERS.join(',')];
for (const r of needs) {
  lines.push([
    r.scholarship_id, '',                       // the column to fill in
    funderName(r), r.scholarship_name_th, r.scholarship_name_en,
    r.award_value_tier, r.verification_status, r.funder_type, r.level,
    r.source_url, r.application_url ?? r.application_link,
  ].map(csvCell).join(','));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const big = needs.filter(r => r.award_value_tier === 'full_ride' || r.award_value_tier === 'full_tuition');
const verifiedBig = big.filter(r => r.verification_status === 'verified');
console.log(`no funder URL on the record → ${OUT}: ${needs.length} rows`);
console.log(`  distinct funders          : ${new Set(needs.map(funderName).filter(Boolean)).size}`);
console.log(`  full_ride or full_tuition : ${big.length}`);
console.log(`  …and already verified     : ${verifiedBig.length}   <- start here`);
console.log('\nFill new_source_url with the funder\'s own announcement page. Blank rows keep the');
console.log('label they have, which is already true — there is no penalty for stopping early.');
