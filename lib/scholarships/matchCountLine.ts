/**
 * The count line above the matches. It used to read "แสดง 20 ทุน (คะแนน 0%+)
 * จากทั้งหมด 50 ทุน", which mixed the page size, a filter nobody had set and
 * the total into one sentence. Now: how many match, how many the % filter
 * keeps, and how many are on screen, each only when it says something.
 */
export function matchCountLine({ total, filteredCount, visibleCount, minScore, lang }: {
  total: number; filteredCount: number; visibleCount: number; minScore: number; lang: 'th' | 'en';
}): string {
  const pct = Math.round(minScore * 100);
  const head = minScore === 0
    ? (lang === 'th' ? `ทุนที่ตรงกับคุณ ${total} ทุน` : `${total} scholarships match you`)
    : (lang === 'th' ? `ตรงกับคุณ ${pct}% ขึ้นไป: ${filteredCount} ทุน` : `${pct}%+ match: ${filteredCount} scholarships`);
  const shown = minScore === 0 ? total : filteredCount;
  const tail = visibleCount < shown
    ? (lang === 'th' ? ` · แสดง ${visibleCount} ทุนแรก` : ` · showing the first ${visibleCount}`)
    : '';
  return head + tail;
}
