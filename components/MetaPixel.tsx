'use client';

/**
 * Meta Pixel base script.
 *
 * Loads only when all three hold: a pixel ID is configured, this is the real
 * production deployment (not a Vercel preview), and the visitor accepted
 * cookies. Subscribing to consent means the pixel loads the moment someone
 * taps ยอมรับ, without a page reload.
 *
 * PageView on client-side navigation is handled separately by MetaPageView —
 * this script only fires the initial one.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getMetaPixelId, isProductionEnvironment } from '@/lib/analytics/meta';
import { hasAnalyticsConsent, subscribeConsent } from '@/lib/analytics/consent';

export default function MetaPixel() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    return subscribeConsent(choice => setConsented(choice === 'accepted'));
  }, []);

  const pixelId = getMetaPixelId();
  if (!pixelId || !isProductionEnvironment() || !consented) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
