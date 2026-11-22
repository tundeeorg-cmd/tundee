/**
 * The anonymous participants in the research export (GET /api/research/export?scope=anon).
 * Pure: the route reads the rows, this decides who is emitted and how.
 *
 * One NDJSON line per record, three record types, all keyed by the same pseudonymous
 * id = sha256(anon_id) (the same construction as pseudo_user_id for accounts):
 *
 *   participant   the arm, stratum, consent and the covariates stored at assignment
 *   impression    each ranked card served (rank, fairness mode), from anon_impressions
 *   apply_click   each click bound to the participant, with its arm binding and
 *                 excluded_from_primary flag, from apply_click
 *
 * WHO IS EMITTED
 *   - consent to the CURRENT wording only (the gate every export uses);
 *   - not claimed by an account: a participant who signed in is emitted ONCE, under
 *     the account (their pre-sign-in rows carry the user_id since the merge), never
 *     a second time here.
 *   Every excluded participant is counted by reason, so a shrinking export is visible.
 *
 * See research/ANALYSIS-DATA-DICTIONARY.md for every field and the prereg section it serves.
 */

import { createHash } from 'node:crypto';
import { isTargetPopulation } from './assignment';

export const pseudonymiseAnon = (anonId: string): string =>
  createHash('sha256').update(anonId).digest('hex');

export interface AnonParticipantRow {
  anon_id: string;
  ranking_variant: string;
  ranking_assigned_at: string;
  assignment_algorithm_version: string;
  stratum: string;
  fairness_eligible: boolean;
  research_consent_version: string;
  research_consented_at: string;
  claimed_by: string | null;
  level?: string | null;
  province?: string | null;
  region_group?: string | null;
  income_bracket?: number | null;
  gave_gpa?: boolean | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  recruitment_source?: string | null;
  landing_variant?: string | null;
}

export interface AnonImpressionExportRow {
  anon_id: string;
  scholarship_id: string;
  rank: number;
  fairness_mode: string;
  variant: string;
  broadened: boolean;
  served_at: string;
}

export interface AnonClickExportRow {
  anon_id: string;
  scholarship_id: string;
  clicked_at: string;
  ranking_variant: string | null;
  ranking_assigned_at: string | null;
  rank_position: number | null;
  was_personalized: boolean | null;
  served_fairness_mode: string | null;
  excluded_from_primary: boolean | null;
  binding_source: string | null;
}

export type AnonExclusion = 'stale_consent_version' | 'claimed_by_account';

export function anonExclusion(p: Pick<AnonParticipantRow, 'research_consent_version' | 'claimed_by'>, currentVersion: string): AnonExclusion | null {
  if (p.research_consent_version !== currentVersion) return 'stale_consent_version';
  if (p.claimed_by) return 'claimed_by_account';
  return null;
}

export function buildAnonExport(input: {
  participants: AnonParticipantRow[];
  impressions: AnonImpressionExportRow[];
  clicks: AnonClickExportRow[];
  currentConsentVersion: string;
}): { lines: string[]; excluded: Record<AnonExclusion, number>; participants: number } {
  const excluded: Record<AnonExclusion, number> = { stale_consent_version: 0, claimed_by_account: 0 };
  const kept = new Map<string, string>();       // anon_id -> pseudonymous id
  const lines: string[] = [];

  for (const p of input.participants) {
    const why = anonExclusion(p, input.currentConsentVersion);
    if (why) { excluded[why]++; continue; }
    const pid = pseudonymiseAnon(p.anon_id);
    kept.set(p.anon_id, pid);
    lines.push(JSON.stringify({
      record_type:                  'participant',
      pseudo_anon_id:               pid,
      ranking_variant:              p.ranking_variant,
      ranking_assigned_at:          p.ranking_assigned_at,
      assignment_algorithm_version: p.assignment_algorithm_version,
      stratum:                      p.stratum,
      fairness_eligible:            p.fairness_eligible,
      research_consent_version:     p.research_consent_version,
      research_consented_at:        p.research_consented_at,
      level:                        p.level ?? null,
      province:                     p.province ?? null,
      region_group:                 p.region_group ?? null,
      income_bracket:               p.income_bracket ?? null,
      gave_gpa:                     p.gave_gpa ?? null,
      is_target_population:         p.region_group != null && p.income_bracket != null
                                      ? p.region_group === 'northeast' && p.income_bracket <= 3
                                      : (p.province ? isTargetPopulation(p.province, p.income_bracket) : null),
      recruitment_source:           p.recruitment_source ?? null,
      utm_source:                   p.utm_source ?? null,
      utm_medium:                   p.utm_medium ?? null,
      utm_campaign:                 p.utm_campaign ?? null,
      utm_content:                  p.utm_content ?? null,
      landing_variant:              p.landing_variant ?? null,
    }));
  }

  for (const i of input.impressions) {
    const pid = kept.get(i.anon_id);
    if (!pid) continue;
    lines.push(JSON.stringify({
      record_type:    'impression',
      pseudo_anon_id: pid,
      scholarship_id: i.scholarship_id,
      rank:           i.rank,
      fairness_mode:  i.fairness_mode,
      variant:        i.variant,
      broadened:      i.broadened,
      served_at:      i.served_at,
    }));
  }

  for (const c of input.clicks) {
    const pid = kept.get(c.anon_id);
    if (!pid) continue;
    lines.push(JSON.stringify({
      record_type:           'apply_click',
      pseudo_anon_id:        pid,
      scholarship_id:        c.scholarship_id,
      clicked_at:            c.clicked_at,
      ranking_variant:       c.ranking_variant,
      ranking_assigned_at:   c.ranking_assigned_at,
      rank_position:         c.rank_position,
      was_personalized:      c.was_personalized,
      served_fairness_mode:  c.served_fairness_mode,
      // NULL (never bound) is treated as excluded, as the v26 comment requires.
      excluded_from_primary: c.excluded_from_primary ?? true,
      binding_source:        c.binding_source,
    }));
  }

  return { lines, excluded, participants: kept.size };
}
