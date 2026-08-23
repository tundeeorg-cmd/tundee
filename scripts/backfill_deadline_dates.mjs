/**
 * Re-derive `deadline_date` from `deadline_raw` for rows the old parser could not read.
 *
 *   node scripts/backfill_deadline_dates.mjs            # dry run, writes nothing
 *   node scripts/backfill_deadline_dates.mjs --apply    # write
 *
 * Why this exists. `lib/tdScholarships/deadlineParser.ts` understood ISO dates, ISO
 * ranges and rolling text, but not "31-Aug-2026" — the format the master spreadsheet
 * actually uses. Every row imported before that fix therefore has a perfectly good
 * deadline in `deadline_raw` and NULL in `deadline_date`, and everything downstream that
 * keys off a real date is dark: the display gate cannot compute Closed, deadline
 * reminders have nothing to count down to, and the browse page cannot sort by urgency.
 *
 * This is not a backfill in the sense the metrics work forbade. Nothing is invented,
 * estimated or filled in from elsewhere — each date is re-derived from text already
 * stored on the same row, by the same function the importer now uses. A row whose raw
 * text has no day in it ("Nov 2026") stays NULL, exactly as a fresh import would leave it.
 *
 * What it does NOT touch: `status_effective`, `is_displayed`, `display_reason`,
 * `verification_status`, or anything else. `computeStatusEffective` only derives from
 * dates when BOTH open_date and deadline_date are set, and open_date is NULL across the
 * corpus, so the stored status is unaffected either way — but the columns are left alone
 * rather than rewritten with values that happen to match.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY: `td_scholarships` is not writable by the anon key,
 * and it must not be.
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

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
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is required (td_scholarships is not writable by the anon key).\n' +
    'Run with: SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill_deadline_dates.mjs',
  );
  process.exit(1);
}

// Use the shipped parser rather than a copy of its rules: a backfill that disagrees with
// the importer would create two populations of rows that look the same and are not.
const COMPILED = '.deadlineParser.tmp.mjs';
let parseDeadline;
try {
  execSync(`npx esbuild lib/tdScholarships/deadlineParser.ts --format=esm --outfile=${COMPILED}`,
           { stdio: 'pipe' });
  ({ parseDeadline } = await import(`../${COMPILED}`));
} finally {
  rmSync(COMPILED, { force: true });
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = [];
for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await db
    .from('td_scholarships')
    .select('scholarship_id, deadline_raw, deadline_date, deadline_is_rolling')
    .order('scholarship_id')
    .range(from, from + PAGE_SIZE - 1);
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < PAGE_SIZE) break;
}

const changes = [];
const stats = { rows: rows.length, alreadySet: 0, noRawText: 0, stillUnparseable: 0, willSet: 0, willFlagRolling: 0, conflict: 0 };

for (const row of rows) {
  if (!row.deadline_raw) { stats.noRawText++; continue; }
  const parsed = parseDeadline(row.deadline_raw);

  if (row.deadline_date) {
    stats.alreadySet++;
    // A stored date that disagrees with what the raw text now parses to is a data
    // question, not something to silently overwrite.
    if (parsed.deadline_date && parsed.deadline_date !== row.deadline_date) {
      stats.conflict++;
      console.warn(`  CONFLICT ${row.scholarship_id}: stored ${row.deadline_date}, ` +
                   `raw ${JSON.stringify(row.deadline_raw)} parses to ${parsed.deadline_date} — left alone`);
    }
    continue;
  }

  if (!parsed.deadline_date) {
    // "Rolling", "year-round" and the like legitimately have no date, but they should
    // still be flagged as rolling. Without this they fall through as merely unparseable
    // and the flag stays false forever.
    if (parsed.deadline_is_rolling && !row.deadline_is_rolling) {
      stats.willFlagRolling++;
      changes.push({
        scholarship_id: row.scholarship_id,
        deadline_date: null,
        deadline_is_rolling: true,
      });
      continue;
    }
    stats.stillUnparseable++;
    console.log(`  no day in it, left NULL — ${row.scholarship_id}: ${JSON.stringify(row.deadline_raw)}`);
    continue;
  }

  stats.willSet++;
  changes.push({
    scholarship_id: row.scholarship_id,
    deadline_date: parsed.deadline_date,
    deadline_is_rolling: parsed.deadline_is_rolling,
  });
}

console.log('\n' + Object.entries(stats).map(([k, v]) => `${k.padStart(18)}: ${v}`).join('\n'));

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. ${changes.length} rows would get a deadline_date.`);
  console.log('First 10:');
  for (const c of changes.slice(0, 10)) console.log(`  ${c.scholarship_id} → ${c.deadline_date}`);
  console.log('\nRe-run with --apply to write.');
  process.exit(0);
}

let written = 0;
for (const change of changes) {
  // deadline_date is only ever written when we have one; a rolling row updates the flag
  // alone rather than writing NULL over a date some other process may have set.
  const patch = change.deadline_date === null
    ? { deadline_is_rolling: change.deadline_is_rolling }
    : { deadline_date: change.deadline_date, deadline_is_rolling: change.deadline_is_rolling };
  const { error } = await db
    .from('td_scholarships')
    .update(patch)
    .eq('scholarship_id', change.scholarship_id);
  if (error) { console.error(`  FAILED ${change.scholarship_id}: ${error.message}`); continue; }
  written++;
  if (written % 100 === 0) console.log(`  ${written}/${changes.length}`);
}
console.log(`\nwritten: ${written}/${changes.length}`);
