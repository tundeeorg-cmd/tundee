/**
 * "…ใน 2 นาที" left "นาที" alone on the last line at every width. The phrase is held
 * together with no-break spaces (the copy itself is unchanged) and the heading is
 * balanced (text-wrap: balance) so the two lines are of similar length.
 */
export function keepTimeTogether(h1: string): string {
  return h1.replace(/ ใน (\d+) นาที/, ' ใน\u00A0$1\u00A0นาที');
}
