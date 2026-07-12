/**
 * /students — Student recruitment landing page
 *
 * Opened from:
 *  - Teacher LINE forwards (showing a rich card from OG meta)
 *  - Printed QR codes (?src=school)
 *  - Social media links (?src=line | fb | tiktok)
 *
 * The page captures ?src= and stores it in localStorage so the signup
 * flow can write it to profiles.acquisition_source.
 */

import type { Metadata } from 'next'
import StudentsLanding from './StudentsLanding'

// ── Open Graph + Twitter metadata ─────────────────────────────────────────────
// The opengraph-image.tsx in this directory is auto-resolved by Next.js for
// og:image. We declare the other tags here.

const SITE_URL = 'https://tundee.org'

export const metadata: Metadata = {
  title: 'ทุนดี — ค้นพบทุนการศึกษาที่น้องมีสิทธิ์ | TunDee',
  description:
    'เช็กฟรีใน 2 นาที ว่าน้องมีสิทธิ์ทุนไหนบ้าง ระบบจับคู่ทุนการศึกษาส่วนตัวสำหรับนักเรียนไทย แสดงเฉพาะทุนจริงที่ตรวจสอบแล้ว',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type:        'website',
    url:         `${SITE_URL}/students`,
    title:       'ทุนดี — ค้นพบทุนการศึกษาที่น้องมีสิทธิ์',
    description: 'เช็กฟรีใน 2 นาที ว่าน้องมีสิทธิ์ทุนไหนบ้าง • ฟรีสำหรับนักเรียนเสมอ • แสดงเฉพาะทุนจริงที่ตรวจสอบแล้ว',
    siteName:    'TunDee ทุนดี',
    locale:      'th_TH',
    // og:image is auto-resolved from opengraph-image.tsx (1200×630 PNG)
  },
  twitter: {
    card:        'summary_large_image',
    title:       'ทุนดี — ค้นพบทุนการศึกษาที่น้องมีสิทธิ์',
    description: 'เช็กฟรีใน 2 นาที ว่าน้องมีสิทธิ์ทุนไหนบ้าง',
  },
  alternates: {
    canonical: `${SITE_URL}/students`,
  },
}

// ── Page ─────────────────────────────────────────────────────────────────────
// searchParams are passed to the client component which persists ?src
export default function StudentsPage({
  searchParams,
}: {
  searchParams: { src?: string }
}) {
  const src = typeof searchParams.src === 'string' ? searchParams.src : 'direct'
  return <StudentsLanding src={src} />
}
