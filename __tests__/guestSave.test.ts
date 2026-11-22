/**
 * A guest's "🔖 บันทึก" tap: ask on the page, remember the scholarship, save it
 * after sign-in.
 *
 * 6–15 Nov 2026: half of all /auth visits came from this button. It jumped to a
 * generic /auth that never mentioned the scholarship, remembered nothing, and
 * 16 of 28 such visits ended with a tap back within seconds.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SAVE_PARAM, PENDING_SAVE_TTL_MS, isScholarshipId, nextWithSave, saveSignupHref,
  rememberPendingSave, readStoredPendingSave, clearPendingSave, pendingSaveFrom,
} from '@/lib/tracker/pendingSave';
import { authHeading, authEntryFrom } from '@/lib/auth/authHeading';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// The node test environment has no localStorage; a Map-backed one is enough.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => store.clear(),
  key:        (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

describe('pendingSave', () => {
  beforeEach(() => localStorage.clear());

  it('accepts real ids and refuses anything that could be a payload', () => {
    expect(isScholarshipId('TD-0037')).toBe(true);
    for (const bad of ['', 'TD 1', '../x', '<script>', 'a'.repeat(65), null, 7]) {
      expect(isScholarshipId(bad), String(bad)).toBe(false);
    }
  });

  it('returns to the same page with the scholarship, keeping its own query', () => {
    expect(nextWithSave('/start?utm_campaign=parents_aug', 'TD-0037'))
      .toBe('/start?utm_campaign=parents_aug&save=TD-0037');
    expect(nextWithSave('/scholarships/td/TD-0001?save=TD-9', 'TD-0037'))
      .toBe('/scholarships/td/TD-0001?save=TD-0037');
  });

  it('never builds an off-site return path', () => {
    expect(nextWithSave('//evil.example/x', 'TD-1')).toBe('/scholarships?save=TD-1');
    expect(nextWithSave('https://evil.example', 'TD-1')).toBe('/scholarships?save=TD-1');
  });

  it('the /auth link says why, and where to come back to', () => {
    const url = new URL(saveSignupHref('/start', 'TD-0037'), 'https://www.tundee.org');
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('from')).toBe('track');
    expect(url.searchParams.get('next')).toBe('/start?save=TD-0037');
  });

  it('prefers the URL (it survives LINE handing off to Chrome), then storage', () => {
    rememberPendingSave('TD-0002');
    expect(pendingSaveFrom(`?${SAVE_PARAM}=TD-0001`)).toBe('TD-0001');
    expect(pendingSaveFrom('')).toBe('TD-0002');
    expect(pendingSaveFrom(`?${SAVE_PARAM}=<bad>`)).toBe('TD-0002');
  });

  it('forgets a tap older than a day, and on clear', () => {
    const t0 = 1_000_000;
    rememberPendingSave('TD-0003', t0);
    expect(readStoredPendingSave(t0 + PENDING_SAVE_TTL_MS)).toBe('TD-0003');
    expect(readStoredPendingSave(t0 + PENDING_SAVE_TTL_MS + 1)).toBeNull();
    clearPendingSave();
    expect(readStoredPendingSave(t0)).toBeNull();
  });

  it('ignores corrupt storage instead of throwing', () => {
    localStorage.setItem('tundee_pending_save', '{not json');
    expect(readStoredPendingSave()).toBeNull();
  });
});

describe('/auth says why the student is there', () => {
  it('after a Save tap, the heading is about saving', () => {
    expect(authHeading('track', true)).toContain('บันทึกทุนนี้');
    expect(authHeading('track', false)).toMatch(/save this scholarship/i);
  });

  it('otherwise it is unchanged', () => {
    expect(authHeading(null, true)).toBe('เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ');
    expect(authHeading('signup', true)).toBe('เข้าสู่ระบบเพื่อดูทุนที่ตรงกับคุณ');
  });

  it('records which link brought them, never raw text', () => {
    expect(authEntryFrom('track')).toBe('track');
    expect(authEntryFrom(null)).toBe('direct');
    expect(authEntryFrom('<anything>')).toBe('other');
  });

  it('both the no-JS shell and the form use the shared heading, and the form logs `from`', () => {
    expect(read('app/auth/AuthShell.tsx')).toContain('{authHeading(from, true)}');
    expect(read('app/auth/page.tsx')).toContain("from={one('from')}");
    const form = read('app/auth/AuthForm.tsx');
    expect(form).toContain("authHeading(searchParams.get('from'), th)");
    expect(form).toMatch(/eventType: 'signup_started',\s*context: \{ \.\.\.inAppContext\(info\), from: authEntryFrom\(searchParams\.get\('from'\)\) \}/);
  });
});

describe('the Save button and what follows', () => {
  const BUTTON   = read('components/TrackButton.tsx');
  const SHEET    = read('components/tracker/GuestSaveSheet.tsx');
  const RESOLVER = read('components/tracker/PendingSaveResolver.tsx');

  it('a guest tap remembers the scholarship and opens the sheet, not /auth', () => {
    expect(BUTTON).not.toMatch(/router\.push\(['"`]\/auth/);
    const guest = BUTTON.slice(BUTTON.indexOf('if (!user) {'), BUTTON.indexOf('if (tracked && trackId)'));
    expect(guest.indexOf('rememberPendingSave(scholarshipId)')).toBeGreaterThan(-1);
    expect(guest.indexOf('rememberPendingSave(scholarshipId)')).toBeLessThan(guest.indexOf('setGuestSheet(true)'));
  });

  it('the sheet signs in on the page, tagged as the Save surface, with a way out', () => {
    expect(SHEET).toMatch(/<SignInSheet[\s\S]*signupHref=\{saveSignupHref\(here, scholarshipId\)\}[\s\S]*surface="save"/);
    const shared = read('components/auth/SignInSheet.tsx');
    expect(shared).toMatch(/<LineQuickStart[\s\S]*signupHref=\{signupHref\}[\s\S]*surface=\{surface\}/);
    expect(shared).toContain('createPortal(');
    expect(shared).toContain('SIGN_IN_SHEET_LATER');
  });

  it('the sticky button on the /start results opens the same sheet instead of leaving for /auth', () => {
    const results = read('app/start/PreviewResults.tsx');
    const sticky = results.slice(results.indexOf('Sticky CTA'), results.indexOf('Clears the sticky bar'));
    expect(sticky).not.toMatch(/<Link\s+href=\{signupHref\}/);
    expect(sticky).toContain('onClick={() => setSheetOpen(true)}');
    expect(sticky).toMatch(/<SignInSheet[\s\S]*signupHref=\{signupHref\}[\s\S]*surface="start_sticky"/);
  });

  it('every quiz result card has Save, so the best matches can be saved from the results', () => {
    const results = read('app/start/PreviewResults.tsx');
    const card = results.slice(results.indexOf('function MatchCard'), results.indexOf('export default function PreviewResults'));
    expect(card).toContain('<TrackButton scholarshipId={card.scholarship_id} scholarshipName={card.name}');
    // Outside the apply_url condition: a card with no funder link can still be saved.
    expect(card.indexOf('<TrackButton')).toBeLessThan(card.indexOf('{card.apply_url && ('));
  });

  it('a signed-in student is not asked to sign up on the results (15 Nov 2026)', () => {
    const results = read('app/start/PreviewResults.tsx');
    expect(results).toContain('supabase.auth.getUser()');
    const sticky = results.slice(results.indexOf('Sticky CTA'), results.indexOf('Clears the sticky bar'));
    // Signed in: a link to the saved list; otherwise the sign-in sheet.
    expect(sticky).toMatch(/\{signedIn \? \(\s*<Link\s+href="\/tracker"[\s\S]*SIGNED_IN_COPY\.sticky[\s\S]*\) : \([\s\S]*setSheetOpen\(true\)/);
    // The inline sign-up block sits in the guest branch only.
    const gate = results.slice(results.indexOf('Clears the sticky bar'));
    expect(gate.indexOf('{signedIn === true ? (')).toBeGreaterThan(-1);
    expect(gate.indexOf('SIGNED_IN_COPY.note')).toBeLessThan(gate.indexOf('<LineQuickStart'));
    // The guest block (which logs login_method_shown on mount) waits for a definite "guest".
    expect(gate.indexOf(') : signedIn === false ? (')).toBeLessThan(gate.indexOf('<LineQuickStart'));
    expect(gate).toContain(') : null}');
  });

  it('inside Facebook the tracker leads with email reminders and offers no dead-end LINE button', () => {
    const tracker = read('app/tracker/page.tsx');
    expect(tracker).toContain('setInApp(emailFirstLogin(detectInAppBrowser()))');
    const order = tracker.slice(tracker.indexOf('{inApp ? ('));
    expect(order.indexOf('<EmailReminderSection')).toBeLessThan(order.indexOf('<LineSection'));
    expect(order).toMatch(/<LineSection[^>]*inApp \/>/);
    const line = tracker.slice(tracker.indexOf('function LineSection'), tracker.indexOf('function EmailReminderSection'));
    expect(line).toContain('const blocked = inApp && !linked;');
    expect(line).toMatch(/\) : blocked \? null : \(\s*<a\s+href="\/api\/line\/connect"/);
    expect(line).toContain('LINE_BLOCKED_COPY');
    // A Next.js page file may only export what Next allows.
    expect(tracker).not.toMatch(/^export const LINE_BLOCKED_COPY/m);
  });

  it('/auth on the browser side also asks Supabase before sending a student away', () => {
    const form = read('app/auth/AuthForm.tsx');
    expect(form).toContain('supabase.auth.getUser().then(({ data: { user } }) => {\n      if (user) router.replace(next);');
    expect(form).not.toMatch(/getSession\(\)\.then\(\(\{ data: \{ session \} \}\) => \{\s*if \(session\) router\.replace/);
  });

  it('the shared sign-in pieces keep /start as their default surface', () => {
    expect(read('components/start/LineQuickStart.tsx')).toContain("surface = 'start',");
    expect(read('components/start/EmailCodeStart.tsx')).toContain("surface = 'start',");
    expect(read('components/start/LineQuickStart.tsx')).toContain('surface={surface}');
  });

  it('the resolver is mounted for every page, chromeless /start included', () => {
    expect(read('app/layout.tsx')).toContain('<PendingSaveResolver />');
  });

  it('saves only with a session, idempotently, and forgets only after success', () => {
    expect(RESOLVER).toContain("onConflict: 'user_id,scholarship_id'");
    const afterWrite = RESOLVER.slice(RESOLVER.indexOf('.upsert('));
    expect(afterWrite.indexOf('if (error)')).toBeLessThan(afterWrite.indexOf('clearPendingSave()'));
    expect(RESOLVER).toMatch(/if \(!user\) \{\s*rememberPendingSave\(id\);\s*return;/);
  });

  it('a Save button already on screen re-checks when the resolver saves', () => {
    expect(BUTTON).toContain('onTrackedCountChanged(');
    expect(BUTTON).toContain('[scholarshipId, refresh]');
  });
});
