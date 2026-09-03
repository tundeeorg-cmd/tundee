/**
 * Architectural guard: window.fbq / window.ttq / window.gtag may be called
 * from exactly three files — the adapters that already handle consent
 * gating, event-id generation and CAPI mirroring. Every other call site must
 * go through lib/analytics (the fan-out layer) instead.
 *
 * This is the ticket's own rule made enforceable rather than just written in
 * a docblock: "ทุกจุดในเว็บต้องเรียกผ่านฟังก์ชันนี้เท่านั้น ห้ามมีที่ไหนเรียก
 * fbq() ตรง ๆ อีก" — the same value implemented in more than one place is
 * exactly the shape of bug that hit grade_level, the two LINE secrets, and
 * study_location this session. A comment saying "don't do this" doesn't
 * catch the next call site that does it anyway; this test does.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);

/** The only files allowed to touch the platform SDKs directly. */
const ALLOWED = new Set([
  'lib/analytics/meta.ts',
  'lib/analytics/tiktok.ts',
  'lib/analytics/ga.ts',
]);

/** Real call syntax only — window.fbq?.(...), window.ttq?.track(...), etc. */
const RAW_CALL = /window\.fbq\??\.?\(|window\.gtag\??\.?\(|window\.ttq\??\.(track|page)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('no raw pixel SDK calls outside the analytics adapters', () => {
  it('window.fbq/window.ttq/window.gtag appear only in lib/analytics/{meta,tiktok,ga}.ts', () => {
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (ALLOWED.has(rel)) continue;
        if (RAW_CALL.test(readFileSync(file, 'utf8'))) offenders.push(rel);
      }
    }

    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('sanity check — the pattern really does catch the three allowed files', () => {
    // If this ever fails, the regex has drifted from how the adapters
    // actually call the SDKs, and the test above would pass for the wrong
    // reason (nothing left to check, not "nothing violates the rule").
    const hits = ['lib/analytics/meta.ts', 'lib/analytics/tiktok.ts', 'lib/analytics/ga.ts']
      .filter(rel => RAW_CALL.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(hits.sort()).toEqual(['lib/analytics/ga.ts', 'lib/analytics/meta.ts', 'lib/analytics/tiktok.ts']);
  });
});
