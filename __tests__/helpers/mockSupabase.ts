/**
 * Minimal fake Supabase query-builder for route-handler tests.
 *
 * Supports the subset of the chainable API used by the LINE routes:
 * .from(table).select/update/insert(...).eq/gt/in(...)... , and
 * .maybeSingle(). The chain is thenable so `await` resolves at any point,
 * using the response configured for the table + last action
 * (select/update/insert) called.
 */

export interface MockDbCall {
  table: string;
  fn: string;
  args: unknown[];
}

export interface MockDbResponses {
  [table: string]: {
    select?: { data: unknown; error: unknown };
    update?: { data?: unknown; error: unknown };
    insert?: { data?: unknown; error: unknown };
  };
}

function makeQueryBuilder(table: string, responses: MockDbResponses, calls: MockDbCall[]) {
  let action: 'select' | 'update' | 'insert' | null = null;

  const resolveResult = () => {
    const fallback = { data: null, error: null };
    if (!action) return fallback;
    return responses[table]?.[action] ?? fallback;
  };

  const builder: any = {
    select(...args: unknown[]) {
      action = 'select';
      calls.push({ table, fn: 'select', args });
      return builder;
    },
    update(...args: unknown[]) {
      action = 'update';
      calls.push({ table, fn: 'update', args });
      return builder;
    },
    insert(...args: unknown[]) {
      action = 'insert';
      calls.push({ table, fn: 'insert', args });
      return builder;
    },
    eq(...args: unknown[]) {
      calls.push({ table, fn: 'eq', args });
      return builder;
    },
    gt(...args: unknown[]) {
      calls.push({ table, fn: 'gt', args });
      return builder;
    },
    in(...args: unknown[]) {
      calls.push({ table, fn: 'in', args });
      return builder;
    },
    maybeSingle() {
      calls.push({ table, fn: 'maybeSingle', args: [] });
      return Promise.resolve(responses[table]?.select ?? { data: null, error: null });
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolveResult()).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export function createMockDb(responses: MockDbResponses = {}) {
  const calls: MockDbCall[] = [];
  return {
    from(table: string) {
      return makeQueryBuilder(table, responses, calls);
    },
    _calls: calls,
  };
}
