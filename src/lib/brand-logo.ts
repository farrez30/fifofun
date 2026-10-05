import sharp, { type Sharp } from 'sharp'

/**
 * An uploaded account icon, turned into something safe to keep and serve.
 *
 * The bytes a browser sends are never stored. Every upload is decoded and
 * drawn again as a 64px WebP (three device pixels for the 20px it is shown
 * at), so whatever rode along in the original file, metadata, a second image,
 * a polyglot payload, does not survive. SVG is refused rather than rasterised:
 * it is a document, not a picture, and nothing here needs a vector.
 */

export const LOGO_PX = 64
/** What a person may upload. A phone screenshot of an app icon fits easily. */
export const LOGO_UPLOAD_MAX_BYTES = 512 * 1024
/** What may be stored; the database check allows the same, in base64. */
export const LOGO_STORED_MAX_BYTES = 16 * 1024

const RASTER = new Set(['png', 'jpeg', 'webp', 'gif'])

export type LogoResult = { ok: true; base64: string } | { ok: false; reason: string }

export async function encodeLogo(input: Uint8Array): Promise<LogoResult> {
  if (input.byteLength === 0) return { ok: false, reason: 'Berkasnya kosong.' }
  if (input.byteLength > LOGO_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: 'Logonya terlalu besar. Pakai gambar di bawah 512 KB.' }
  }

  let image: Sharp
  let format: string | undefined
  try {
    // A small icon never needs more than 16 megapixels; a decompression bomb does.
    image = sharp(input, { limitInputPixels: 4096 * 4096, animated: false })
    format = (await image.metadata()).format
  } catch {
    return { ok: false, reason: 'Berkas itu bukan gambar yang bisa dibaca.' }
  }
  if (!format || !RASTER.has(format)) {
    return { ok: false, reason: 'Pakai gambar PNG, JPEG, WebP, atau GIF.' }
  }

  const output = await image
    .resize(LOGO_PX, LOGO_PX, { fit: 'cover' })
    .webp({ quality: 90 })
    .toBuffer()
  if (output.byteLength > LOGO_STORED_MAX_BYTES) {
    return { ok: false, reason: 'Logonya terlalu rumit untuk disimpan kecil. Coba gambar yang lebih sederhana.' }
  }
  return { ok: true, base64: output.toString('base64') }
}
