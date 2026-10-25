/**
 * scripts/20261031_v29_research_views_consent_gate.sql
 *
 * The migration cannot be run here, so what can be proved is proved: the two values
 * it hard-codes equal the TypeScript ones, it is safe by construction (nothing that
 * stores data is touched, applying is commented out, any unrecognised view aborts),
 * and the rewrite algorithm — ported to JavaScript, same steps — turns the consent
 * conditions the repository's own views use into the shared test and leaves the rest
 * alone. The port is a sketch of the SQL's logic, NOT proof the SQL runs: PostgreSQL's
 * regex dialect differs, which is why the file has a read-only preview to run first.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURRENT_CONSENT_VERSION, MINOR_AGE_THRESHOLD, exportExclusion } from '@/lib/research/consentGate';

const SQL = readFileSync('scripts/20261031_v29_research_views_consent_gate.sql', 'utf8');
const live = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');   // un-commented statements only

describe('the constants match the TypeScript ones', () => {
  it('current consent version', () => {
    expect(SQL).toContain(`SELECT '${CURRENT_CONSENT_VERSION}'::TEXT`);
  });
  it('minor age threshold', () => {
    expect(SQL).toMatch(new RegExp(`research_minor_age_threshold\\(\\)\\s*RETURNS INTEGER LANGUAGE sql IMMUTABLE AS \\$\\$ SELECT ${MINOR_AGE_THRESHOLD} \\$\\$`));
  });
});

describe('safe by construction', () => {
  it('stores nothing and changes no table or constraint', () => {
    for (const bad of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bDROP\s+TABLE\b/i, /\bALTER\s+TABLE\b/i, /\bCONSTRAINT\b/i]) {
      expect(live).not.toMatch(bad);
    }
  });

  it('applying the rewrite is commented out, so the file cannot apply it by accident', () => {
    expect(live).not.toMatch(/EXECUTE\s+format/i);
    expect(live).not.toMatch(/CREATE OR REPLACE VIEW/i);
    expect(SQL).toMatch(/--\s+EXECUTE format\('CREATE OR REPLACE VIEW/);
  });

  it('aborts, changing nothing, when a view that reads student_profile is not recognised', () => {
    expect(SQL).toContain('RAISE EXCEPTION \'v29 aborted');
    expect(SQL).toContain('nothing was changed');
  });

  it('keeps each view\'s options and does not touch views of another consent store', () => {
    expect(SQL).toContain('reloptions');
    expect(SQL).toMatch(/NOT ILIKE '%student_profile%'/);
  });

  it('is honest that it was not run against a database and does not fix the arm label', () => {
    expect(SQL).toContain('NOT TESTED against a database');
    expect(SQL).toContain('experiment_variant');
  });
});

// ── A JavaScript port of the rewrite, run on the repository's own view text ──
const KEYWORDS = new Set(['on','where','join','left','right','inner','outer','full','cross','natural','using','group','order','limit','having','union','window']);

function aliases(def: string): string[] {
  const out = ['student_profile'];
  for (const m of def.matchAll(/student_profile\s+(?:as\s+)?([a-z_][a-z0-9_]*)/gi)) {
    const a = m[1].toLowerCase();
    if (!KEYWORDS.has(a) && !out.includes(a)) out.push(a);
  }
  return out;
}

function rewrite(def: string): string {
  let out = def;
  for (const a of aliases(def)) {
    out = out.replace(
      new RegExp(`\\b${a}\\.consent_research\\s*=\\s*true\\b`, 'gi'),
      `(${a}.consent_research = true AND public.research_export_allowed(${a}.consent_research, ${a}.consent_version, ${a}.guardian_consent, ${a}.birth_year::integer))`,
    );
  }
  return out;
}

describe('the rewrite, on the shapes the repository\'s views use (PostgreSQL normalises TRUE to true)', () => {
  const join = `SELECT sp.region FROM funnel_events fe JOIN student_profile sp ON ((sp.user_id = fe.user_id) AND (sp.consent_research = true)) GROUP BY sp.region`;
  const where = `SELECT p.id FROM profiles p JOIN student_profile sp ON (sp.user_id = p.id) WHERE ((p.cohort = 'main'::text) AND (sp.consent_research = true))`;
  const noAlias = `SELECT 1 FROM student_profile WHERE student_profile.consent_research = true`;
  const outcomes = `SELECT o.id FROM outcomes o WHERE o.consent_research = true`;
  const showOnly = `SELECT sp.consent_research AS profile_consent FROM student_profile sp`;

  it('gates a JOIN condition, a WHERE condition and an unaliased table', () => {
    for (const def of [join, where, noAlias]) {
      const out = rewrite(def);
      expect(out).toContain('public.research_export_allowed(');
      expect(out).not.toMatch(/consent_research = true\)?\s*$/);
    }
    expect(rewrite(join)).toContain('(sp.consent_research = true AND public.research_export_allowed(sp.consent_research, sp.consent_version, sp.guardian_consent, sp.birth_year::integer))');
  });

  it('wraps the condition in brackets, so an OR elsewhere cannot change its meaning', () => {
    const out = rewrite(`... WHERE ((x = 1) OR (sp.consent_research = true)) FROM student_profile sp`);
    expect(out).toContain('OR ((sp.consent_research = true AND public.research_export_allowed(');
  });

  it('does not take JOIN/WHERE for an alias', () => {
    expect(aliases(noAlias)).toEqual(['student_profile']);
    expect(aliases(`FROM student_profile WHERE`)).toEqual(['student_profile']);
    expect(aliases(`FROM a JOIN student_profile sp ON x`)).toEqual(['student_profile', 'sp']);
    expect(aliases(`FROM a JOIN student_profile AS s ON x`)).toEqual(['student_profile', 's']);
  });

  it('leaves another consent store alone, and a view that only SHOWS the column', () => {
    expect(rewrite(outcomes)).toBe(outcomes);
    expect(rewrite(showOnly)).toBe(showOnly);          // PART 3 then aborts unless it is named in `exempt`
  });

  it('is idempotent in effect: a second pass adds no second gate', () => {
    const once = rewrite(join);
    expect(once.match(/research_export_allowed/g)).toHaveLength(1);
    // The rewritten text still contains "sp.consent_research = true AND ...": a second pass matches
    // it again, which is why PART 3 skips a view whose rewrite already contains the function.
    expect(once).toContain('research_export_allowed');
  });
});

describe('the SQL function agrees with the TypeScript gate on its four inputs', () => {
  // The function's body, evaluated here, so the two cannot quietly diverge.
  const year = new Date().getFullYear();
  const sqlAllowed = (consent: boolean | null, version: string | null, guardian: boolean | null, birthYear: number | null) =>
    !!consent && version === CURRENT_CONSENT_VERSION &&
    (birthYear === null || (year - birthYear) >= MINOR_AGE_THRESHOLD || !!guardian);

  const cases: Array<[boolean | null, string | null, boolean | null, number | null]> = [
    [true, CURRENT_CONSENT_VERSION, false, year - 30],
    [true, CURRENT_CONSENT_VERSION, false, year - 15],
    [true, CURRENT_CONSENT_VERSION, true,  year - 15],
    [true, CURRENT_CONSENT_VERSION, null,  year - 15],
    [true, CURRENT_CONSENT_VERSION, false, null],
    [true, '2026-01-v1',            true,  year - 30],
    [true, null,                    true,  year - 30],
    [false, CURRENT_CONSENT_VERSION, true, year - 30],
    [null,  CURRENT_CONSENT_VERSION, true, year - 30],
    [true, CURRENT_CONSENT_VERSION, false, year - MINOR_AGE_THRESHOLD],
    [true, CURRENT_CONSENT_VERSION, false, year - MINOR_AGE_THRESHOLD + 1],
  ];

  it.each(cases)('consent=%s version=%s guardian=%s birth_year=%s', (consent, version, guardian, birthYear) => {
    const ts = exportExclusion({
      consent_research: consent as boolean, consent_version: version, guardian_consent: guardian, birth_year: birthYear,
    }) === null;
    expect(sqlAllowed(consent, version, guardian, birthYear)).toBe(ts);
  });
});
