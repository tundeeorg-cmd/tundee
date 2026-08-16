/**
 * Cookie-consent state for analytics and marketing tags (PDPA 2562).
 *
 * Gates GA4, the Meta Pixel and the TikTok Pixel. Nothing loads and no event
 * fires until the visitor accepts.
 *
 * NOT related to `profiles.consent_version`, the research consent collected in
 * the signup wizard. That governs first-party research data (funnel_events,
 * user_events) and is unaffected by this banner — a visitor may decline
 * marketing cookies and still be a consented research participant.
 */

export type ConsentChoice = 'accepted' | 'rejected';

const STORAGE_KEY = 'tundee_cookie_consent';

/** Bump to re-ask everyone — e.g. when the tag list materially changes. */
export const CONSENT_VERSION = '2026-08-v1';

interface StoredConsent {
  choice: ConsentChoice;
  version: string;
  at: string;
}

type Listener = (choice: ConsentChoice | null) => void;
const listeners = new Set<Listener>();

/**
 * The visitor's decision, or null if they haven't made one (or made one under
 * an older version, which counts as undecided).
 */
export function getConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed.choice === 'accepted' || parsed.choice === 'rejected' ? parsed.choice : null;
  } catch {
    // localStorage blocked (private mode, embedded webview) or corrupt value —
    // treat as undecided, which keeps every tag off.
    return null;
  }
}

/** True only on an explicit accept. Undecided and rejected both mean "don't fire". */
export function hasAnalyticsConsent(): boolean {
  return getConsent() === 'accepted';
}

/** Records the choice and notifies subscribers so tags can load immediately. */
export function setConsent(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return;
  const payload: StoredConsent = { choice, version: CONSENT_VERSION, at: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Can't persist — still notify, so the current page behaves as chosen.
  }
  listeners.forEach(fn => fn(choice));
}

/**
 * Subscribes to consent changes, including changes made in another tab.
 * Returns an unsubscribe function.
 */
export function subscribeConsent(fn: Listener): () => void {
  listeners.add(fn);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) fn(getConsent());
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
