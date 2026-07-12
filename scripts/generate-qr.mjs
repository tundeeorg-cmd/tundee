/**
 * Generates QR code images for TunDee landing page channels.
 * Run: node scripts/generate-qr.mjs
 *
 * Output: public/qr-{channel}.png
 * Each URL encodes ?src={channel} so signups are tracked by acquisition channel.
 */

import QRCode from 'qrcode'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

const CHANNELS = [
  { name: 'school',  url: 'https://tundee.org/students?src=school'  },
  { name: 'line',    url: 'https://tundee.org/students?src=line'    },
  { name: 'fb',      url: 'https://tundee.org/students?src=fb'      },
  { name: 'tiktok',  url: 'https://tundee.org/students?src=tiktok'  },
]

const QR_OPTIONS = {
  type:           'png',
  width:          512,
  margin:         2,
  color: {
    dark:  '#0A2342',   // TunDee navy
    light: '#FFFFFF',
  },
  errorCorrectionLevel: 'H',   // High — survives partial damage on printed handouts
}

for (const ch of CHANNELS) {
  const outPath = join(publicDir, `qr-${ch.name}.png`)
  await QRCode.toFile(outPath, ch.url, QR_OPTIONS)
  console.log(`✓  public/qr-${ch.name}.png  →  ${ch.url}`)
}

console.log('\nDone. Drop public/qr-school.png into the printed handout.')
