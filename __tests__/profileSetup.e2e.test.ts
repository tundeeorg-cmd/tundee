/**
 * The nine-step onboarding wizard, walked end to end, for every grade option.
 *
 * This path is the entire product — a student who cannot finish it has no
 * profile, and the matching engine has nothing to serve them. It had no test at
 * all until 31 Aug 2026, which is how three of the five grade options came to be
 * unsaveable for two months:
 *
 *   [23514] new row for relation "profiles" violates check constraint
 *   "profiles_grade_level_check"
 *
 * Production at the time: 16 'uni', 5 'graduate', 1 'M6', 18 NULL, and zero
 * high-school or vocational students on a product built for Thai high-school
 * students. Those were exactly the two values legal in both the wizard's list
 * and the database's — the arithmetic of a mismatch nobody was checking.
 *
 * Four things are asserted here, and all four have to hold:
 *   1. every option survives all nine steps and produces a writable payload
 *   2. the database's CHECK domain and the app's option list are the same set
 *   3. no source file re-declares grade levels, and no raw error can reach a user
 *   4. every option is understood by the live matcher — a profile that saves and
 *      never matches is not a fix
 *
 * Plus, when Supabase credentials are present, the real constraint is asked
 * directly (see the live block at the bottom).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GRADE_LEVELS, GRADE_LEVEL_VALUES, canonicalizeGradeLevel } from '@/lib/profile/gradeLevels';
import {
  validateField,
  validateSetupAnswers,
  buildProfilePayload,
  hasErrors,
  determineSignupCohort,
  type SetupAnswers,
  type SetupField,
} from '@/lib/profile/setupAnswers';
import { resumeStep, answersFromProfile } from '@/lib/profile/setupDraft';
import {
  normalizeGradeLevel,
  normalizeScholarshipLevel,
  levelsAreCompatible,
} from '@/lib/recommender/gradeLevel';
import { PREVIEW_LEVELS, parsePreviewInput } from '@/lib/preview/types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MIGRATION = read('scripts/20260831_v19_grade_level_domain.sql');
const WIZARD    = read('app/profile/setup/page.tsx');
const API_ROUTE = read('app/api/profile/setup/route.ts');
const PROFILE   = read('app/profile/page.tsx');

// ─── The nine steps, as the wizard runs them ─────────────────────────────────

/**
 * Which answer each step owns. Mirrors STEP_FIELD in the wizard; the test walks
 * the same sequence a student does, validating on the way out of each step.
 */
const STEPS: Array<{ n: number; name: string; field?: SetupField }> = [
  { n: 0, name: 'consent (PDPA)',          field: 'consentTerms' },
  { n: 1, name: 'name' },
  { n: 2, name: 'prior scholarship knowledge', field: 'priorKnowledge' },
  { n: 3, name: 'grade level',             field: 'gradeLevel' },
  { n: 4, name: 'GPA',                     field: 'gpa' },
  { n: 5, name: 'province',                field: 'province' },
  { n: 6, name: 'income & welfare card',   field: 'incomeBracket' },
  { n: 7, name: 'fields of interest' },
  { n: 8, name: 'how did you hear about us', field: 'heardAboutUs' },
];

/** A realistic Isan student, answering every step, at the given grade. */
function answersFor(gradeLevel: string): SetupAnswers {
  return {
    displayName:          'สมชาย ใจดี',
    gradeLevel,
    gpa:                  '3.25',
    province:             'สุรินทร์',
    incomeBracket:        2,
    welfareCard:          true,
    fields:               ['วิศวกรรมศาสตร์'],
    priorKnowledge:       2,
    heardAboutUs:         'school_teacher',
    consentTerms:         true,
    researchOptIn:        true,
    guardianAcknowledged: true,
    acquisitionSource:    'fb',
  };
}

