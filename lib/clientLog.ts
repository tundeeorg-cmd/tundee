/**
 * Sending browser-side diagnostics to a log we can actually read.
 *
 * The save button on /profile/setup works on desktop Chrome and spins forever
 * on Android Chrome — same user, same profile, same deployment. Everything that
 * would explain the difference happens in the browser, so none of it reaches us.
 * This is the pipe. See app/api/client-log/route.ts for the receiving end.
 *
 * Three properties matter more than completeness here:
 *
 *   NEVER THROW. This is called from error handlers and from `finally` blocks.
 *   A reporter that can fail turns one bug into two, and the second one hides
 *   the first.
 *
 *   NEVER BLOCK. `sendBeacon` hands the payload to the browser and returns
 *   immediately, which also means the report survives the page being navigated
 *   away or backgrounded — the exact moments worth reporting. `fetch` with
 *   `keepalive` is the fallback.
 *
 *   NEVER GATE THE FEATURE ON IT. Nothing awaits these. A save must not depend
 *   on our ability to describe it.
 */

export type ClientLogLevel = 'error' | 'warn' | 'info';

export interface ClientLogPayload {
  level?: ClientLogLevel;
  message: string;
  context?: unknown;
  userId?: string | null;
}

/** Trimmed here as well as on the server: no reason to put 40KB on the wire to
 *  have it discarded on arrival. */
const MAX_MESSAGE = 500;
const MAX_CONTEXT_CHARS = 2_000;

function safeContext(context: unknown): unknown {
  if (context === undefined || context === null) return undefined;
  try {
    const json = JSON.stringify(context);
    if (json === undefined) return undefined;
    return json.length > MAX_CONTEXT_CHARS ? json.slice(0, MAX_CONTEXT_CHARS) : context;
  } catch {
    // Circular, or a DOM node, or a Proxy that throws on read.
    return '[uncloneable]';
  }
}

/**
 * Report one line. Fire-and-forget by design — there is nothing to await and
 * nothing to handle.
 */
export function clientLog(payload: ClientLogPayload): void {
  try {
    if (typeof window === 'undefined') return;

    const body = JSON.stringify({
      level:     payload.level ?? 'error',
      message:   String(payload.message ?? '').slice(0, MAX_MESSAGE),
      context:   safeContext(payload.context),
      userId:    payload.userId ?? null,
      userAgent: navigator.userAgent,
      url:       window.location.href,
    });

    // Preferred: survives navigation and backgrounding, and cannot block.
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/client-log', blob)) return;
      // Returns false when the payload is over the UA's beacon quota; fall
      // through rather than losing the report.
    }

    void fetch('/api/client-log', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* reporting must never surface an error of its own */ });
  } catch {
    /* Every failure here is silent on purpose. */
  }
}

/**
 * Route uncaught errors and unhandled rejections to the same place.
 *
 * Returns a cleanup function for React effects. Idempotent per call — the
 * listeners it adds are the ones it removes.
 *
 * These two handlers are the reason a hang can be told apart from a crash. A
 * button that stops responding because a promise rejected somewhere with no
 * catch looks, from the outside, exactly like a button that is still waiting.
 */
export function installGlobalErrorReporting(getUserId: () => string | null = () => null): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    clientLog({
      level:   'error',
      message: `window.onerror: ${event.message}`,
      userId:  getUserId(),
      context: {
        source: event.filename,
        line:   event.lineno,
        col:    event.colno,
        stack:  event.error?.stack?.slice(0, 1_000),
      },
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    clientLog({
      level:   'error',
      message: `unhandledrejection: ${reason instanceof Error ? reason.message : String(reason)}`,
      userId:  getUserId(),
      context: { stack: reason instanceof Error ? reason.stack?.slice(0, 1_000) : undefined },
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/**
 * Reject after `ms` so a hung await cannot own the UI forever.
 *
 * supabase-js sets no timeout on its network calls, and neither does fetch. On
 * a phone that has just come back from the LINE app — a suspended tab, a
 * changed network, a throttled storage layer — "no answer yet" and "no answer
 * ever" are indistinguishable, and the only visible difference to a student is
 * whether the spinner ever stops.
 *
 * The losing promise is not cancelled, because it cannot be. It is abandoned:
 * if it settles later, nothing is listening.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); },
    );
  });
}

export class TimeoutError extends Error {
  readonly label: string;
  readonly ms: number;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.ms = ms;
  }
}
