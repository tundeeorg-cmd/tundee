/**
 * /start — Paid ad landing page (Facebook / Instagram / TikTok / LINE)
 *
 * Standalone, distraction-free page for cold ad traffic. Not linked from any
 * nav, footer, or the sitemap — reachable only via direct URL or an ad click.
 * Global site chrome (Nav/Footer/BottomNav) is hidden for this route in
 * components/ChromeGate.tsx.
 */

import type { Metadata } from 'next';
import StartLanding from './StartLanding';
import { getRegisteredUserCount } from '@/lib/social/userCount';
import { getScholarshipStats } from '@/lib/scholarships/counts';
import { resolveLandingVariant } from '@/lib/landing/variants';

// The opengraph-image.tsx in this directory is auto-resolved by Next.js for
// og:image. We declare the other tags here.

const SITE_URL = 'https://www.tundee.org';

export const metadata: Metadata = {
  title: 'หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที | TunDee',
  description:
    'TunDee ใช้ AI ช่วยค้นหา จัดอันดับ และแนะแนวคุณผ่านทุกทุนที่คุณมีสิทธิ์สมัคร ฟรีทั้งหมด ไม่มีโฆษณา ไม่มีข้อมูลหมดอายุ',
  metadataBase: new URL(SITE_URL),
  // Ad-only landing page — keep it out of search results, but let crawlers
  // follow its links (e.g. to /auth) so it doesn't compete with the main site.
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/start`,
    title: 'หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที',
    description: 'ฟรีทั้งหมด ไม่มีโฆษณา ไม่มีข้อมูลหมดอายุ • ตรวจสอบโดยคนจริงทุกทุน',
    siteName: 'TunDee ทุนดี',
    locale: 'th_TH',
    // og:image is auto-resolved from opengraph-image.tsx (1200×630 PNG)
  },
  twitter: {
    card: 'summary_large_image',
    title: 'หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที',
    description: 'TunDee ใช้ AI ช่วยค้นหาทุนที่คุณมีสิทธิ์ ฟรีตลอด',
  },
  alternates: {
    canonical: `${SITE_URL}/start`,
  },
};

// searchParams (utm_source/utm_medium/utm_campaign/src) are passed to the
// client component, which persists them and forwards them to the CTA link.
export default async function StartPage({
  searchParams,
}: {
  searchParams: {
    utm_source?: string; utm_medium?: string; utm_campaign?: string; src?: string;
    /** Landing headline variant (PREREG §5.8). Recruitment-side only. */
    v?: string;
  };
}) {
  const adParams = {
    utm_source: typeof searchParams.utm_source === 'string' ? searchParams.utm_source : undefined,
    utm_medium: typeof searchParams.utm_medium === 'string' ? searchParams.utm_medium : undefined,
    utm_campaign: typeof searchParams.utm_campaign === 'string' ? searchParams.utm_campaign : undefined,
    src: typeof searchParams.src === 'string' ? searchParams.src : undefined,
  };
  // Resolved server-side against the registry, so the value that reaches the
  // client (and the event log) is always a known key, never raw query input.
  const landingVariant = resolveLandingVariant(
    typeof searchParams.v === 'string' ? searchParams.v : undefined,
  );

  const [stats, registeredCount] = await Promise.all([
    getScholarshipStats(),
    getRegisteredUserCount(),
  ]);
  return (
    <StartLanding
      adParams={adParams}
      scholarshipCount={stats.ok ? stats.scholarships : null}
      registeredCount={registeredCount}
      landingVariant={landingVariant}
    />
  );
}