describe('all nine steps, for every selectable grade level', () => {
  it('offers exactly five options and no duplicates', () => {
    expect(GRADE_LEVELS).toHaveLength(5);
    expect(new Set(GRADE_LEVEL_VALUES).size).toBe(5);
    for (const opt of GRADE_LEVELS) {
      expect(opt.th.trim()).not.toBe('');
      expect(opt.en.trim()).not.toBe('');
    }
  });

  for (const option of GRADE_LEVELS) {
    describe(`${option.th} (${option.value})`, () => {
      const answers = answersFor(option.value);

      it('passes validation on the way out of every step', () => {
        for (const step of STEPS) {
          if (!step.field) continue;
          const value = (answers as Record<string, unknown>)[step.field];
          const code = validateField(step.field, value);
          expect(
            code,
            `step ${step.n} (${step.name}) rejected "${String(value)}" as ${code}`,
          ).toBeNull();
        }
      });

      it('passes the submit-time validation the API also runs', () => {
        const errors = validateSetupAnswers(answers);
        expect(hasErrors(errors), `rejected: ${JSON.stringify(errors)}`).toBe(false);
      });

      it('builds a payload the database will accept', () => {
        const payload = buildProfilePayload('11111111-2222-3333-4444-555555555555', answers, {
          consentVersion: '1.0',
          now: '2026-08-31T00:00:00.000Z',
        });

        // The value the constraint sees.
        expect(payload.grade_level).toBe(option.value);
        expect(GRADE_LEVEL_VALUES).toContain(payload.grade_level as string);

        // Nothing else in the same insert can fail a CHECK either — this is the
        // whole class of bug, not just its first symptom.
        expect(payload.income_bracket).toBeGreaterThanOrEqual(1);
        expect(payload.income_bracket).toBeLessThanOrEqual(7);
        expect(payload.gpa as number).toBeGreaterThanOrEqual(0);
        expect(payload.gpa as number).toBeLessThanOrEqual(4);
        // profiles_signup_cohort_check rejects '', so a derived cohort must
        // always be one of the four waves — never blank.
        expect(['wave_1_bangkok', 'wave_2_northeast', 'wave_2_north', 'wave_3_national'])
          .toContain(payload.signup_cohort as string);
        // The self-report goes to heard_about_us. Writing it into
        // recruitment_source violates that column's CHECK, by design (v16).
        expect(payload.heard_about_us).toBe('school_teacher');
        expect(payload).not.toHaveProperty('recruitment_source');
      });

      it('is understood by the matcher, so the profile is not a dead end', () => {
        const bucket = normalizeGradeLevel(option.value);
        expect(bucket, `${option.value} normalizes to nothing`).not.toBeNull();

        // At least one real scholarship level must admit this student. An option
        // that saves and then matches nothing is not a fixed option.
        const scholarshipLevels = ['high_school', 'vocational', 'undergraduate', 'graduate', 'multiple'];
        const reachable = scholarshipLevels.filter(level =>
          levelsAreCompatible(normalizeScholarshipLevel(level), [bucket]),
        );
        expect(reachable.length, `${option.value} matches no scholarship level`).toBeGreaterThan(0);
      });

      it('survives the /start preview round trip that prefills the wizard', () => {
        const parsed = parsePreviewInput({
          level: option.value, province: 'สุรินทร์', income: 2, gpa: 3.25,
        });
        expect(parsed, `/start rejects ${option.value}`).not.toBeNull();
        expect(parsed!.level).toBe(option.value);
      });
    });
  }
});

// ─── The database and the app must hold the same list ────────────────────────

