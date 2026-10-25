/**
 * The age question on /start (PART 3 / the proposal to the research team).
 *
 * A visitor is offered the study only if they say they have reached the age
 * threshold; everyone else gets the whole service, the baseline ranking, and no place
 * in the study — no assignment, no cookie, no row. The answer is self-declared, which
 * these tests cannot change and the ethics application has to say.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MINOR_AGE_THRESHOLD } from '@/lib/research/consentGate';
import { START_ADULT_AGE, mayBeRandomized, researchParticipation } from '@/lib/research/startEligibility';
import { START_CONSENT } from '@/lib/research/startConsent';

const read = (p: string) => readFileSync(p, 'utf8');

describe('one threshold', () => {
  it('is the same number the export uses for the guardian rule', () => {
    expect(START_ADULT_AGE).toBe(MINOR_AGE_THRESHOLD);
  });

  it('and the question says that number, so changing it changes what visitors read', () => {
    expect(START_CONSENT.ageQuestion).toContain(String(START_ADULT_AGE));
    expect(START_CONSENT.ageYes).toContain(String(START_ADULT_AGE));
  });
});

describe('mayBeRandomized', () => {
  it('needs a declared adult AND a yes, each an explicit true', () => {
    expect(mayBeRandomized({ adult: true, consent: true })).toBe('ok');
  });

  it('age is checked first: a minor who ticked consent is ineligible, not a decliner', () => {
    expect(mayBeRandomized({ adult: false, consent: true })).toBe('ineligible_minor');
    expect(mayBeRandomized({ adult: undefined, consent: true })).toBe('ineligible_minor');
    expect(mayBeRandomized({ adult: 'true', consent: true })).toBe('ineligible_minor');
  });

  it('an adult who does not agree has declined', () => {
    for (const consent of [false, undefined, null, 'true', 1]) {
      expect(mayBeRandomized({ adult: true, consent })).toBe('no_consent');
    }
  });
});

describe('researchParticipation — what the quiz event records', () => {
  const p = (offered: boolean, adult: boolean | null, consented: boolean) => researchParticipation({ offered, adult, consented });

  it('says nothing is offered while randomization is off', () => {
    expect(p(false, null, false)).toBe('not_offered');
    expect(p(false, true, true)).toBe('not_offered');
  });

  it('separates every outcome, so reach among under-age visitors can be reported', () => {
    expect(p(true, null, false)).toBe('age_not_answered');
    expect(p(true, false, false)).toBe('ineligible_minor');
    expect(p(true, false, true)).toBe('ineligible_minor');     // a stale tick can never count
    expect(p(true, true, false)).toBe('declined');
    expect(p(true, true, true)).toBe('consented');
  });
});

describe('the matcher', () => {
  const src = read('app/start/PreviewMatcher.tsx');

  it('asks age only when the study is offered, and never pre-selects an answer', () => {
    expect(src).toContain('useState<boolean | null>(null)');
    expect(src).toMatch(/researchConsentOffered && \(/);
  });

  it('shows the consent text only after "yes", and clears a tick when the answer becomes "no"', () => {
    expect(src).toContain('adult === true && (');
    expect(src).toContain('if (!value) setResearchConsent(false)');
  });

  it('randomizes only a declared adult who ticked, and sends both facts to the server', () => {
    expect(src).toContain('researchConsentOffered && adult === true && researchConsent');
    expect(src).toContain('adult: true, consent: true');
  });

  it('never blocks the quiz: the age question is skippable and the form submits regardless', () => {
    expect(src).not.toMatch(/adult === null\) \{[^}]*setMessage/);
    expect(src).toContain('research_participation: researchParticipation(');
  });

  it('gives an under-age visitor the whole service, in words', () => {
    expect(START_CONSENT.minorOutcome).toMatch(/ใช้ทุนดีได้เต็มที่/);
    expect(src).toContain('START_CONSENT.minorOutcome');
  });
});

describe('the route enforces it too', () => {
  const src = read('app/api/start/randomize/route.ts');
  it('checks age before consent, on the server', () => {
    expect(src).toContain('mayBeRandomized({ adult: body?.adult, consent: body?.consent })');
    expect(src.indexOf('mayBeRandomized(')).toBeLessThan(src.indexOf('createAdminClient()'));
  });
});
