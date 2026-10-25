/**
 * Asking for research consent again (the 8 students on superseded wording and the 16
 * who ticked the box but have no record).
 *
 * Three things have to be true, and the last was not: only the right students are
 * asked; the question is a real one; and answering it actually changes what the
 * export sees. Before this, a student on the old wording who clicked "agree" saw
 * "saved" and stayed excluded, because the route kept the old version.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { CURRENT_CONSENT_VERSION, exportExclusion } from '@/lib/research/consentGate';
import { reconsentReason } from '@/lib/research/reconsent';

const read = (p: string) => readFileSync(p, 'utf8');
const OLD = '2026-01-v1';

describe('who is asked', () => {
  it('a student who agreed to the old wording', () => {
    expect(reconsentReason({ researchOptIn: false, sp: { consent_research: true, consent_version: OLD } })).toBe('stale_version');
    expect(reconsentReason({ researchOptIn: true,  sp: { consent_research: true, consent_version: null } })).toBe('stale_version');
  });

  it('a student who ticked the box but has no record', () => {
    expect(reconsentReason({ researchOptIn: true, sp: null })).toBe('ticked_without_record');
  });

  it('nobody else', () => {
    // current wording
    expect(reconsentReason({ researchOptIn: true, sp: { consent_research: true, consent_version: CURRENT_CONSENT_VERSION } })).toBeNull();
    // an explicit refusal is a decision, not a gap — even if the convenience copy still says true
    expect(reconsentReason({ researchOptIn: true, sp: { consent_research: false, consent_version: OLD } })).toBeNull();
    expect(reconsentReason({ researchOptIn: true, sp: { consent_research: false, consent_version: CURRENT_CONSENT_VERSION } })).toBeNull();
    // never ticked anything, no record
    expect(reconsentReason({ researchOptIn: false, sp: null })).toBeNull();
    expect(reconsentReason({ researchOptIn: null, sp: null })).toBeNull();
    expect(reconsentReason({ researchOptIn: undefined, sp: undefined })).toBeNull();
  });

  it('is exactly the set the export excludes for these two reasons', () => {
    const exportedStale = exportExclusion({ consent_research: true, consent_version: OLD, guardian_consent: false, birth_year: null });
    expect(exportedStale).toBe('stale_consent_version');
    expect(exportExclusion(null)).toBe('no_student_profile');
  });
});

// ── The status route ─────────────────────────────────────────────────────────
const world = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  profile: { data: { research_opt_in: true } as unknown, error: null as null | { message: string } },
  sp: { data: null as unknown, error: null as null | { message: string } },
  upsert: vi.fn(),
  profilesUpdate: vi.fn(),
  existing: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: world.user } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) q[m] = () => q;
      q.maybeSingle = async () => {
        if (table === 'profiles') return world.profile;
        // student_profile: the status route and the save route both read it
        return world.existing ? { data: world.existing, error: null } : world.sp;
      };
      q.upsert = (row: Record<string, unknown>) => {
        world.upsert(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      };
      q.update = (patch: Record<string, unknown>) => {
        world.profilesUpdate(patch);
        return { eq: async () => ({ error: null }) };
      };
      return q;
    },
  }),
}));

import { GET as consentStatus } from '@/app/api/profile/consent-status/route';
import { POST as saveStudent } from '@/app/api/profile/student/route';

beforeEach(() => {
  process.env.RECONSENT_PROMPT = 'on';
  world.user = { id: 'u1' };
  world.profile = { data: { research_opt_in: true }, error: null };
  world.sp = { data: null, error: null };
  world.existing = null;
  world.upsert.mockClear();
  world.profilesUpdate.mockClear();
});

describe('the switch', () => {
  it('asks nobody while RECONSENT_PROMPT is off, whoever they are', async () => {
    for (const v of [undefined, '', 'off', 'true', '1', 'ON']) {
      if (v === undefined) delete process.env.RECONSENT_PROMPT; else process.env.RECONSENT_PROMPT = v;
      world.sp = { data: { consent_research: true, consent_version: OLD }, error: null };
      const body = await (await consentStatus()).json();
      expect(body.needsReconsent, String(v)).toBe(false);
      expect(body.enabled).toBe(false);
    }
  });

  it('does not read the student\'s records at all while off', async () => {
    delete process.env.RECONSENT_PROMPT;
    world.profile = { data: null, error: { message: 'would fail if read' } };
    expect((await consentStatus()).status).toBe(200);
  });

  it('is documented as off in .env.example', () => {
    expect(read('.env.example')).toMatch(/^RECONSENT_PROMPT=\s*$/m);
  });
});

describe('GET /api/profile/consent-status', () => {
  it('refuses a visitor with no session', async () => {
    world.user = null;
    expect((await consentStatus()).status).toBe(401);
  });

  it('asks a student who ticked the box but has no record', async () => {
    const body = await (await consentStatus()).json();
    expect(body).toEqual({ needsReconsent: true, reason: 'ticked_without_record', currentVersion: CURRENT_CONSENT_VERSION });
  });

  it('asks a student on the old wording, and nobody on the current one', async () => {
    world.sp = { data: { consent_research: true, consent_version: OLD }, error: null };
    expect((await (await consentStatus()).json()).reason).toBe('stale_version');
    world.sp = { data: { consent_research: true, consent_version: CURRENT_CONSENT_VERSION }, error: null };
    expect((await (await consentStatus()).json()).needsReconsent).toBe(false);
  });

  it('a failed read is an error, never "no need to ask"', async () => {
    world.sp = { data: null, error: { message: 'boom' } };
    const res = await consentStatus();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });
});

// ── Answering actually changes what the export sees ──────────────────────────
const post = (body: Record<string, unknown>) =>
  saveStudent(new NextRequest('http://localhost/api/profile/student', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/profile/student — the re-consent', () => {
  const stale = { consent_research: true, consent_version: OLD, consent_at: '2026-08-14T00:00:00Z', consent_method: 'signup_inline' };

  it('agreeing again stamps the CURRENT wording and a new time (it used to keep the old version, a silent no-op)', async () => {
    world.existing = stale;
    const res = await post({ consent_research: true, guardian_consent: false, consent_method: 'profile_settings' });
    expect(res.status).toBe(200);
    const row = world.upsert.mock.calls[0][0];
    expect(row.consent_version).toBe(CURRENT_CONSENT_VERSION);
    expect(row.consent_at).not.toBe(stale.consent_at);
    expect(row.consent_method).toBe('profile_settings');
    // ...and that row now passes the export's gate
    expect(exportExclusion({ consent_research: true, consent_version: row.consent_version as string, guardian_consent: false, birth_year: null })).toBeNull();
  });

  it('saving again on the CURRENT wording carries the original time forward, as before', async () => {
    world.existing = { ...stale, consent_version: CURRENT_CONSENT_VERSION };
    await post({ consent_research: true, consent_method: 'profile_settings' });
    const row = world.upsert.mock.calls[0][0];
    expect(row.consent_at).toBe(stale.consent_at);
    expect(row.consent_version).toBe(CURRENT_CONSENT_VERSION);
  });

  it('a student with no record who agrees gets one, on the current wording', async () => {
    await post({ consent_research: true, consent_method: 'profile_settings' });
    expect(world.upsert.mock.calls[0][0]).toMatchObject({ consent_research: true, consent_version: CURRENT_CONSENT_VERSION });
  });

  it('declining is recorded as a decision and is final: the export refuses and they are not asked again', async () => {
    world.existing = stale;
    await post({ consent_research: false, consent_method: 'profile_settings' });
    const row = world.upsert.mock.calls[0][0];
    expect(row.consent_research).toBe(false);
    expect(exportExclusion({ consent_research: false, consent_version: row.consent_version as string, guardian_consent: false, birth_year: null })).toBe('no_research_consent');
    expect(reconsentReason({ researchOptIn: false, sp: { consent_research: false, consent_version: row.consent_version as string } })).toBeNull();
  });

  it('keeps profiles.research_opt_in in step with the record', async () => {
    await post({ consent_research: true, consent_method: 'profile_settings' });
    expect(world.profilesUpdate).toHaveBeenLastCalledWith({ research_opt_in: true });
    await post({ consent_research: false, consent_method: 'profile_settings' });
    expect(world.profilesUpdate).toHaveBeenLastCalledWith({ research_opt_in: false });
  });

  it('still refuses a minor agreeing without a guardian', async () => {
    const res = await post({ consent_research: true, guardian_consent: false, birth_year: new Date().getFullYear() - 15 });
    expect(res.status).toBe(422);
    expect(world.upsert).not.toHaveBeenCalled();
  });
});

// ── The prompt ───────────────────────────────────────────────────────────────
describe('the prompt', () => {
  const src = read('components/ReconsentPrompt.tsx');

  it('is mounted on /scholarships for a signed-in student only', () => {
    expect(read('app/scholarships/page.tsx')).toContain('{user && <ReconsentPrompt lang={lang} />}');
  });

  it('reuses the real consent question: neither option pre-selected, and equal weight', () => {
    expect(src).toContain('<ResearchConsent');
    const rc = read('components/ResearchConsent.tsx');
    expect(rc).toContain('Neither option is pre-selected');
    expect(rc).toContain('equal visual weight');
  });

  it('"later" is not an answer: it hides for this session and the question returns', () => {
    expect(src).toContain('sessionStorage.setItem(DISMISS_KEY');
    expect(src).not.toMatch(/consent_research/);              // the prompt never writes a decision itself
  });

  it('shows nothing while the status is unknown or unreadable — no spinner, no guess', () => {
    expect(src).toContain("if (state !== 'needed') return null;");
    expect(src).toContain("setState('hidden')");
    expect(src).toContain('console.error(\'[reconsent] status unavailable:\'');
  });
});
