/**
 * Binds an outcome event to the arm the student was in when it happened
 * (PART 2 step 7; PREREG §6, §9).
 *
 * Pure: the route reads the facts and this decides what they mean, so the rule
 * can be tested without a database.
 *
 * THE RULE
 *   A click made after the student was randomized carries their arm. A click made
 *   before — or by someone never randomized, or by an anonymous visitor — carries
 *   arm = null and excluded_from_primary = true. It is kept (it is behaviour worth
 *   having) but never counted in the primary result. Nothing is dropped.
 *
 *   Assignment is immutable (trg_freeze_ranking_variant), so "the arm at that
 *   time" is the stored arm, valid only from ranking_assigned_at onwards.
 *
 *   If the facts could not be read, the click is still recorded — losing the
 *   primary outcome would be worse — marked binding_source = 'server_unbound' and
 *   excluded. It can be re-bound later from profiles; it is never silently given
 *   an arm it might not have had.
 */

export type RankingVariant = 'baseline' | 'fairness_adjusted';

export interface ProfileFacts {
  ranking_variant: string | null;
  ranking_assigned_at: string | null;
  cohort: string | null;
}

/** What the student was shown for this scholarship, from the latest impression. */
export interface ServedImpression {
  occurred_at: string;
  context: { rank?: unknown; tab?: unknown; fairness_mode?: unknown } | null;
}

export interface OutcomeBinding {
  ranking_variant: RankingVariant | null;
  ranking_assigned_at: string | null;
  rank_position: number | null;
  was_personalized: boolean | null;
  served_fairness_mode: 'on' | 'off' | null;
  excluded_from_primary: boolean;
  binding_source: 'server' | 'server_unbound';
}

/** An impression older than this is not what led to the click. */
export const IMPRESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isVariant = (v: unknown): v is RankingVariant => v === 'baseline' || v === 'fairness_adjusted';

type Served = Pick<OutcomeBinding, 'rank_position' | 'was_personalized' | 'served_fairness_mode'>;

function servedFrom(imp: ServedImpression | null, clickedAt: Date): Served {
  const none: Served = { rank_position: null, was_personalized: null, served_fairness_mode: null };
  if (!imp) return none;
  const at = Date.parse(imp.occurred_at);
  if (!Number.isFinite(at) || at > clickedAt.getTime() || clickedAt.getTime() - at > IMPRESSION_MAX_AGE_MS) return none;

  const rank = Number(imp.context?.rank);
  const tab = imp.context?.tab;
  const mode = imp.context?.fairness_mode;
  return {
    rank_position: Number.isInteger(rank) && rank >= 1 ? rank : null,
    // 'matches' is the personalized recommendation list; 'browse' is not.
    was_personalized: tab === 'matches' ? true : tab === 'browse' ? false : null,
    served_fairness_mode: mode === 'on' || mode === 'off' ? mode : null,
  };
}

export function bindOutcome(input: {
  userId: string | null;
  clickedAt: Date;
  /** null with userId set = the lookup FAILED (not "no profile"); the caller logs it. */
  profile: ProfileFacts | null;
  profileReadFailed?: boolean;
  impression: ServedImpression | null;
}): OutcomeBinding {
  const { userId, clickedAt, profile, impression } = input;
  const served = servedFrom(impression, clickedAt);

  const excluded = (source: OutcomeBinding['binding_source'], assignedAt: string | null = null): OutcomeBinding => ({
    ranking_variant: null,
    ranking_assigned_at: assignedAt,
    ...served,
    excluded_from_primary: true,
    binding_source: source,
  });

  if (userId === null) return excluded('server');                       // anonymous: never randomized
  if (input.profileReadFailed || !profile) return excluded('server_unbound');

  // Not randomized: pilot, no consent, skipped the wizard, or not yet complete.
  if (profile.cohort === 'pilot' || !isVariant(profile.ranking_variant) || !profile.ranking_assigned_at) {
    return excluded('server');
  }

  // Randomized, but the click is earlier than the assignment: before the trial.
  const assignedAt = Date.parse(profile.ranking_assigned_at);
  if (!Number.isFinite(assignedAt) || clickedAt.getTime() < assignedAt) {
    return excluded('server', profile.ranking_assigned_at);
  }

  return {
    ranking_variant: profile.ranking_variant,
    ranking_assigned_at: profile.ranking_assigned_at,
    ...served,
    excluded_from_primary: false,
    binding_source: 'server',
  };
}
