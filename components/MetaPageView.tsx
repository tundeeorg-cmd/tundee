'use client';

/**
 * PageView on client-side navigation.
 *
 * The App Router does not reload the document between routes, so the base
 * pixel's single `fbq('track','PageView')` at init is the only one Meta ever
 * sees. Every subsequent route change has to be reported explicitly or the
 * whole funnel past the landing page is invisible.
 *
 * The initial load is skipped here because the base script already counted it.
 */

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics/meta';

function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}

export default function MetaPageView() {
  // useSearchParams() opts a component into client-side rendering; without a
  // Suspense boundary it de-opts every statically generated page in the app and
  // fails the production build.
  return (
    <Suspense fallback={null}>
      <RouteChangeTracker />
    </Suspense>
  );
}
