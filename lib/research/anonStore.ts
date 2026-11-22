/**
 * Database side of anonymous randomization. SERVER ONLY, service role only.
 *
 * Every function here assumes anonRandomizationEnabled() has already been checked
 * by its caller: with the switch off none of this runs.
 *
 * Failures are returned, never swallowed and never turned into a quiet "nothing to
 * do": a merge that fails leaves the anonymous row unclaimed, so the next sign-in
 * tries again, and the caller logs why.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_CONSENT_VERSION } from './consentGate';
import {
  anonLogTag, decideMerge,
  type AnonAssignment, type MergeDecision,
} from './anonAssignment';
import type { AnonCovariates } from './anonCovariates';

const COLUMNS =
  'anon_id, ranking_variant, ranking_assigned_at, assignment_algorithm_version, stratum, ' +
  'fairness_eligible, research_consent_version, research_consented_at, claimed_by';

export async function loadAnonAssignment(
  admin: SupabaseClient,
  anonId: string,
): Promise<{ row: AnonAssignment | null; error: string | null }> {
  const { data, error } = await admin.from('anon_assignments').select(COLUMNS).eq('anon_id', anonId).maybeSingle();
  if (error) return { row: null, error: `${error.code ?? ''} ${error.message}`.trim() };
  return { row: (data as unknown as AnonAssignment | null) ?? null, error: null };
}

/**
 * Stores an assignment. Idempotent: a second call for the same anon_id returns the
 * row that is already there, so a re-submitted quiz can never change an arm.
 */
export async function saveAnonAssignment(
  admin: SupabaseClient,
  assignment: Omit<AnonAssignment, 'claimed_by'>,
  covariates?: AnonCovariates | null,
): Promise<{ row: AnonAssignment | null; created: boolean; error: string | null; covariatesStored?: boolean }> {
  const full = covariates ? { ...assignment, ...covariates } : assignment;
  let { error } = await admin.from('anon_assignments').insert(full);
  let covariatesStored = !!covariates;

  // The covariate columns come from scripts/20261122_v38_1. If the app is deployed
  // before that has run, the insert names columns that do not exist. Randomizing
  // without them is far better than not randomizing at all — the arm and stratum
  // are what the trial cannot do without — so retry without, and say so loudly.
  if (error && covariates && isMissingColumn(error)) {
    console.error('[anon] covariate columns missing — run scripts/20261122_v38_1; assignment stored WITHOUT covariates:', error.message);
    covariatesStored = false;
    ({ error } = await admin.from('anon_assignments').insert(assignment));
  }

  if (!error) return { row: { ...assignment, claimed_by: null }, created: true, error: null, covariatesStored };
  if (error.code !== '23505') return { row: null, created: false, error: `${error.code ?? ''} ${error.message}`.trim() };
  // Already assigned: the first answers stand, covariates included (they are frozen).
  const existing = await loadAnonAssignment(admin, assignment.anon_id);
  return { row: existing.row, created: false, error: existing.error, covariatesStored: false };
}

/** PostgREST PGRST204 / Postgres 42703: a column named in the request does not exist (yet). */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === 'PGRST204' || err.code === '42703' || /column .* does not exist|could not find the .* column/i.test(err.message ?? ''));
}

/** Postgres 42P01 / PostgREST PGRST205: the table does not exist (yet). */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(err.message ?? ''));
}

/**
 * Puts the account on everything the visitor did before signing in (v38): the
 * apply_click rows and the impressions carrying this anon_id and no user yet.
 * One row each, so nothing is double-counted, and nothing is lost when the export
 * emits a claimed participant under the account.
 *
 * Idempotent (only user_id IS NULL rows), and never fatal to a sign-in: a failure is
 * returned and logged, and the next sign-in tries again (mergeAnonAssignment calls it
 * on 'already_claimed' too).
 */
export async function backfillAnonUserId(
  admin: SupabaseClient,
  anonId: string,
  userId: string,
): Promise<{ clicks: number; impressions: number; error: string | null }> {
  let clicks = 0;
  let impressions = 0;
  for (const table of ['apply_click', 'anon_impressions'] as const) {
    const { data, error } = await admin
      .from(table)
      .update({ user_id: userId })
      .eq('anon_id', anonId)
      .is('user_id', null)
      .select('anon_id');
    if (error) {
      // Before scripts/20261122_v38_2 there is nothing to back-fill.
      if (isMissingColumn(error) || isMissingTable(error)) continue;
      console.error(`[anon] back-fill of ${table} FAILED`, { anon: anonLogTag(anonId), userId, message: error.message });
      return { clicks, impressions, error: `${table}: ${error.message}` };
    }
    if (table === 'apply_click') clicks = (data ?? []).length;
    else impressions = (data ?? []).length;
  }
  if (clicks || impressions) console.info('[anon] back-filled the account onto pre-sign-in rows', { anon: anonLogTag(anonId), userId, clicks, impressions });
  return { clicks, impressions, error: null };
}

export type MergeOutcome =
  | { outcome: MergeDecision['action']; reason?: string }
  | { outcome: 'failed'; stage: string; message: string };

/**
 * Merges an anonymous assignment into the account that has just signed in.
 * The rule itself is decideMerge(); this performs it, in an order that never
 * leaves a half-done merge that cannot be retried:
 *
 *   lift:   record the consent  ->  claim the anonymous row  ->  write the arm
 *   conflict / same arm:  claim the row (and record the conflict)
 */
