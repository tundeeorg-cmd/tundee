/**
 * grade_year at write time: buildProfilePayload's coherence rule, and the real
 * profiles_grade_year_check constraint asked directly.
 *
 * scripts/20260903_v21_grade_year.sql deliberately does NOT cross-check
 * grade_year against grade_level in the database — a student who changes
 * ม.6 → ม.2 would send grade_level='M1-M3' with a stale grade_year=6 still in
 * React state, and a cross-column CHECK would refuse that write outright. That
 * is the exact shape of the 31 Aug outage (profiles_grade_level_check) and the
 * 3 Sep one (student_profile_consent_auditable_check): a constraint that was
 * right about the data and wrong about the application, rejecting a write
 * instead of letting it correct itself.
 *
 * The coherence rule therefore lives in buildProfilePayload, not the database.
 * These tests are about proving it actually clears the stale value rather than
 * carrying it forward — offline against the function directly, and against the
 * live constraint where credentials are available.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProfilePayload, type SetupAnswers } from '@/lib/profile/setupAnswers';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIGRATION = read('scripts/20260903_v21_grade_year.sql');
/** SQL comments stripped. The migration's own comment explains, and quotes,
 *  the cross-column check that was deliberately rejected — a search over the
 *  raw text would match that explanation instead of the executable SQL. */
const MIGRATION_SQL = MIGRATION.replace(/--[^\n]*/g, '');

function answersFor(gradeLevel: string, gradeYear: number | null): SetupAnswers {
  return {
    displayName: 'สมชาย ใจดี', gradeLevel, gradeYear, gpa: '3.25', province: 'สุรินทร์',
    incomeBracket: 2, welfareCard: true, fields: ['วิศวกรรมศาสตร์'], priorKnowledge: 2,
    heardAboutUs: 'school_teacher', consentTerms: true, researchOptIn: true,
    guardianAcknowledged: true, acquisitionSource: 'fb',
  };
}

const opts = { consentVersion: '1.0', now: '2026-09-03T00:00:00.000Z' };

// ─── buildProfilePayload's coherence rule ────────────────────────────────────

describe('buildProfilePayload writes grade_year alongside grade_level', () => {
  it('writes a coherent year straight through', () => {
    const p = buildProfilePayload('u', answersFor('M4-M6', 6), opts);
    expect(p.grade_level).toBe('M4-M6');
    expect(p.grade_year).toBe(6);
  });

  it('clears a year that does not belong to the level, rather than writing it', () => {
    // The exact stale shape: changed to M1-M3, year=6 left over from M4-M6.
    const p = buildProfilePayload('u', answersFor('M1-M3', 6), opts);
    expect(p.grade_level).toBe('M1-M3');
    expect(p.grade_year).toBeNull();
  });

  it('writes null, explicitly, for a level with no years at all', () => {
    // Explicitly null and not just absent: vocational never had a year to keep,
    // so a stale one from a prior M4-M6 answer must be cleared here too.
    const p = buildProfilePayload('u', answersFor('vocational', 6), opts);
    expect(p.grade_level).toBe('vocational');
    expect('grade_year' in p).toBe(true);
    expect(p.grade_year).toBeNull();
  });

  it('does not touch grade_year when grade_level has not been answered yet', () => {
    // A partial save from an early step must not blank a value a LATER step
    // already wrote — compact() drops undefined keys for exactly this reason.
    const p = buildProfilePayload('u', answersFor('', null), opts);
    expect('grade_level' in p).toBe(false);
    expect('grade_year' in p).toBe(false);
  });

  it('writes null for a valid level whose year was never given', () => {
    // Level chosen, year question not yet reached (or skipped) — still a
    // coherent state, and still worth writing explicitly so a stale year from
    // a PREVIOUS level selection cannot survive under the new one.
    const p = buildProfilePayload('u', answersFor('M4-M6', null), opts);
    expect(p.grade_level).toBe('M4-M6');
    expect('grade_year' in p).toBe(true);
    expect(p.grade_year).toBeNull();
  });

  it('never writes an out-of-range year even if one somehow arrives', () => {
    // Defence in depth: coherentGradeYear, not just the UI, is what decides
    // what reaches the database.
    const p = buildProfilePayload('u', answersFor('M4-M6', 9 as unknown as number), opts);
    expect(p.grade_year).toBeNull();
  });
});

