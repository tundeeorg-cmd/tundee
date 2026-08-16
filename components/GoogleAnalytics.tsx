'use client';

/**
 * GA4, gated on cookie consent.
 *
 * Previously rendered unconditionally in app/layout.tsx. Moved here so it obeys
 * the same PDPA banner as the ad pixels — gating marketing tags while leaving
 * analytics running would have been the wrong half to fix, since GA was the tag
 * actually collecting data.
 *
 * Expect a step down in GA volume from the day this ships: it now reports only
 * visitors who accepted.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { hasAnalyticsConsent, subscribeConsent } from '@/lib/analytics/consent';

export default function GoogleAnalytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    return subscribeConsent(choice => setConsented(choice === 'accepted'));
  }, []);

  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId || !consented) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}',{page_path:window.location.pathname});`}
      </Script>
    </>
  );
}
