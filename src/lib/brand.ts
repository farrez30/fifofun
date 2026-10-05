/**
 * An institution's own colour, as it fills a picked account chip.
 *
 * Unlike a category hue this is not identity the app invents: it is the bank's
 * colour, stored as the bank prints it, so it cannot be bent per theme. What
 * can be chosen is the ink on top. Whichever of black and white contrasts more
 * with a colour always clears 4.5:1 (the worst case, a mid grey, still gives
 * 4.58:1), so a picked chip passes AA whatever colour the household types in.
 */

const HEX = /^#?([0-9a-f]{6})$/i

/** `#rrggbb` in lowercase, the one spelling the database accepts, or null. */
export function normaliseHex(input: string | null | undefined): string | null {
  const match = HEX.exec((input ?? '').trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const INK_LIGHT = '#ffffff'
export const INK_DARK = '#000000'

/** The text colour for something drawn on `hex`. */
export function inkOn(hex: string): typeof INK_LIGHT | typeof INK_DARK {
  return contrast(hex, INK_LIGHT) >= contrast(hex, INK_DARK) ? INK_LIGHT : INK_DARK
}

/**
 * Where the colour picker starts for an account that has no colour yet. A
 * colour input cannot hold a token or be empty, so this names the system grey
 * once rather than leaving a stray hex in the form.
 */
export const PICKER_START = '#8e8e93'

/** Where an account's icon is served; the hash makes the URL change with the icon. */
export function logoUrl(accountId: string, logoHash: string | null): string | null {
  return logoHash ? `/akun/${accountId}/logo?v=${logoHash.slice(0, 12)}` : null
}
