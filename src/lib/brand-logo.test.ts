import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { encodeLogo, LOGO_PX, LOGO_UPLOAD_MAX_BYTES } from './brand-logo'

const square = (format: 'png' | 'jpeg', size = 200) =>
  sharp({ create: { width: size, height: size, channels: 3, background: '#003d79' } })[format]().toBuffer()

describe('encodeLogo', () => {
  it('redraws any raster upload as a small WebP', async () => {
    const result = await encodeLogo(await square('png'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const bytes = Buffer.from(result.base64, 'base64')
    const meta = await sharp(bytes).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([LOGO_PX, LOGO_PX])
    expect(bytes.byteLength).toBeLessThan(16 * 1024)
  })

  it('accepts a JPEG too', async () => {
    expect((await encodeLogo(await square('jpeg'))).ok).toBe(true)
  })

  it('refuses SVG, even though it renders as a picture', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')
    const result = await encodeLogo(svg)
    expect(result).toEqual({ ok: false, reason: 'Pakai gambar PNG, JPEG, WebP, atau GIF.' })
  })

  it('refuses something that is not an image at all', async () => {
    const result = await encodeLogo(Buffer.from('MZ\x90\x00 definitely not a picture'))
    expect(result.ok).toBe(false)
  })

  it('refuses empty and oversized uploads before decoding them', async () => {
    expect((await encodeLogo(new Uint8Array())).ok).toBe(false)
    expect((await encodeLogo(new Uint8Array(LOGO_UPLOAD_MAX_BYTES + 1))).ok).toBe(false)
  })
})
