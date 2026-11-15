/**
 * A scholarship a guest tapped "บันทึก" on, carried across sign-in.
 *
 * Until 15 Nov 2026 a guest's Save tap jumped to a generic /auth page that did
 * not say why they were there, and nothing remembered which scholarship it was:
 * a student who did sign in landed elsewhere with nothing saved. Half of all
 * /auth visits since 6 Nov came from that button, and most tapped back.
 *
 * Two carriers, because sign-in can cross a browser boundary:
 *   • the `save` param on the post-sign-in `next` path — survives LINE's hand-off
 *     from the Facebook webview to Chrome, which shares no storage;
 *   • localStorage — survives the email-code path, which stays in one browser
 *     and returns to `next` through /auth/callback.
 * Either one is enough. PendingSaveResolver reads both once, after sign-in.
 */

export const SAVE_PARAM = 'save';
const STORAGE_KEY = 'tundee_pending_save';
/** A tap older than this is not something the student is still waiting on. */
export const PENDING_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

/** Scholarship ids look like TD-0037; refuse anything that could be a payload. */
export function isScholarshipId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}

export function rememberPendingSave(id: string, now = Date.now()): void {
  if (!isScholarshipId(id)) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, at: now })); } catch { /* private mode */ }
}

export function clearPendingSave(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
}

/** The stored tap, if it is recent and well-formed. Does not clear it. */
export function readStoredPendingSave(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (!isScholarshipId(v.id) || typeof v.at !== 'number') return null;
    return now - v.at <= PENDING_SAVE_TTL_MS ? v.id : null;
  } catch {
    return null;
  }
}

/**
 * The page to come back to after sign-in, carrying the scholarship.
 * `path` is a same-site path (pathname + search), as /auth's `next` requires.
 */
export function nextWithSave(path: string, id: string): string {
  const base = path.startsWith('/') && !path.startsWith('//') ? path : '/scholarships';
  const url = new URL(base, 'https://x.invalid');
  url.searchParams.delete(SAVE_PARAM);
  if (isScholarshipId(id)) url.searchParams.set(SAVE_PARAM, id);
  return url.pathname + url.search + url.hash;
}

/** The /auth link for a guest's Save tap: says why (`from=track`) and where to return. */
export function saveSignupHref(path: string, id: string): string {
  const qs = new URLSearchParams({ from: 'track', next: nextWithSave(path, id) });
  return `/auth?${qs.toString()}`;
}

/** The scholarship to save now: the URL's `save` param first, then storage. */
export function pendingSaveFrom(search: string, now = Date.now()): string | null {
  const fromUrl = new URLSearchParams(search).get(SAVE_PARAM);
  if (isScholarshipId(fromUrl)) return fromUrl;
  return readStoredPendingSave(now);
}
