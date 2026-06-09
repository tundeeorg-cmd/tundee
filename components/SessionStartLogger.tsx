'use client';

import { useEffect } from 'react';
import { logEvent } from '@/lib/research/events';

/**
 * Fires a single 'session_start' event when the app first mounts in the browser.
 * The session ID in logEvent is tab-scoped, so this runs once per browser tab.
 * Renders nothing visible.
 */
export default function SessionStartLogger() {
  useEffect(() => {
    void logEvent({ eventType: 'session_start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
