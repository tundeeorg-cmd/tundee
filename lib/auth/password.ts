/**
 * The password rule, in one place.
 *
 * Three files enforce or describe it — the route that creates accounts, the
 * hydrated form, and the no-JS shell — and a rule that disagrees with itself
 * across them shows up as a form that rejects what its own hint said was fine.
 *
 * Eight characters, with a strength hint rather than a character-class rule.
 * Complexity requirements do not survive contact with a 15-year-old on a phone
 * keyboard: they produce abandoned signups and, among those who persist,
 * passwords written down. Length is the property that actually matters.
 */
export const MIN_PASSWORD_LENGTH = 8;
