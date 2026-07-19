// countBus is browser-only by design (SSR-safe no-op without `window`).
// Polyfill a minimal window via Node's built-in EventTarget before importing,
// so its pub-sub behavior can be exercised under the vitest 'node' environment.

type CountBus = typeof import('../lib/tracker/countBus');
let notifyTrackedCountChanged: CountBus['notifyTrackedCountChanged'];
let onTrackedCountChanged: CountBus['onTrackedCountChanged'];

beforeAll(async () => {
  (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
  ({ notifyTrackedCountChanged, onTrackedCountChanged } = await import('../lib/tracker/countBus'));
});

describe('countBus', () => {
  it('invokes a subscribed listener when a change is notified', () => {
    const listener = vi.fn();
    const unsubscribe = onTrackedCountChanged(listener);
    notifyTrackedCountChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onTrackedCountChanged(listener);
    unsubscribe();
    notifyTrackedCountChanged();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies multiple independent subscribers (e.g. Nav and BottomNav)', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onTrackedCountChanged(a);
    const unsubB = onTrackedCountChanged(b);
    notifyTrackedCountChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});
