'use client';

/**
 * PageView on client-side navigation, for every configured platform.
 *
 * The App Router does not reload the document between routes, so each base
 * script's single pageview at init is the only one the platforms ever see.
 * Every subsequent route change has to be reported explicitly or the whole
 * funnel past the landing page is invisible.
 *
 * This was Meta-only (components/MetaPageView.tsx). TikTok's ttq.page() and
 * GA4's config pageview have exactly the same one-shot behaviour, so both were
 * under-reporting every client-side navigation. lib/analytics fans out to all
 * three now.
 *
 * The initial load is skipped here because each base script already counted it.
 */

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageView } from '@/lib/analytics';

function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    pageView();
  }, [pathname, searchParams]);

  return null;
}

export default function AnalyticsPageView() {
  // useSearchParams() opts a component into client-side rendering; without a
  // Suspense boundary it de-opts every statically generated page in the app and
  // fails the production build.
  return (
    <Suspense fallback={null}>
      <RouteChangeTracker />
    </Suspense>
  );
}
