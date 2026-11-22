/**
 * The look of a one-tap choice button (/start: age, consent, level, income; the
 * browse chips). One definition, so selected never looks almost like unselected
 * again: in dark mode the old selected state was only a slightly lighter navy.
 *
 *   selected    solid fill + ✓ (not colour alone), both themes
 *   unselected  border ≥ 3:1 against the card (WCAG 1.4.11: #7D8AA0 3.5:1, #5F769A 3.6:1), text ≥ 4.5:1
 *
 * Callers keep `aria-pressed` on the button; this is only the paint.
 */
export const CHOICE_SELECTED =
  "border-[#1B3A6B] bg-[#1B3A6B] text-white dark:border-[#8FB4FF] dark:bg-[#8FB4FF] dark:text-[#07111F] " +
  "before:content-['✓'] before:mr-1.5 before:font-bold";

export const CHOICE_IDLE =
  'border-[#7D8AA0] dark:border-[#5F769A] bg-white dark:bg-[#0D1F35] text-chip hover:border-[#1B3A6B] dark:hover:border-[#8FB4FF]';

export const choiceClass = (selected: boolean) => (selected ? CHOICE_SELECTED : CHOICE_IDLE);