export async function mergeAnonAssignment(
  admin: SupabaseClient,
  input: { anonId: string; userId: string; now?: Date },
): Promise<MergeOutcome> {
  const { anonId, userId } = input;
  const tag = anonLogTag(anonId);
  const fail = (stage: string, message: string): MergeOutcome => {
    console.error(`[anon] merge FAILED at ${stage}`, { anon: tag, userId, message });
    return { outcome: 'failed', stage, message };
  };

  const anon = await loadAnonAssignment(admin, anonId);
  if (anon.error) return fail('load_anon', anon.error);

  const { data: profile, error: profileErr } = await admin
    .from('profiles').select('cohort, ranking_variant').eq('id', userId).maybeSingle();
  if (profileErr) return fail('read_profile', profileErr.message);

  const { data: sp, error: spErr } = await admin
    .from('student_profile').select('consent_research').eq('user_id', userId).maybeSingle();
  if (spErr) return fail('read_consent', spErr.message);

  const decision = decideMerge({
    userId,
    anon: anon.row,
    profile: (profile as { cohort: string | null; ranking_variant: string | null } | null) ?? null,
    consent: { hasRow: !!sp, consent_research: (sp as { consent_research: boolean | null } | null)?.consent_research ?? null },
  });

  const claim = async (): Promise<boolean | MergeOutcome> => {
    const { data, error } = await admin
      .from('anon_assignments')
      .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq('anon_id', anonId)
      .is('claimed_by', null)
      .select('anon_id');
    if (error) return fail('claim', error.message);
    return (data ?? []).length > 0;       // false = someone else claimed it first
  };

  if (decision.action === 'none') {
    console.info('[anon] nothing to merge', { anon: tag, userId, reason: decision.reason });
    // Claimed by this account on an earlier sign-in: finish a back-fill that failed then.
    if (decision.reason === 'already_claimed') await backfillAnonUserId(admin, anonId, userId);
    return { outcome: 'none', reason: decision.reason };
  }

  if (decision.action === 'same_arm' || decision.action === 'conflict') {
    const claimed = await claim();
    if (typeof claimed === 'object') return claimed;
    if (!claimed) return { outcome: 'none', reason: 'claimed_by_other' };

    if (decision.action === 'conflict') {
      const { error } = await admin.from('randomization_conflicts').insert({
        anon_id: anonId, user_id: userId, anon_arm: decision.anonArm, profile_arm: decision.profileArm,
      });
      if (error) return fail('record_conflict', error.message);
      console.warn('[anon] CONFLICT: anonymous arm differs from the account; the account wins', { anon: tag, userId });
    }
    await backfillAnonUserId(admin, anonId, userId);
    return { outcome: decision.action };
  }

  // ── lift ───────────────────────────────────────────────────────────────────
  const a = anon.row as AnonAssignment;

  // The arm must never exist without the consent that licenses it, so the consent
  // goes first. A student who already consented on the account keeps that record.
  if (!(sp as { consent_research: boolean | null } | null)?.consent_research) {
    const { error } = await admin.from('student_profile').upsert({
      user_id:         userId,
      consent_research: true,
      consent_version: a.research_consent_version,
      consent_at:      a.research_consented_at,
      consent_method:  'signup_inline',
    }, { onConflict: 'user_id' });
    if (error) return fail('write_consent', error.message);
  }

  const claimed = await claim();
  if (typeof claimed === 'object') return claimed;
  if (!claimed) return { outcome: 'none', reason: 'claimed_by_other' };

  const { data: written, error: writeErr } = await admin
    .from('profiles')
    .update({
      ranking_variant:              a.ranking_variant,
      ranking_assigned_at:          a.ranking_assigned_at,
      assignment_algorithm_version: a.assignment_algorithm_version,
      fairness_eligible:            a.fairness_eligible,
    })
    .eq('id', userId)
    .is('ranking_variant', null)
    .select('id');
  if (writeErr) return fail('write_arm', writeErr.message);

  if ((written ?? []).length === 0) {
    // The account was randomized between our read and our write (the wizard's own
    // assign call). Re-read and treat it as the conflict-or-same case it now is.
    const { data: now } = await admin.from('profiles').select('ranking_variant').eq('id', userId).maybeSingle();
    const arm = (now as { ranking_variant: string | null } | null)?.ranking_variant;
    if ((arm === 'baseline' || arm === 'fairness_adjusted') && arm !== a.ranking_variant) {
      const { error } = await admin.from('randomization_conflicts').insert({
        anon_id: anonId, user_id: userId, anon_arm: a.ranking_variant, profile_arm: arm,
      });
      if (error) return fail('record_conflict', error.message);
      console.warn('[anon] CONFLICT after a lost race; the account wins', { anon: tag, userId });
      await backfillAnonUserId(admin, anonId, userId);
      return { outcome: 'conflict' };
    }
    await backfillAnonUserId(admin, anonId, userId);
    return { outcome: 'same_arm' };
  }

  await backfillAnonUserId(admin, anonId, userId);
  console.info('[anon] arm lifted onto the account', { anon: tag, userId, consentVersion: a.research_consent_version });
  return { outcome: 'lift' };
}

/** The consent version an anonymous assignment records: the current research consent text. */
export const ANON_CONSENT_VERSION = CURRENT_CONSENT_VERSION;
