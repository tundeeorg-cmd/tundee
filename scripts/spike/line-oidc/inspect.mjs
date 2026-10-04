#!/usr/bin/env node
/**
 * Spike step 3 — what did Supabase actually create?
 *
 * Reads the most recent users from the STAGING project through the GoTrue admin
 * REST API (service role) and reports, for each non-email, non-Google account:
 * the email (null is what we want), app_metadata.provider/providers, and the
 * identity rows. Ends with a verdict on the three questions that decide option B.
 *
 * Read-only. Refuses to run unless the URL is passed as STAGING_SUPABASE_URL, so
 * the production key in .env.local cannot be picked up by accident.
 *
 *   STAGING_SUPABASE_URL=https://xxxx.supabase.co \
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/spike/line-oidc/inspect.mjs [--limit 20]
 */

const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY (staging only).');
  process.exit(2);
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL && url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('STAGING_SUPABASE_URL equals NEXT_PUBLIC_SUPABASE_URL — refusing in case that is production.');
  process.exit(2);
}

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 20;

const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=200`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`admin/users → HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { users = [] } = await res.json();

const BUILTIN = new Set(['email', 'google', 'phone', 'anonymous']);
const candidates = users
  .filter(u => (u.identities ?? []).some(i => !BUILTIN.has(i.provider)))
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
  .slice(0, limit);

if (candidates.length === 0) {
  console.log('No users with a non-built-in identity yet. Sign in through spike.html first.');
  process.exit(0);
}

for (const u of candidates) {
  console.log('─'.repeat(72));
  console.log('id            ', u.id);
  console.log('created_at    ', u.created_at);
  console.log('email         ', u.email || null);
  console.log('app_metadata  ', JSON.stringify(u.app_metadata));
  for (const i of u.identities ?? []) {
    const d = i.identity_data ?? {};
    console.log(`identity      provider=${i.provider} provider_id=${i.provider_id ?? i.id} sub=${d.sub ?? '-'} name=${d.name ?? d.full_name ?? '-'} email=${d.email ?? '-'}`);
  }
}

// Same LINE sub on two users = sign-in created a duplicate instead of reusing.
const bySub = new Map();
for (const u of candidates) {
  for (const i of u.identities ?? []) {
    if (BUILTIN.has(i.provider)) continue;
    const sub = i.identity_data?.sub ?? i.provider_id;
    bySub.set(sub, [...(bySub.get(sub) ?? []), u.id]);
  }
}
const dupes = [...bySub.entries()].filter(([, ids]) => new Set(ids).size > 1);

const latest = candidates[0];
const custom = (latest.identities ?? []).find(i => !BUILTIN.has(i.provider));
console.log('═'.repeat(72));
console.log('VERDICT (latest account)');
console.log(`  labelled as LINE, not email : ${custom ? `yes (provider=${custom.provider}, app_metadata.provider=${latest.app_metadata?.provider})` : 'no'}`);
console.log(`  created without an email    : ${latest.email ? `no (${latest.email})` : 'yes'}`);
console.log(`  duplicate accounts per sub  : ${dupes.length ? `YES ${JSON.stringify(dupes)}` : 'none'}`);
