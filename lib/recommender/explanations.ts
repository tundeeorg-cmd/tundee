/**
 * "Why recommended" copy — sentence rendering and list-level de-duplication.
 *
 * The scorer is a pure per-item function and cannot see a scholarship's
 * neighbours, so two cards that share their strongest reason produce the same
 * sentence. On /start that lands as three near-identical lines on the first
 * screen cold traffic sees, which reads like boilerplate and undercuts the
 * ranking claim the page makes.
 *
 * The scorer therefore emits an ordered list of *candidate* sentences per
 * scholarship (best first), and this module picks one per card at list level,
 * preferring the best candidate not already used further up the list.
 */

/** One candidate sentence body, without the leading "ทุนนี้เหมาะกับคุณเพราะ". */
export interface ExplanationOption {
  th: string;
  en: string;
  /**
   * The Thai clauses this sentence is built from, for de-duplication. Set by
   * combineOptions; a single-clause option is just [th], so callers may omit it.
   */
  clauses?: string[];
}

/** The clauses an option is made of, defaulting to the whole sentence. */
export function clausesOf(option: ExplanationOption): string[] {
  return option.clauses ?? [option.th];
}

const TH_PREFIX = 'ทุนนี้เหมาะกับคุณเพราะ';
const EN_PREFIX = 'Recommended because ';

/** Used only when a scholarship offers nothing specific to say. */
export const GENERIC_OPTION: ExplanationOption = {
  th: 'ตรงตามเกณฑ์คุณสมบัติ',
  en: 'it matches your profile',
};

/** Joins up to two clauses into the final one-sentence copy. */
export function renderExplanation(
  option: ExplanationOption,
): { explanation: string; explanation_en: string } {
  return {
    explanation:    `${TH_PREFIX}${option.th}`,
    explanation_en: `${EN_PREFIX}${option.en}`,
  };
}

/** Combines a personal reason with a scholarship highlight into one clause pair. */
export function combineOptions(primary: ExplanationOption, secondary: ExplanationOption): ExplanationOption {
  return {
    th:      `${primary.th} และ${secondary.th}`,
    en:      `${primary.en}, and ${secondary.en}`,
    clauses: [...clausesOf(primary), ...clausesOf(secondary)],
  };
}

/** Drops repeats while preserving order — candidate lists can overlap. */
export function dedupeOptions(options: ExplanationOption[]): ExplanationOption[] {
  const seen = new Set<string>();
  return options.filter(o => {
    if (seen.has(o.th)) return false;
    seen.add(o.th);
    return true;
  });
}

/**
 * Rewrites each item's explanation so neighbouring cards read differently.
 *
 * Walks the list in rank order and picks, in decreasing order of preference:
 *   1. a candidate whose clauses are all unused — genuinely fresh copy
 *   2. a candidate whose full sentence is unused — differs, but shares a clause
 *   3. the item's own best — everything is taken
 *
 * De-duplication is per clause, not per sentence: "A และ B" followed by a bare
 * "B" are two different strings but still read as a repeat to a student
 * skimming the list.
 *
 * Rank order matters: the top card — the one most students read — always keeps
 * its strongest sentence, and any compromise is pushed down the list.
 *
 * Step 3 repeats a specific, true sentence rather than falling back to generic
 * copy. A duplicate that says something beats a unique sentence that doesn't.
 *
 * Mutates in place; `items` is freshly built by the caller.
 */
export function diversifyExplanations<T extends { explanation: string; explanation_en: string }>(
  items: T[],
  optionsFor: (item: T) => ExplanationOption[] | undefined,
): void {
  const usedClauses  = new Set<string>();
  const usedSentences = new Set<string>();

  for (const item of items) {
    const options = optionsFor(item);
    if (!options || options.length === 0) continue;

    const pick =
      options.find(o => clausesOf(o).every(c => !usedClauses.has(c)))
      ?? options.find(o => !usedSentences.has(o.th))
      ?? options[0];

    clausesOf(pick).forEach(c => usedClauses.add(c));
    usedSentences.add(pick.th);

    const rendered = renderExplanation(pick);
    item.explanation    = rendered.explanation;
    item.explanation_en = rendered.explanation_en;
  }
}
