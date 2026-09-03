/**
 * grade_year on the two screens that ask for it: the wizard and /profile.
 *
 * Both need the same three properties, checked here by reading the source —
 * the pages themselves need a live authenticated session (LINE or email OTP)
 * to reach, which this suite cannot fabricate, matching how every other
 * session-gated page in this repo is tested:
 *
 *   1. the question is asked, but only for the two levels that have a year;
 *   2. changing the level resets the year, so the screen can never show ม.6
 *      next to ม.1–3 even briefly;
 *   3. the year travels to the server bundled with the level, in the same
 *      request — /api/profile/save only corrects a stale year when both
 *      arrive together (see gradeYearPayload.test.ts and its migration
 *      comment for why that coupling exists).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Comments quote the code and reasoning they explain — twice today a naive
 *  string search matched the comment instead of the logic it was about. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const WIZARD      = read('app/profile/setup/page.tsx');
const WIZARD_CODE = code('app/profile/setup/page.tsx');
const PROFILE      = read('app/profile/page.tsx');
const PROFILE_CODE = code('app/profile/page.tsx');
const SCHOLARSHIPS = read('app/scholarships/page.tsx');

// ─── The wizard ──────────────────────────────────────────────────────────────

describe('the wizard asks the year question', () => {
  it('gates it on hasGradeYear, not on a hardcoded level list', () => {
    // A restated list here would drift from GRADE_YEARS in
    // lib/profile/gradeLevels.ts the same way the three grade vocabularies
    // drifted before 31 Aug — see that file's own header for what that cost.
    expect(WIZARD).toContain('hasGradeYear');
    expect(WIZARD).toContain("import {\n  GRADE_LEVELS, canonicalizeGradeLevel, hasGradeYear, gradeYearsFor, gradeYearLabel,\n  coherentGradeYear,\n} from '@/lib/profile/gradeLevels';");
  });

  it('does not advance past step 3 when the chosen level has a year', () => {
    const fn = WIZARD_CODE.slice(
      WIZARD_CODE.indexOf('function chooseGradeLevel'),
      WIZARD_CODE.indexOf('function chooseGradeYear'),
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toMatch(/if \(hasGradeYear\(value\)\) return;/);
    // And it must still advance for the three levels that have nothing further
    // to ask — this is not "never advance from step 3", only "not yet".
    expect(fn).toContain('setStep(4)');
  });

  it('resets the year the instant the level changes', () => {
    const fn = WIZARD_CODE.slice(
      WIZARD_CODE.indexOf('function chooseGradeLevel'),
      WIZARD_CODE.indexOf('function chooseGradeYear'),
    );
    expect(fn).toContain('setGradeYear(null)');
  });

  it('sends the reset explicitly in the same partial save as the new level', () => {
    // Not left to a later call: persistStep(3, {...answers, gradeLevel: value})
    // without gradeYear explicitly nulled would send whatever gradeYear was
    // still in React state from the PREVIOUS level, one request early.
    const fn = WIZARD_CODE.slice(
      WIZARD_CODE.indexOf('function chooseGradeLevel'),
      WIZARD_CODE.indexOf('function chooseGradeYear'),
    );
    expect(fn).toMatch(/persistStep\(3,\s*\{\s*\.\.\.answers,\s*gradeLevel:\s*value,\s*gradeYear:\s*null\s*\}\)/);
  });

  it('offers a way back to the level list, distinct from the wizard\'s own Back', () => {
    // prevStep would leave step 3 for step 2 — the wrong destination for
    // someone who tapped the wrong LEVEL, not someone who wants the PRIOR
    // question (prior scholarship knowledge).
    expect(WIZARD_CODE).toContain("setGradeLevel(''); setGradeYear(null); setFieldError(null);");
  });

  it('lets the year question be skipped, same as the level question always could', () => {
    expect(WIZARD).toContain('ข้ามก่อน');
  });

  it('restores year from a stored profile through the coherence check', () => {
    // Not a raw pass-through: a year stored under a level that has since been
    // upgraded (the retired 'M4'/'M5'/'M6' vocabulary) must not be shown as if
    // it belonged to the canonicalized level.
    expect(WIZARD_CODE).toContain('coherentGradeYear(grade, merged.gradeYear)');
  });

  it('fetches grade_year in the profile-hydration query', () => {
    expect(WIZARD).toContain('grade_level, grade_year, gpa');
  });

  it('does not ask the year question for a /start-prefilled student, and says why', () => {
    // PREFILLED_STEPS jumps 2 → 7, so step 3 never renders for them —
    // documented, not silently missing.
    expect(WIZARD).toMatch(/No gradeYear here:[\s\S]{0,80}\/start/);
  });
});

// ─── /profile ────────────────────────────────────────────────────────────────

describe('the /profile edit page asks the same question inline', () => {
  it('shows the year picker only under a level that has one', () => {
    expect(PROFILE).toContain('hasGradeYear(gradeLevel)');
    expect(PROFILE).toContain('gradeYearsFor(gradeLevel)');
  });

  it('resets the year the moment a different level chip is clicked', () => {
    const block = PROFILE_CODE.slice(
      PROFILE_CODE.indexOf('GRADE_LEVELS.map(gl'),
      PROFILE_CODE.indexOf('GRADE_LEVELS.map(gl') + 600,
    );
    expect(block).toContain('setGradeYear(null)');
  });

  it('sends gradeYear in the SAME save call as gradeLevel, always', () => {
    // /api/profile/save only corrects a stale year when both arrive in one
    // patch (see app/api/profile/save/route.ts) — this page has exactly one
    // "Save profile" button for the whole study-details section, which is
    // what makes that coupling hold.
    const fn = PROFILE_CODE.slice(
      PROFILE_CODE.indexOf('async function handleSaveProfile'),
      PROFILE_CODE.indexOf('async function handleSaveProfile') + 800,
    );
    expect(fn).toContain('gradeLevel');
    expect(fn).toContain('gradeYear');
    expect(fn.indexOf('gradeLevel')).toBeLessThan(fn.indexOf('fields:'));
    expect(fn.indexOf('gradeYear')).toBeLessThan(fn.indexOf('fields:'));
  });

  it('restores a stored year through the coherence check, not a raw read', () => {
    expect(PROFILE_CODE).toContain('coherentGradeYear(canonicalGrade, data.grade_year)');
  });
});

// ─── The matcher receives it ─────────────────────────────────────────────────

describe('the scholarships page passes gradeYear into the grouping', () => {
  it('reads grade_year from the profile row', () => {
    expect(SCHOLARSHIPS).toContain('grade_year');
  });

  it('threads it into groupMatches, not just grade_level', () => {
    expect(SCHOLARSHIPS).toMatch(
      /groupMatches\(matchesToRender,\s*userProfile\?\.grade_level,\s*\{\s*gradeYear:\s*userProfile\?\.grade_year\s*\}\)/,
    );
  });

  it('renders the "prepare ahead" note when matchGroups sets one', () => {
    // Priority 3 added `note` to MatchGroup; if the page never reads it, a ม.4
    // student sees the undergraduate group with no explanation for why it is
    // there before they can apply to any of it.
    expect(SCHOLARSHIPS).toContain('group.note');
  });
});
