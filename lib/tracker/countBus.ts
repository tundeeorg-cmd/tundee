/**
 * Cross-component signal for "the current user's tracked_scholarship rows changed".
 * Nav / BottomNav subscribe so the badge count updates instantly (no reload) when
 * TrackButton or the tracker page add/remove a row.
 */

const EVENT_NAME = 'tundee:tracked-count-changed';

export function notifyTrackedCountChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onTrackedCountChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