describe('the constraint and the option list cannot drift apart', () => {
  /** The values inside the migration's CHECK (grade_level ... IN (...)). */
  function constraintDomain(): string[] {
    const check = MIGRATION.match(
      /ADD CONSTRAINT profiles_grade_level_check\s+CHECK\s*\(([\s\S]*?)\);/,
    );
    expect(check, 'migration has no profiles_grade_level_check').not.toBeNull();
    return [...check![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  }

  it('the migration admits exactly the five options the app offers', () => {
    expect(new Set(constraintDomain())).toEqual(new Set(GRADE_LEVEL_VALUES));
  });

  it('the migration still permits NULL — "not answered yet" is a real state', () => {
    expect(MIGRATION).toContain('grade_level IS NULL OR grade_level IN');
  });

  it('the retired single-year values are rewritten, not left to fail', () => {
    expect(MIGRATION).toMatch(/SET grade_level = 'M4-M6'\s+WHERE grade_level IN \('M4', 'M5', 'M6'\)/);
    expect(constraintDomain()).not.toContain('M6');
    // …and a stale browser tab holding one is upgraded rather than rejected.
    expect(canonicalizeGradeLevel('M6')).toBe('M4-M6');
    expect(canonicalizeGradeLevel('M4')).toBe('M4-M6');
  });

  it('rejects the values that broke production, and blank', () => {
    for (const bad of ['', ' ', 'high_school', 'bachelor', 'ม.4–6', 'M7']) {
      expect(canonicalizeGradeLevel(bad), `${bad} was accepted`).toBeNull();
    }
  });

  it('/start offers the same five levels as the wizard, in the same order', () => {
    expect(PREVIEW_LEVELS.map(l => l.value)).toEqual([...GRADE_LEVEL_VALUES]);
  });
});

// ─── No file may re-declare the vocabulary, and no user may see raw SQL ──────

describe('the failure modes are structurally impossible, not merely fixed', () => {
  it('no page declares its own grade-level list', () => {
    // Three lists in three files is what caused this. Any file that spells the
    // values out again has re-created the bug.
    for (const [name, src] of [['wizard', WIZARD], ['profile page', PROFILE]] as const) {
      expect(src, `${name} re-declares grade values`).not.toMatch(/'M1-M3'\s*,/);
      expect(src, `${name} re-declares the retired values`).not.toMatch(/\['M4', 'M5', 'M6'/);
    }
    expect(WIZARD).toContain("from '@/lib/profile/gradeLevels'");
    expect(PROFILE).toContain("from '@/lib/profile/gradeLevels'");
  });

  it('the wizard never renders a database error', () => {
    // The old code did exactly this: {error} held upsertErr.message.
    expect(WIZARD).not.toContain('font-mono text-red-500');
    expect(WIZARD).not.toMatch(/setError\(`\[\$\{[^}]*code\}\]/);
    // Errors are codes, turned into Thai copy by lib/profile/setupMessages.ts.
    expect(WIZARD).toContain('saveMessage(error, lang)');
    expect(WIZARD).toContain('RETRY_LABEL');
  });

  it('the API returns a code, never a Postgres message', () => {
    expect(API_ROUTE).toContain("error: 'save_failed'");
    // The real error is logged server-side…
    expect(API_ROUTE).toMatch(/console\.error\([\s\S]*pgCode/);
    // …and never put in a response body.
    expect(API_ROUTE).not.toMatch(/NextResponse\.json\([^)]*error\.message/);
    expect(API_ROUTE).not.toMatch(/NextResponse\.json\([^)]*error\.details/);
  });

  it('the wizard writes every step, rather than everything at the end', () => {
    expect(WIZARD).toContain('persistStep(step)');
    expect(WIZARD).toContain('saveDraft');
    expect(WIZARD).toContain("partial: true");
  });

  it('the silent zero-row UPDATE fallback is gone', () => {
    // .update().eq(id) on a user with no row matches nothing, which PostgREST
    // reports as success. The old wizard then fired profile_completed and
    // redirected — 20 accounts reported a completed profile they do not have.
    expect(WIZARD).not.toMatch(/\.update\(updateFields\)/);
    expect(WIZARD).not.toContain('saved via update fallback');
  });

  it('the grade step cannot select a value the database would refuse', () => {
    expect(WIZARD).toContain('chooseGradeLevel(opt.value)');
    expect(WIZARD).toMatch(/function chooseGradeLevel[\s\S]*validateField\('gradeLevel', value\)/);
  });
});

// ─── Resuming, so nine steps are never asked twice ───────────────────────────

describe('a student who lost a save resumes where they stopped', () => {
  it('opens at step 0 for someone with no row', () => {
    expect(resumeStep(null)).toBe(0);
  });

  it('opens at the grade question when that is the first gap', () => {
    expect(resumeStep({
      consent_version: '1.0',
      display_name: 'สมชาย',
      prior_scholarship_knowledge: 2,
      grade_level: null,
    })).toBe(3);
  });

  it('does not re-ask GPA, which is optional and may have been declined', () => {
    const step = resumeStep({
      consent_version: '1.0', display_name: 'สมชาย', prior_scholarship_knowledge: 2,
      grade_level: 'M4-M6', gpa: null, province: 'สุรินทร์', income_bracket: 2,
      fields_of_interest: ['วิศวกรรมศาสตร์'], heard_about_us: 'school_teacher',
    });
    expect(step).not.toBe(4);
  });

  it('treats the default ["any"] as unanswered, not as a choice', () => {
    expect(resumeStep({
      consent_version: '1.0', display_name: 'สมชาย', prior_scholarship_knowledge: 2,
      grade_level: 'uni', province: 'สุรินทร์', income_bracket: 2,
      fields_of_interest: ['any'],
    })).toBe(7);
  });

  it('replays a stored row back into the wizard, upgrading a retired grade', () => {
    const restored = answersFromProfile({
      display_name: 'สมชาย', grade_level: 'M6', gpa: 3.25, province: 'สุรินทร์',
      income_bracket: 2, fields_of_interest: ['any', 'วิศวกรรมศาสตร์'],
      heard_about_us: 'school_teacher', consent_version: '1.0',
    });
    expect(restored.province).toBe('สุรินทร์');
    expect(restored.gpa).toBe('3.25');
    expect(restored.fields).toEqual(['วิศวกรรมศาสตร์']);
    expect(restored.consentTerms).toBe(true);
    expect(canonicalizeGradeLevel(restored.gradeLevel)).toBe('M4-M6');
  });
});

describe('skipping the grade question is allowed, as it always was', () => {
  it('a student who skips still saves — a skipped answer is not a refusal', () => {
    const skipped = { ...answersFor(''), gradeLevel: '' };
    expect(hasErrors(validateSetupAnswers(skipped))).toBe(false);
    const payload = buildProfilePayload('11111111-2222-3333-4444-555555555555', skipped, {
      consentVersion: '1.0', now: '2026-08-31T00:00:00.000Z',
    });
    // Absent, not empty: profiles_grade_level_check rejects '' and the upsert
    // must not overwrite a grade /auth/callback may already have written.
    expect(payload).not.toHaveProperty('grade_level');
  });

  it('but a grade that IS given must be one the database accepts', () => {
    const bad = { ...answersFor('M4-M6'), gradeLevel: 'ม.4–6' };
    expect(validateSetupAnswers(bad).gradeLevel).toBe('grade_level_invalid');
  });

  it('consent, unlike grade, is genuinely required', () => {
    const noConsent = { ...answersFor('uni'), consentTerms: false };
    expect(validateSetupAnswers(noConsent).consentTerms).toBe('consent_required');
  });
});

describe('signup_cohort is always a value its constraint accepts', () => {
  it('never returns blank, for any province or none', () => {
    for (const p of ['สุรินทร์', 'กรุงเทพมหานคร', 'เชียงใหม่', 'TH-10', 'TH-30', 'ภูเก็ต', 'ไม่มีจังหวัดนี้', '']) {
      expect(determineSignupCohort(p)).toMatch(/^wave_[123]_/);
    }
  });
});

// ─── The real constraint, asked directly ─────────────────────────────────────

/**
 * Runs only when Supabase credentials are present (locally, from .env.local);
 * skipped in CI, where the offline assertions above still run.
 *
 * NON-MUTATING BY CONSTRUCTION. Each probe INSERTs with a UUID that is not in
 * auth.users. Postgres evaluates CHECK constraints before the foreign-key
 * trigger, so a legal value aborts on the FK (23503) and an illegal one aborts
 * on the CHECK (23514). Both abort. No row is ever written.
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
  } catch { /* no .env.local — offline run */ }
  return null;
}

const live = loadEnv();

describe.skipIf(!live)('the live database accepts every option (probe, writes nothing)', () => {
  async function probe(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${live!.url}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: live!.key,
        Authorization: `Bearer ${live!.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      // A UUID that cannot exist in auth.users, so the FK always aborts the row.
      body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000000', ...payload }),
    });
    if (res.status === 201) return 'INSERTED';
    const err = await res.json() as { code?: string; message?: string };
    if (err.code === '23503') return 'ALLOWED';
    return `${err.code}: ${err.message}`;
  }

  for (const option of GRADE_LEVELS) {
    it(`accepts the full nine-step payload at ${option.th} (${option.value})`, async () => {
      const payload = buildProfilePayload('00000000-0000-4000-8000-000000000000', answersFor(option.value), {
        consentVersion: '1.0',
        now: '2026-08-31T00:00:00.000Z',
      });
      const { id: _id, ...columns } = payload;
      const result = await probe(columns);
      expect(
        result,
        result.includes('profiles_grade_level_check')
          ? 'The live constraint still rejects this option. '
            + 'scripts/20260831_v19_grade_level_domain.sql has not been applied yet — '
            + 'run it in the Supabase SQL Editor and this passes.'
          : `unexpected: ${result}`,
      ).toBe('ALLOWED');
    }, 20_000);
  }

  it('still refuses a value outside the canonical set', async () => {
    expect(await probe({ grade_level: 'M7' })).toContain('profiles_grade_level_check');
  }, 20_000);
});
