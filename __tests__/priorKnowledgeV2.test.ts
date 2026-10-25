/**
 * Prior-knowledge question, version 2 (PART 2 step 5).
 *
 * 0 means "knew none"; "unsure" is its own answer and never a 0; every answer
 * carries the wording version it was given under; a skipped question writes
 * nothing, so an autosave cannot clear an earlier answer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildProfilePayload, type SetupAnswers } from '@/lib/profile/setupAnswers';
import {
  PRIOR_KNOWLEDGE_QUESTION_HISTORY, PRIOR_KNOWLEDGE_QUESTION_VERSION,
} from '@/lib/research/questionVersions';
import { answersFromProfile, resumeStep } from '@/lib/profile/setupDraft';

const upsert = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ error: null })));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: () => ({ upsert }),
  }),
}));

const build = (a: Partial<SetupAnswers>) =>
  buildProfilePayload('u-1', a, { consentVersion: 'c1' }) as Record<string, unknown>;

describe('buildProfilePayload — prior knowledge', () => {
  it('a number is written with its version, with unsure explicitly false', () => {
    const p = build({ priorKnowledge: 0, askedAfterSeeingResults: true });
    expect(p.prior_scholarship_knowledge).toBe(0);            // 0 stays 0
    expect(p.prior_knowledge_unsure).toBe(false);
    expect(p.prior_knowledge_question_version).toBe(PRIOR_KNOWLEDGE_QUESTION_VERSION);
    expect(p.asked_after_seeing_results).toBe(true);
  });

  it('"unsure" clears the number explicitly and sets its own flag', () => {
    const p = build({ priorKnowledge: null, priorKnowledgeUnsure: true, askedAfterSeeingResults: false });
    expect('prior_scholarship_knowledge' in p).toBe(true);    // present, so an earlier answer is overwritten
    expect(p.prior_scholarship_knowledge).toBeNull();
    expect(p.prior_knowledge_unsure).toBe(true);
    expect(p.prior_knowledge_question_version).toBe(PRIOR_KNOWLEDGE_QUESTION_VERSION);
    expect(p.asked_after_seeing_results).toBe(false);
  });

  it('a skipped question writes none of the four columns', () => {
    const p = build({ priorKnowledge: null, gradeLevel: 'ม.6' });
    for (const k of ['prior_scholarship_knowledge', 'prior_knowledge_unsure',
                     'prior_knowledge_question_version', 'asked_after_seeing_results']) {
      expect(k in p, k).toBe(false);
    }
  });

  it('an unrecorded exposure flag is false, never silently true', () => {
    expect(build({ priorKnowledge: 6 }).asked_after_seeing_results).toBe(false);
  });
});

describe('wording versions', () => {
  it('the live version has wording and is not retired; the old one is retired', () => {
    const live = PRIOR_KNOWLEDGE_QUESTION_HISTORY[PRIOR_KNOWLEDGE_QUESTION_VERSION];
    expect(live.retired).toBeNull();
    expect(live.th).toContain('ก่อนรู้จัก TunDee');
    expect(PRIOR_KNOWLEDGE_QUESTION_HISTORY.v1.retired).not.toBeNull();
    expect(PRIOR_KNOWLEDGE_QUESTION_HISTORY.v1.th).not.toBe(live.th);
  });
});

describe('resuming a draft', () => {
  it('an "unsure" student is not sent back to the question they answered', () => {
    const row = { consent_version: 'c1', display_name: 'a', prior_scholarship_knowledge: null, prior_knowledge_unsure: true };
    expect(resumeStep(row)).toBeGreaterThan(2);
    expect(answersFromProfile(row).priorKnowledgeUnsure).toBe(true);
  });

  it('a student who skipped it still lands on it', () => {
    const row = { consent_version: 'c1', display_name: 'a', prior_scholarship_knowledge: null, prior_knowledge_unsure: false };
    expect(resumeStep(row)).toBe(2);
  });
});

describe('POST /api/profile/setup', () => {
  beforeEach(() => upsert.mockClear());

  const post = async (answers: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/profile/setup/route');
    return POST(new NextRequest('http://localhost/api/profile/setup', {
      method: 'POST', body: JSON.stringify({ partial: true, answers }),
    }));
  };

  it('refuses a number and "unsure" together instead of picking one', async () => {
    const res = await post({ priorKnowledge: 2, priorKnowledgeUnsure: true });
    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('accepts "unsure" alone and writes the columns', async () => {
    const res = await post({ priorKnowledgeUnsure: true, askedAfterSeeingResults: true });
    expect(res.status).toBe(200);
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.prior_knowledge_unsure).toBe(true);
    expect(row.prior_scholarship_knowledge).toBeNull();
  });
});

describe('wizard', () => {
  it('offers "ไม่แน่ใจ", reads the wording from the version file, and sends the exposure flag', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/profile/setup/page.tsx', 'utf8');
    expect(src).toContain("'ไม่แน่ใจ'");
    expect(src).toContain('PRIOR_KNOWLEDGE_QUESTION_HISTORY[PRIOR_KNOWLEDGE_QUESTION_VERSION]');
    expect(src).toContain('askedAfterSeeingResults: prefilled');
  });
});
