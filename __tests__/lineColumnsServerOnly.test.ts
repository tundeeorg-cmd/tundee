/**
 * profiles.line_user_id is written by the server only.
 *
 * LINE sign-in finds the account to sign someone into by that column. If a user
 * session could write it, a student could put someone else's LINE id on their
 * own profile and receive that person's next LINE sign-in. Production allowed
 * exactly that until 2026-10-04.
 *
 * Two layers, both asserted here:
 *   1. The database rejects the write from anon/authenticated
 *      (scripts/20261004_v22_protect_line_columns.sql).
 *   2. Every route that writes the column does so through the service role, so
 *      layer 1 never breaks a legitimate flow. Before v22, /api/line/callback
 *      and /api/line/unlink wrote it with the user's own session.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const full = join(ROOT, dir, name);
    const rel = relative(ROOT, full);
    if (statSync(full).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

/** `<receiver>.from('profiles').update|upsert|insert({ … line_user_id … })` */
const LINE_WRITE =
  /(\w+)\s*\.from\(\s*'profiles'\s*\)\s*\.(?:update|upsert|insert)\(\s*\{[^}]*\bline_(?:user_id|linked_at)\b/g;

/** Receivers that are service-role clients, by the names this codebase gives them. */
const SERVICE_RECEIVERS = new Set(['admin', 'db']);

const writers = [...sourceFiles('app'), ...sourceFiles('lib')]
  .map(file => ({ file, src: read(file) }))
  .map(({ file, src }) => ({ file, src, receivers: Array.from(src.matchAll(LINE_WRITE), m => m[1]) }))
  .filter(w => w.receivers.length > 0);

describe('LINE columns: app code writes them through the service role only', () => {
  it('finds the known writers (guards the scan itself)', () => {
    const files = writers.map(w => w.file);
    for (const expected of [
      'app/api/auth/line/callback/route.ts',
      'app/api/line/callback/route.ts',
      'app/api/line/unlink/route.ts',
      'app/api/line/webhook/route.ts',
    ]) {
      expect(files, `${expected} no longer matched — has the write moved?`).toContain(expected);
    }
  });

  it.each(writers.map(w => [w.file, w]))('%s writes with a service-role client', (_file, w) => {
    const { src, receivers } = w as (typeof writers)[number];
    for (const r of receivers) {
      expect(SERVICE_RECEIVERS.has(r), `writes line_user_id through "${r}", not a service-role client`).toBe(true);
    }
    expect(src).toMatch(/createAdminClient\(|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('the user-session routes authenticate with the session but write with the admin client', () => {
    for (const file of ['app/api/line/callback/route.ts', 'app/api/line/unlink/route.ts']) {
      const src = read(file);
      expect(src).toContain('supabase.auth.getUser()');
      expect(src).toContain('createAdminClient()');
      expect(src).not.toMatch(/supabase\s*\.from\(\s*'profiles'\s*\)\s*\.update/);
    }
  });
});

describe('LINE columns: the database rejects them from a user session (v22)', () => {
  const sql = read('scripts/20261004_v22_protect_line_columns.sql');

  it('installs a BEFORE INSERT OR UPDATE row trigger on profiles', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_protect_profile_line_columns\s+BEFORE INSERT OR UPDATE ON public\.profiles\s+FOR EACH ROW/);
  });

  it('blocks exactly the client roles, and both columns', () => {
    expect(sql).toContain("current_user NOT IN ('anon', 'authenticated')");
    expect(sql).toMatch(/NEW\.line_user_id\s+IS DISTINCT FROM OLD\.line_user_id/);
    expect(sql).toMatch(/NEW\.line_linked_at\s+IS DISTINCT FROM OLD\.line_linked_at/);
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it('is re-runnable', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_profile_line_columns()');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_protect_profile_line_columns');
  });
});
