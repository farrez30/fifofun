import { ImageResponse } from 'next/og'

/**
 * The card shown when a link to the app is pasted anywhere.
 *
 * It carries the same mark as the icon rather than a screenshot, because a
 * screenshot of this app is a screenshot of somebody's balances. The flow shape
 * is drawn with plain boxes: `ImageResponse` supports a subset of CSS and no
 * SVG paths, so the ribbons of the real mark become three stepped blocks that
 * read the same way at card size.
 */

export const alt = 'FiFoFun, perencana keuangan pribadi'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INK = '#1f1d1b'
const PAPER = '#e8e5e0'
const MUTED = '#a8a29c'
const TEAL = '#4fbfd4'
const GREEN = '#3f9e88'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: INK,
          padding: 80,
          gap: 64,
        }}
      >
        {/* One flow in, two out. The same idea as the app icon. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 36, height: 260, backgroundColor: PAPER, borderRadius: 6 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 150, height: 126, backgroundColor: TEAL, borderRadius: 6 }} />
            <div style={{ width: 150, height: 126, backgroundColor: GREEN, borderRadius: 6 }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, letterSpacing: 8, color: MUTED }}>FIFOFUN</div>
          {/* Satori requires an explicit display on any element with more than
              one child, and a line break counts as one, so the headline is two
              stacked elements rather than one with a <br />. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 62,
              color: PAPER,
              marginTop: 18,
              lineHeight: 1.15,
            }}
          >
            <div>Perencana keuangan</div>
            <div>yang memeriksa catatanmu</div>
          </div>
          <div style={{ fontSize: 28, color: MUTED, marginTop: 26 }}>
            Setiap baris dicocokkan dengan saldo yang dicetak bank
          </div>
        </div>
      </div>
    ),
    size,
  )
}
