/**
 * PostgREST caps a response at 1000 rows without saying so. These cover the
 * pagination that works around it, including the failure modes that made the
 * original bug invisible: a short read reported as complete, and an error
 * swallowed into an empty result.
 */

import { describe, it, expect } from 'vitest';
import { fetchAllRows, chunk } from '@/lib/supabase/fetchAll';

/** A fake table that enforces the same silent cap the real one does. */
function table(rowCount: number, cap = 1000) {
  const all = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({
      data: all.slice(from, Math.min(to + 1, from + cap)),
      error: null,
    });
  };
  return { page, calls };
}

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap that truncated the real queries', async () => {
    const t = table(1575);
    const { data, error, truncated } = await fetchAllRows<{ id: number }>(t.page);
    expect(error).toBeNull();
    expect(truncated).toBe(false);
    expect(data).toHaveLength(1575);
    expect(data[0].id).toBe(0);
    expect(data[1574].id).toBe(1574);
  });

  it('returns every row exactly once, in order', async () => {
    const { page } = table(2500);
    const { data } = await fetchAllRows<{ id: number }>(page);
    expect(data.map(r => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it('stops on a short page instead of querying forever', async () => {
    const t = table(1575);
    await fetchAllRows<{ id: number }>(t.page);
    expect(t.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('makes exactly one extra call when the count lands on a page boundary', async () => {
    const t = table(2000);
    const { data } = await fetchAllRows<{ id: number }>(t.page);
    expect(data).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });

  it('handles an empty table', async () => {
    const { data, error } = await fetchAllRows<{ id: number }>(table(0).page);
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('reports a mid-read failure rather than passing off a partial result', async () => {
    // This is the shape of the original bug: a short read that looks complete.
    let n = 0;
    const { data, error, truncated } = await fetchAllRows<{ id: number }>((from, to) => {
      n++;
      if (n === 2) return Promise.resolve({ data: null, error: { message: 'boom' } });
      return Promise.resolve({
        data: Array.from({ length: 1000 }, (_, i) => ({ id: from + i })),
        error: null,
      });
    });
    expect(error).toEqual({ message: 'boom' });
    expect(truncated).toBe(true);
    expect(data).toHaveLength(1000);   // partial, and flagged as such
  });

  it('gives up rather than looping forever if pages never shorten', async () => {
    const { error } = await fetchAllRows<{ id: number }>((from) =>
      Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: from + i })), error: null }));
    expect(error?.message).toMatch(/exceeded 200 pages/);
  });
});

describe('chunk', () => {
  it('splits a long id list for .in(), which fails outright when too long', () => {
    const ids = Array.from({ length: 1575 }, (_, i) => `TD-${i}`);
    const parts = chunk(ids);
    expect(parts.map(p => p.length)).toEqual([500, 500, 500, 75]);
    expect(parts.flat()).toEqual(ids);
  });

  it('leaves a short list in one piece', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([])).toEqual([]);
  });

  it('refuses a chunk size that would never advance', () => {
    expect(() => chunk([1, 2], 0)).toThrow();
  });
});
