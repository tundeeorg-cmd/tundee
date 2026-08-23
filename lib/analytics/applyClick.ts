/**
 * Records a click through to a funder's application form.
 *
 * One helper, called from every apply entry point, so the admin tile counts all of
 * them. Before this existed only the tracker page wrote to `apply_click`, and the
 * "Apply clicks" tile was really "apply clicks from the tracker page" — 5 against
 * dozens of real ones.
 *
 * `keepalive: true` is the point of the function. Every apply link opens in a new tab,
 * which usually spares the request, but the browser is free to tear down an in-flight
 * fetch and a lost event is invisible. The Meta CAPI call in `lib/analytics/meta.ts`
 * already does this for the same reason; the first-party metric was the one missing it.
 *
 * `sendBeacon` was the other candidate and is the wrong tool here: it cannot be given a
 * JSON content-type reliably, and `/api/apply-click` resolves `user_id` from the session
 * cookie, which a Beacon request does not carry as dependably as a same-origin fetch.
 *
 * Fire-and-forget by design. A student clicking Apply must never be blocked, delayed, or
 * shown an error because analytics was unavailable.
 */

export function recordApplyClick(scholarshipId: string): void {
  if (!scholarshipId) return;
  try {
    void fetch('/api/apply-click', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify({ scholarship_id: scholarshipId }),
      keepalive: true,
    }).catch(() => { /* offline, blocked, or navigating away — nothing to report */ });
  } catch {
    /* fetch itself unavailable — never surface this to a student */
  }
}
