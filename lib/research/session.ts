/** Stable browser-tab session ID — persisted in sessionStorage, never in DB directly. */

const KEY = 'tundee_session_id';

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}
