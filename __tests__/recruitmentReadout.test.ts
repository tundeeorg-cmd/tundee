/**
 * Guards the recruitment readout against leaking outcome data.
 *
 * PREREG §8 commits to no interim outcome analysis before the stopping date.
 * The admin dashboard is where that commitment is most likely to be broken by
 * accident — someone adds "just the apply rate" to a panel that is already
 * showing arms side by side, and the study's false positive rate quietly rises.
 *
 * These tests read the actual source. They are deliberately blunt: if a future
 * edit introduces an outcome term into either file, this fails and the reason
 * is in the message. A comment asking people not to would not have that effect.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const API_PATH = join(ROOT, 'app/api/admin/recruitment/route.ts');
const UI_PATH  = join(ROOT, 'components/admin/RecruitmentProgress.tsx');

const api = readFileSync(API_PATH, 'utf8');
const target = readFileSync(join(ROOT, 'lib/research/recruitmentTarget.ts'), 'utf8');
const ui  = readFileSync(UI_PATH, 'utf8');

/**
 * Identifiers that would mean an outcome is being read or rendered. Matched
 * against code only — the files discuss these words in their header comments,
 * which is the point, so comments are stripped first.
 */
const OUTCOME_TERMS = [
  'apply_click',
  'applyRate',
  'apply_rate',
  'clicked_through',
  'conversion',
  'awarded',
  'award_count',
  'outcome',
  'application_started',
  'application_submitted',
  'scholarship_applied',
];

/** Strips // line comments and block comments so prose does not trip the scan. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

describe('recruitment API returns enrollment counts only (PREREG §8)', () => {
  it('reads from the outcome-free view, not from a table that has outcomes', () => {
    expect(api).toContain("from('v_recruitment_progress')");
    // funnel_events, user_events and apply_click all carry outcome signal.
    for (const table of ['funnel_events', 'user_events', 'apply_click', 'applications', 'outcomes']) {
      expect(codeOnly(api), `recruitment API must not query ${table}`).not.toContain(`from('${table}')`);
    }
  });

  it('contains no outcome identifiers in its code', () => {
    const code = codeOnly(api);
    for (const term of OUTCOME_TERMS) {
      expect(code, `"${term}" appeared in the recruitment API — outcomes must not be exposed before the stopping date`)
        .not.toContain(term);
    }
  });

  it('selects an explicit column list, so a view change cannot silently widen it', () => {
    // select('*') would pick up any column later added to the view.
    expect(codeOnly(api)).not.toContain(".select('*')");
    expect(api).toContain('region_group, income_bracket, ranking_variant');
  });

  it('is admin-gated before any data is read', () => {
    const gateIndex  = api.indexOf('requireAdmin');
    const queryIndex = api.indexOf("from('v_recruitment_progress')");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex, 'the admin check must precede the query').toBeLessThan(queryIndex);
  });
});

describe('recruitment UI renders enrollment counts only', () => {
  it('contains no outcome identifiers in its code', () => {
    const code = codeOnly(ui);
    for (const term of OUTCOME_TERMS) {
      expect(code, `"${term}" appeared in the recruitment panel — enrollment counts only`)
        .not.toContain(term);
    }
  });

  it('fetches only the recruitment endpoint', () => {
    const fetches = [...codeOnly(ui).matchAll(/fetch\(\s*['"`]([^'"`]+)/g)].map(m => m[1]);
    expect(fetches).toEqual(['/api/admin/recruitment']);
  });
});

describe('the target is the pre-registered one', () => {
  it('uses 294 per arm, matching PREREG §7.2', () => {
    expect(target).toContain('TARGET_PER_ARM = 294');
    expect(api).toContain('TARGET_PER_ARM');
  });

  it('measures progress by the SMALLER arm', () => {
    // Being ahead in one arm buys nothing: the study is powered on having 294
    // in each. Reporting the larger arm would overstate readiness.
    expect(api).toContain('Math.min(baseline, fairness)');
  });
});