// ─── The real constraint, asked directly ─────────────────────────────────────

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

describe.skipIf(!live)('the live profiles_grade_year_check agrees (probe, writes nothing)', () => {
  /*
   * NON-MUTATING BY CONSTRUCTION, matching the pattern in
   * profileSetup.e2e.test.ts: a user_id absent from auth.users means a legal
   * row aborts on the FK (23503) and an illegal one aborts on its own CHECK
   * (23514) — before anything is ever written.
   */
  async function probe(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${live!.url}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: live!.key,
        Authorization: `Bearer ${live!.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000000', ...payload }),
    });
    if (res.status === 201) return 'INSERTED';
    const err = await res.json() as { code?: string; message?: string };
    if (err.code === '23503') return 'ALLOWED';
    return `${err.code}: ${err.message}`;
  }

  const MISSING = 'The live constraint disagrees. '
    + 'scripts/20260903_v21_grade_year.sql may not be applied — run it in the '
    + 'Supabase SQL Editor.';

  it('accepts every year 1 through 6', async () => {
    for (let year = 1; year <= 6; year++) {
      const result = await probe({ grade_year: year });
      expect(result, `year ${year}: ${MISSING}`).toBe('ALLOWED');
    }
  }, 30_000);

  it('accepts NULL — "not asked" is a real state, not a violation', async () => {
    expect(await probe({ grade_year: null })).toBe('ALLOWED');
  }, 20_000);

  it('refuses 0 and 7', async () => {
    expect(await probe({ grade_year: 0 })).toContain('profiles_grade_year_check');
    expect(await probe({ grade_year: 7 })).toContain('profiles_grade_year_check');
  }, 20_000);

  it('does not cross-check against grade_level — by design', async () => {
    // The migration's whole reasoning: an incoherent pairing must be a
    // correctable state in the app, never a refused write in the database.
    // M4-M6 with grade_year=2 is nonsensical and still has to be ALLOWED here,
    // or the next version of this constraint recreates the outage.
    expect(await probe({ grade_level: 'M4-M6', grade_year: 2 })).toBe('ALLOWED');
  }, 20_000);

  it('leaves profiles_grade_level_check exactly as v19 left it', async () => {
    // The one thing this migration must never touch.
    expect(await probe({ grade_level: 'M4-M6' })).toBe('ALLOWED');
    expect(await probe({ grade_level: 'M7' })).toContain('profiles_grade_level_check');
  }, 20_000);
});

describe('the migration itself', () => {
  it('does not drop or alter profiles_grade_level_check', () => {
    expect(MIGRATION).not.toMatch(/DROP CONSTRAINT IF EXISTS profiles_grade_level_check/);
    expect(MIGRATION).not.toMatch(/ALTER .*profiles_grade_level_check/);
  });

  it('constrains grade_year to 1-6 or NULL, with no cross-column check', () => {
    expect(MIGRATION).toContain('profiles_grade_year_check');
    expect(MIGRATION).toMatch(/CHECK \(grade_year IS NULL OR grade_year BETWEEN 1 AND 6\)/);
    // The deliberate omission this test suite exists to guard — checked
    // against the executable SQL only, since the migration's own comment
    // explains and quotes this exact rejected alternative as an example.
    expect(MIGRATION_SQL).not.toMatch(/grade_level\s*<>\s*'M4-M6'/);
  });

  it('is idempotent', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS grade_year');
    expect(MIGRATION).toContain('DROP CONSTRAINT IF EXISTS profiles_grade_year_check');
  });

  it('does not backfill', () => {
    // A range cannot be reverse-guessed into a specific year without putting
    // an answer on the record the student never gave.
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.profiles\s+SET\s+grade_year/i);
  });
});
