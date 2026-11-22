/**
 * The covariates stored on an anonymous assignment (scripts/20261122_v38_1). Pure.
 *
 * WHY THEY LIVE ON THE ASSIGNMENT
 *   Most randomized visitors never sign up, so the profile row the §10.2
 *   regression normally reads from never exists for them. The answers they gave
 *   and how they were reached are recorded ONCE, at the moment of assignment, on
 *   the same row as the arm — so every anonymous participant is a complete record
 *   whether or not an account follows.
 *
 * Every value goes through the same function the profile path uses, so an
 * anonymous participant and a signed-up one are coded identically:
 *   region_group        regionGroup()          (PREREG §5.1)
 *   recruitment_source  recruitmentSourceFrom() (PREREG §5.4)
 *   landing_variant     resolveLandingVariant() (PREREG §5.8, a known key only)
 *
 * The UTMs arrive from the page and are untrusted free text: trimmed, bounded,
 * and empty is NULL. They never influence the arm (the stratum is province ×
 * income only), so a forged UTM can mislabel a covariate but not a treatment.
 */

import type { PreviewInput } from '@/lib/preview/types';
import { recruitmentSourceFrom, regionGroup, type RecruitmentSource, type RegionGroup } from './assignment';
import { resolveLandingVariant } from '@/lib/landing/variants';

export interface AnonCovariates {
  level: string;
  province: string;
  region_group: RegionGroup | null;
  income_bracket: number;
  gave_gpa: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  recruitment_source: RecruitmentSource;
  landing_variant: string;
}

/** Column names, in one place, so the store and the export select the same set. */
export const ANON_COVARIATE_COLUMNS = [
  'level', 'province', 'region_group', 'income_bracket', 'gave_gpa',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'recruitment_source', 'landing_variant',
] as const;

/** What the page sends about how the visitor arrived. Everything optional. */
export interface AnonAttribution {
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  landing_variant?: unknown;
}

export const UTM_MAX_LENGTH = 200;

/** A trimmed, bounded string, or null. Never throws. */
export function cleanUtm(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, UTM_MAX_LENGTH);
}

export function buildAnonCovariates(answers: PreviewInput, attribution: AnonAttribution | null | undefined): AnonCovariates {
  const a = attribution ?? {};
  const utm_campaign = cleanUtm(a.utm_campaign);
  return {
    level:              answers.level,
    province:           answers.province,
    region_group:       regionGroup(answers.province),
    income_bracket:     answers.income,
    gave_gpa:           answers.gpa !== null,
    utm_source:         cleanUtm(a.utm_source),
    utm_medium:         cleanUtm(a.utm_medium),
    utm_campaign,
    utm_content:        cleanUtm(a.utm_content),
    recruitment_source: recruitmentSourceFrom(utm_campaign),
    landing_variant:    resolveLandingVariant(typeof a.landing_variant === 'string' ? a.landing_variant : undefined),
  };
}

/** True when the row carries the covariates the analysis needs (health check). */
export function hasAnonCovariates(row: Partial<Record<(typeof ANON_COVARIATE_COLUMNS)[number], unknown>>): boolean {
  return row.level != null && row.region_group != null && row.income_bracket != null && row.recruitment_source != null;
}
