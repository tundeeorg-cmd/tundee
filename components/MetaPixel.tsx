'use client';

/**
 * Meta Pixel base script.
 *
 * Loads only when all three hold: at least one pixel ID is configured, this is
 * the real production deployment (not a Vercel preview), and the visitor
 * accepted cookies. Subscribing to consent means the pixel loads the moment
 * someone taps ยอมรับ, without a page reload.
 *
 * Supports more than one pixel — currently TunDee's own dataset plus the
 * agency's. Each is init'd once and every fbq('track', ...) after that reaches
 * all of them, so no call site needs to know how many pixels exist.
 *
 * Note: /api/meta/capi still mirrors conversions to the PRIMARY pixel only, so
 * the agency dataset receives browser events but not server ones.
 *
 * PageView on client-side navigation is handled separately by MetaPageView —
 * this script only fires the initial one.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getMetaPixelIds, isProductionEnvironment } from '@/lib/analytics/meta';
import { hasAnalyticsConsent, subscribeConsent } from '@/lib/analytics/consent';

export default function MetaPixel() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    return subscribeConsent(choice => setConsented(choice === 'accepted'));
  }, []);

  const pixelIds = getMetaPixelIds();
  if (!pixelIds.length || !isProductionEnvironment() || !consented) return null;

  // One init per pixel, then a SINGLE track — fbq delivers each tracked event
  // to every initialised pixel, so PageView must not be repeated per id.
  const initLines = pixelIds.map(id => `fbq('init', '${id}');`).join('\n        ');

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
        ${initLines}
        fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* Script-less visitors get one beacon per pixel. */}
        {pixelIds.map(id => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            height="1"
            width="1"
            style={{ display: 'none' }}
            alt=""
            src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
          />
        ))}
      </noscript>
    </>
  );
}
