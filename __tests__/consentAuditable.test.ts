/**
 * Research consent, and the constraint that rejected every second save.
 *
 * A student who consented on 30 Aug finished the wizard again on 3 Sep. The
 * profile saved; then /api/profile/student answered 500:
 *
 *   23514 new row for relation "student_profile" violates check constraint
 *   "student_profile_consent_auditable_check"
 *
 * The route stamped consent_version and consent_at only when the decision
 * CHANGED — sound as an audit rule, since consent_at should mean "when they
 * decided", not "when they last pressed save". But it omitted the columns
 * entirely otherwise, and the constraint requires them whenever consent is on:
 *
 *   CHECK (consent_research = FALSE
 *          OR (consent_version IS NOT NULL AND consent_at IS NOT NULL))
 *
 * So every repeat save by an already-consenting student was refused. The
 * caller treats this route as non-fatal — the student still gets through — so
 * the only visible consequence was research consent quietly not being
 * recorded, for exactly the people who had agreed to it. It surfaced only once
 * client logging made the 500 findable.
 *
 * The fix carries the stored values forward instead of omitting them, so the
 * row is legal without the audit trail being rewritten.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/profile/student/route.ts');
const MIGRATION = read('scripts/20260828_v17_counterfactual_and_consent.sql');

// ─── The rule being satisfied ────────────────────────────────────────────────

describe('the constraint this route has to satisfy', () => {
  it('requires a version and a timestamp whenever consent is on', () => {
    expect(MIGRATION).toContain('student_profile_consent_auditable_check');
    expect(MIGRATION).toMatch(
      /CHECK \(consent_research = FALSE\s*\n\s*OR \(consent_version IS NOT NULL AND consent_at IS NOT NULL\)\)/,
    );
  });
});

// ─── The fix ─────────────────────────────────────────────────────────────────

describe('the payload always carries the audit columns', () => {
  it('reads them back, not just the decision', () => {
    // Carrying them forward is impossible without selecting them first, and
    // selecting only consent_research is what made the omission inevitable.
    expect(ROUTE).toContain("select('consent_research, consent_version, consent_at, consent_method')");
  });

  it('never omits them from the payload', () => {
    // The shape that caused this: audit columns present only on one branch of
    // a conditional spread, so an unchanged decision produced a row with
    // consent_research true and no trail.
    expect(ROUTE).not.toMatch(/\.\.\.\(consentChanged \? \{/);
    expect(ROUTE).toContain('...consentColumns');
  });

  it('carries the stored values forward when nothing changed', () => {
    // Re-stamping on every save would turn consent_at into a "last edited"
    // timestamp and quietly destroy the study's audit trail.
    expect(ROUTE).toContain('carriedVersion');
    expect(ROUTE).toContain('carriedAt');
    expect(ROUTE).toMatch(/consent_version: carriedVersion/);
  });

  it('stamps when consent is on but the trail is missing', () => {
    // A legacy row from before v17 can hold consent_research = true with null
    // audit columns. Carrying nulls forward would be both illegal and untrue.
    expect(ROUTE).toMatch(/mustStamp\s*=\s*consentChanged \|\| \(consentResearch && \(!carriedVersion \|\| !carriedAt\)\)/);
  });

  it('still only re-stamps a decision that actually changed', () => {
    expect(ROUTE).toContain('consent_version: CURRENT_CONSENT_VERSION');
    expect(ROUTE).toMatch(/mustStamp[\s\S]{0,200}CURRENT_CONSENT_VERSION/);
  });
});

// ─── Asked of the live constraint ────────────────────────────────────────────

/**
 * Runs only when Supabase credentials are present; skipped in CI.
 *
 * NON-MUTATING BY CONSTRUCTION. Each probe inserts with a user_id absent from
 * auth.users. Postgres evaluates CHECK constraints before the foreign-key
 * trigger, so a legal row aborts on the FK (23503) and an illegal one on the
 * CHECK (23514). Both abort; nothing is written.
 */
function loadEnv(): { url: string; key: string } | null {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  try {
    const env = Object.fromEntries(
      read('.env.local').split('\n')
        .filter(l => l.includes('=') && !l.trim().startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
    ) as Record<string, string>;
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
    }
  } catch { /* offline run */ }
  return null;
}

const live = loadEnv();

describe.skipIf(!live)('the live constraint agrees (probe, writes nothing)', () => {
  async function probe(extra: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${live!.url}/rest/v1/student_profile`, {
      method: 'POST',
      headers: {
        apikey: live!.key,
        Authorization: `Bearer ${live!.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: '00000000-0000-4000-8000-000000000000',
        language_pref: 'th',
        ...extra,
      }),
    });
    if (res.status === 201) return 'INSERTED';
    const err = await res.json() as { code?: string };
    return err.code === '23503' ? 'ALLOWED' : (err.code ?? 'unknown');
  }

  it('refuses consent with no audit trail — the exact 500 from production', async () => {
    expect(await probe({ consent_research: true })).toBe('23514');
  }, 20_000);

  it('accepts the shape the route now sends', async () => {
    expect(await probe({
      consent_research: true,
      consent_version:  '2026-07-v1',
      consent_at:       new Date().toISOString(),
      consent_method:   'signup_inline',
    })).toBe('ALLOWED');
  }, 20_000);

  it('never applied to students who declined', async () => {
    // Which is why this went unnoticed: it only ever hit the people who had
    // agreed to take part.
    expect(await probe({ consent_research: false })).toBe('ALLOWED');
  }, 20_000);
});
