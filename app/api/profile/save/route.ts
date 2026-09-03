/**
 * POST /api/profile/save — save an edit made on /profile.
 *
 * The /profile page used to write to PostgREST straight from the browser:
 *
 *   await supabase.from('profiles').upsert({ ... })   // in the page component
 *
 * That call goes to supabase.co, never to us, so a failure produced no Vercel
 * log line at all — the entire record of it was a Thai toast reading
 * "บันทึกไม่สำเร็จ กรุณาลองใหม่" on a phone we cannot see. When a student
 * reported that saving did nothing on 3 Sep 2026 there was nothing to read: the
 * access log showed GET /profile 200 and no write anywhere, which looks
 * identical to the student never having pressed the button.
 *
 * So the write moved here, matching /api/profile/setup. Same three properties:
 *
 *   • the real Postgres error is logged server-side, with the user id and the
 *     values, where we can actually find it;
 *   • the browser gets a stable code and never a Postgres message — no table
 *     name, no constraint name, no English error on a Thai page;
 *   • values are validated against lib/profile/setupAnswers, the same module
 *     the wizard uses, so the two pages cannot drift into disagreeing about
 *     what a legal grade level is.
 *
 * Runs as the signed-in user, not the service role: RLS still decides whose row
 * this is, and `id` comes from the session rather than the request body, so a
 * forged id cannot write to somebody else's profile.
 *
 * A PATCH, not a whole row: only the keys present in the body are written.
 * /profile has two independent save buttons (the display name, and the study
 * details) and neither should blank out what the other owns.
 */

export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  validateField,
  hasErrors,
  type SetupErrors,
  type SetupField,
} from '@/lib/profile/setupAnswers';

/** Longest display name we will store. Longer is a paste, not a name. */
const MAX_DISPLAY_NAME = 80;

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

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // ── Validate whatever was sent ────────────────────────────────────────────
  // Only present keys are checked. Absent means "not edited on this screen",
  // which is different from "cleared" and must not be treated as a rejection.
  const errors: SetupErrors = {};
  const check = (field: SetupField, value: unknown) => {
    const code = validateField(field, value);
    if (code) errors[field] = code;
  };

  if (has('gradeLevel'))    check('gradeLevel', body.gradeLevel);
  if (has('gpa'))           check('gpa', body.gpa);
  if (has('province'))      check('province', body.province);
  if (has('incomeBracket')) check('incomeBracket', body.incomeBracket);

  if (hasErrors(errors)) {
    console.warn('[POST /api/profile/save] rejected', { userId: user.id, errors });
    return NextResponse.json({ ok: false, error: 'validation', fields: errors }, { status: 422 });
  }

  // ── Build the patch ───────────────────────────────────────────────────────
  const patch: Record<string, unknown> = { id: user.id, updated_at: new Date().toISOString() };

  if (has('displayName')) {
    const name = String(body.displayName ?? '').trim().slice(0, MAX_DISPLAY_NAME);
    patch.display_name = name === '' ? null : name;
  }

  if (has('avatarUrl')) {
    // The file itself goes to Supabase Storage from the browser — that upload
    // checks its own error and throws. Only the row write comes here, because
    // it was the half that was never checked at all: uploadAvatar awaited the
    // upsert and ignored the result, so a rejected write still returned a URL
    // and the page showed the new picture until the next reload.
    const url = String(body.avatarUrl ?? '').trim();
    patch.avatar_url = url === '' ? null : url;
  }

  if (has('gradeLevel')) {
    // '' is how the page represents "not answered". The CHECK constraint
    // rejects the empty string explicitly, so it has to become NULL here or a
    // student clearing the field would get save_failed with no way forward.
    const grade = String(body.gradeLevel ?? '').trim();
    patch.grade_level = grade === '' ? null : grade;
  }

  if (has('gpa')) {
    const raw = String(body.gpa ?? '').trim();
    const gpa = raw === '' ? null : Number(raw);
    // validateField already rejected anything outside 0–4; this guards the
    // NaN that Number('') would produce if the check above ever changed.
    patch.gpa = gpa !== null && Number.isFinite(gpa) ? gpa : null;
  }

  if (has('province')) {
    const province = String(body.province ?? '').trim();
    patch.province = province === '' ? null : province;
  }

  if (has('incomeBracket') && typeof body.incomeBracket === 'number') {
    patch.income_bracket = body.incomeBracket;
  }

  if (has('welfareCard')) {
    patch.welfare_card = body.welfareCard === true;
  }

  if (has('fields')) {
    const fields = Array.isArray(body.fields)
      ? body.fields.filter((f): f is string => typeof f === 'string')
      : [];
    // 'any' is the recommender's wildcard, and an empty array would match
    // nothing at all — which reads to the student as the product being broken
    // rather than as them having chosen nothing.
    patch.fields_of_interest = fields.length > 0 ? fields : ['any'];
  }

  // Nothing but the two bookkeeping keys: the caller sent an empty edit.
  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });

  if (error) {
    // Everything needed to debug, minus the display name — the one value here
    // that identifies a person.
    const { display_name: _redacted, ...loggable } = patch;
    console.error('[POST /api/profile/save] upsert failed', {
      userId:  user.id,
      pgCode:  error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
      patch:   loggable,
    });

    // 23514 on this row can only be grade_level; everything else was validated
    // above. Named separately so the page can point at the field instead of
    // saying "try again" to someone whose retry will fail identically.
    if (error.code === '23514') {
      return NextResponse.json(
        { ok: false, error: 'validation', fields: { gradeLevel: 'grade_level_invalid' } },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
