/**
 * /students — Open Graph image (1200×630 PNG)
 * Generated at the edge by Next.js ImageResponse.
 * Thai text requires Sarabun font loaded from Google Fonts CDN.
 *
 * This file is automatically picked up by Next.js App Router and served at:
 *   /students/opengraph-image
 * Referenced in the page's metadata as og:image.
 */

import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const alt         = 'TunDee ทุนดี — ค้นพบทุนการศึกษาที่น้องมีสิทธิ์'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  // Load Sarabun Regular for Thai text rendering
  // Using the stable Google Fonts CDN woff file (subset: Thai + Latin)
  let sarabunData: ArrayBuffer | null = null
  try {
    sarabunData = await fetch(
      'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YL5.woff'
    ).then((r) => r.arrayBuffer())
  } catch {
    // If font fetch fails (cold edge start), render without custom font
    // Thai chars will appear as boxes but layout is preserved
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #071829 0%, #0A2342 50%, #1B3A6B 100%)',
          fontFamily: 'Sarabun, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle geometric accent — top right */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 420,
            height: 420,
            borderRadius: '50%',
            background: 'rgba(46, 95, 163, 0.25)',
            display: 'flex',
          }}
        />
        {/* Bottom left accent */}
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -60,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'rgba(27, 58, 107, 0.4)',
            display: 'flex',
          }}
        />

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 48 }}>
          {/* Icon badge */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#2E5FA3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              color: '#FFFFFF',
              fontWeight: 700,
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            ท
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span
              style={{
                color: '#FFFFFF',
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.5px',
              }}
            >
              ทุนดี
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 18,
                fontWeight: 400,
                letterSpacing: '0.22em',
                marginTop: 2,
              }}
            >
              TUNDEE
            </span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 58,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.35,
            marginBottom: 28,
            maxWidth: 900,
            padding: '0 48px',
          }}
        >
          ทุนที่น้องสมัครได้
          <br />
          อาจอยู่ตรงหน้าโดยไม่รู้ตัว
        </div>

        {/* Sub */}
        <div
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 28,
            textAlign: 'center',
            marginBottom: 48,
          }}
        >
          เช็กฟรีใน 2 นาที ว่าน้องมีสิทธิ์ทุนไหนบ้าง
        </div>

        {/* URL pill */}
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1.5px solid rgba(255,255,255,0.2)',
            borderRadius: 100,
            padding: '10px 32px',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 22,
            letterSpacing: '0.04em',
          }}
        >
          tundee.org/students
        </div>
      </div>
    ),
    {
      ...size,
      fonts: sarabunData
        ? [{ name: 'Sarabun', data: sarabunData, style: 'normal', weight: 400 }]
        : [],
    }
  )
}
