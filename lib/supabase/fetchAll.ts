/**
 * Paginated reads, because PostgREST silently caps a response at 1000 rows.
 *
 * The cap is not an error. A query matching 1,575 rows returns 1,000 of them
 * with no warning, no flag, and no error object — so the calling code looks
 * correct, the tests pass on small fixtures, and the failure only appears in
 * production once the table crosses the threshold. This repository has been
 * caught by it repeatedly.
 *
 * As of 30 Aug 2026 td_scholarships holds 1,575 rows, and two callers were
 * already truncated: the nightly status recompute, which had stopped
 * recalculating 575 scholarships, and the admin CSV export, which had been
 * writing short files. Neither reported anything wrong.
 *
 * ORDERING IS REQUIRED, not decorative. Range pagination over an unordered
 * result is undefined: PostgreSQL may return rows in a different order between
 * pages, so rows can be duplicated or skipped. Every caller must apply a stable
 * .order() on a unique column.
 */

const POSTGREST_MAX_ROWS = 1000;

/** Belt and braces against a pathological loop; 200k rows is far beyond any table here. */
const MAX_PAGES = 200;

/**
 * What one page of any PostgREST query looks like.
 *
 * `data` is deliberately `unknown` rather than `T[]`: supabase-js types a
 * dynamic `.select(string)` as an error-shaped array, so a stricter signature
 * would reject the very call sites that most need paginating. The generic still
 * documents what the caller expects, and the cast happens in one place here
 * rather than at each call site.
 */
interface PageResult {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Read every row a query matches, one page at a time.
 *
 * The callback must apply `.range(from, to)` to a query that is otherwise
 * complete — including a stable `.order()`.
 *
 *   const { data, error } = await fetchAllRows<Row>((from, to) =>
 *     db.from('td_scholarships').select('*').order('scholarship_id').range(from, to),
 *   );
 *
 * Errors are returned, not thrown, so call sites keep their existing shape.
 * A page that errors aborts the read and returns the error: a partial result
 * presented as complete is the very failure this exists to prevent.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize: number = POSTGREST_MAX_ROWS,
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const rows: T[] = [];

  for (let p = 0; p < MAX_PAGES; p++) {
    const from = p * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);

    if (error) return { data: rows, error, truncated: true };

    const pageRows = (data ?? []) as T[];
    if (pageRows.length === 0) return { data: rows, error: null, truncated: false };

    rows.push(...pageRows);
    // A short page is the last page.
    if (pageRows.length < pageSize) return { data: rows, error: null, truncated: false };
  }

  return {
    data: rows,
    error: { message: `fetchAllRows exceeded ${MAX_PAGES} pages (${rows.length} rows)` },
    truncated: true,
  };
}

/**
 * Split a list for `.in(...)` filters.
 *
 * A large `.in()` is capped by the same 1000-row response limit, and long
 * before that the URL itself becomes too long: 1,575 ids produced a bare
 * "fetch failed" rather than any usable error.
 */
export function chunk<T>(items: T[], size: number = 500): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
