/**
 * Who should be asked again for research consent, and why. Pure.
 *
 * Two groups exist on 2026-10-26, and neither is exported until they answer:
 *
 *   stale_version          they agreed to an EARLIER wording (2026-01-v1). Consent to
 *                          different words is not consent to these, so the export now
 *                          excludes them (exportExclusion) until they confirm.
 *   ticked_without_record  they ticked the research box at sign-up but the record that
 *                          every export reads (student_profile) was never written, so
 *                          they were excluded without anyone telling them.
 *
 * A student who answered NO is never asked again: an explicit refusal is a decision,
 * not a gap. Nor is someone who never ticked anything and has no record.
 */

import { CURRENT_CONSENT_VERSION } from './consentGate';

export type ReconsentReason = 'stale_version' | 'ticked_without_record';

export function reconsentReason(input: {
  researchOptIn: boolean | null | undefined;
  sp: { consent_research: boolean | null; consent_version: string | null } | null | undefined;
}): ReconsentReason | null {
  const { researchOptIn, sp } = input;
  if (!sp) return researchOptIn === true ? 'ticked_without_record' : null;
  if (sp.consent_research === true && sp.consent_version !== CURRENT_CONSENT_VERSION) return 'stale_version';
  return null;
}
