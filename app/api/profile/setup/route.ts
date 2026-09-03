/**
 * POST /api/profile/setup — save the onboarding wizard's answers.
 *
 * The wizard used to upsert straight into PostgREST from the browser. Two things
 * followed from that, and both hurt real students on 31 Aug 2026:
 *
 *   1. The only validation was the database's, so an out-of-domain grade level
 *      was discovered at 100%, after nine steps and roughly eight minutes.
 *   2. The failure was rendered verbatim —
 *        [23514] new row for relation "profiles" violates check constraint
 *        "profiles_grade_level_check"
 *      — in English, on a Thai page, publishing our table and constraint names
 *      to anyone who hit it.
 *
 * So the write moved here. This route validates against the same module the
 * wizard validates against (lib/profile/setupAnswers.ts), logs the real Postgres
 * error server-side with enough context to debug, and answers the browser with a
 * stable code and nothing else. The client turns that code into Thai.
 *
 * It runs as the signed-in user, not the service role: RLS still decides whose
 * row this is, and `id` is taken from the session rather than the request body.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CONSENT_VERSION } from '@/lib/consent';
import {
  buildProfilePayload,
  validateSetupAnswers,
  validateField,
  hasErrors,
  type SetupAnswers,
  type SetupErrors,
  type SetupField,
} from '@/lib/profile/setupAnswers';

/** Fields a partial (per-step) save is allowed to validate and write. */
const PARTIAL_VALIDATED_FIELDS: SetupField[] = [
  'gradeLevel', 'gradeYear', 'gpa', 'province', 'incomeBracket', 'heardAboutUs', 'priorKnowledge',
];

function readAnswers(body: Record<string, unknown>): Partial<SetupAnswers> {
  const a = (body.answers ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

  return {
    displayName:          str(a.displayName),
    gradeLevel:           str(a.gradeLevel),
    // Range-checked by validateField; the level pairing is corrected, not
    // rejected, in buildProfilePayload — see lib/profile/gradeLevels.ts.
    gradeYear:            typeof a.gradeYear === 'number' ? a.gradeYear : null,
    gpa:                  typeof a.gpa === 'number' ? String(a.gpa) : str(a.gpa),
    province:             str(a.province),
    incomeBracket:        typeof a.incomeBracket === 'number' ? a.incomeBracket : undefined,
    welfareCard:          bool(a.welfareCard),
    fields:               Array.isArray(a.fields) ? a.fields.filter(f => typeof f === 'string') as string[] : undefined,
    priorKnowledge:       typeof a.priorKnowledge === 'number' ? a.priorKnowledge : null,
    heardAboutUs:         str(a.heardAboutUs),
    consentTerms:         bool(a.consentTerms),
    researchOptIn:        bool(a.researchOptIn),
    guardianAcknowledged: bool(a.guardianAcknowledged),
    acquisitionSource:    str(a.acquisitionSource),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const partial = body.partial === true;
  const answers = readAnswers(body);

  // ── Validate ──────────────────────────────────────────────────────────────
  // A partial save is a step-by-step autosave, so it must not demand answers the
  // student has not reached yet — but a value that IS present still has to be
  // legal, or the autosave would be the thing that fails silently.
  let errors: SetupErrors;
  if (partial) {
    errors = {};
    for (const field of PARTIAL_VALIDATED_FIELDS) {
      const value = (answers as Record<string, unknown>)[field];
      if (value === undefined || value === null || value === '') continue;
      const code = validateField(field, value);
      if (code) errors[field] = code;
    }
  } else {
    errors = validateSetupAnswers(answers);
  }

  if (hasErrors(errors)) {
    // 422, not 500: the request was understood and refused. Field codes go back
    // so the wizard can put the student on the step that needs fixing instead of
    // showing a wall-wide error at the end.
    console.warn('[POST /api/profile/setup] rejected', {
      userId: user.id, partial, errors,
    });
    return NextResponse.json({ ok: false, error: 'validation', fields: errors }, { status: 422 });
  }

  const payload = buildProfilePayload(user.id, answers, { consentVersion: CONSENT_VERSION });

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

  if (error) {
    // The real error, server-side only, with everything needed to debug it: who,
    // which step, and which values — minus the free-text display name, which is
    // the one field here that identifies a person.
    const { display_name: _redacted, ...loggable } = payload as Record<string, unknown>;
    console.error('[POST /api/profile/setup] upsert failed', {
      userId:  user.id,
      partial,
      pgCode:  error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
      payload: loggable,
    });

    // The browser learns that saving failed and nothing more. No table name, no
    // constraint name, no Postgres text.
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
