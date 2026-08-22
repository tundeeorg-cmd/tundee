'use client';

/**
 * TikTok Pixel base code, gated on cookie consent.
 *
 * The Meta Pixel used to live here too. It now has its own component
 * (components/MetaPixel.tsx) so there is exactly one place that calls
 * fbq('init') — two loaders reading two different env vars would have
 * double-counted every PageView the moment both were set.
 *
 * No-ops if NEXT_PUBLIC_TIKTOK_PIXEL_ID isn't set, so TikTok stays dormant
 * until the pixel is created in TikTok Ads Manager.
 *
 * ttq.page() here is the INITIAL pageview only. Route changes are reported by
 * components/AnalyticsPageView.tsx, which skips the initial load so the two
 * can't double-count.
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { hasAnalyticsConsent, subscribeConsent } from '@/lib/analytics/consent';
import { getTikTokPixelId, isTikTokPixelEnabled } from '@/lib/analytics/tiktok';

export default function AdPixels() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(hasAnalyticsConsent());
    return subscribeConsent(choice => setConsented(choice === 'accepted'));
  }, []);

  const tiktokPixelId = getTikTokPixelId();
  if (!consented || !isTikTokPixelEnabled()) return null;

  return (
    <Script id="tiktok-pixel-base" strategy="afterInteractive">
      {`!function (w, d, t) {
        w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.length;n++)ttq.setAndDefer(e,e[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};
        ttq.load('${tiktokPixelId}');
        ttq.page();
      }(window, document, 'ttq');`}
    </Script>
  );
}
