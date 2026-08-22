import { formatIdr, parseIdAmount } from './index'

/**
 * What a money field does with keystrokes.
 *
 * Kept out of the component so it can be tested without a browser. Everything
 * here works on strings of digits rather than on numbers, because the one
 * place the old input went through `Number()` was its display path, and a
 * twenty-digit paste would have shown one thing while storing another.
 */

export interface TypedAmount {
  /** What the field should show: grouped, with the comma the user is typing. */
  text: string
  sen: bigint
}

export interface TypedOptions {
  /** Accept a comma and up to two decimals. Off by default: nobody budgets in sen. */
  decimals?: boolean
}

/** "1234567" becomes "1.234.567". Leading zeros go, except a lone zero. */
export function groupDigits(digits: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, '')
  let grouped = ''
  for (let end = trimmed.length; end > 0; end -= 3) {
    const chunk = trimmed.slice(Math.max(0, end - 3), end)
    grouped = grouped === '' ? chunk : `${chunk}.${grouped}`
  }
  return grouped
}

/**
 * Reads whatever was typed or pasted and returns the text to show and the sen
 * it means. Separators are stripped rather than rejected, so `Rp1.552.574`
 * pasted from a statement survives. A trailing comma is kept in the text while
 * it is being typed and ignored in the amount.
 */
export function normaliseTyped(raw: string, options: TypedOptions = {}): TypedAmount {
  const decimals = options.decimals ?? false
  let whole = ''
  let fraction = ''
  let comma = false

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (comma) {
        if (fraction.length < 2) fraction += char
      } else {
        whole += char
      }
    } else if (char === ',' && decimals && !comma) {
      comma = true
    }
  }

  if (whole === '' && !comma) return { text: '', sen: 0n }

  const grouped = groupDigits(whole === '' ? '0' : whole)
  const text = comma ? `${grouped},${fraction}` : grouped
  // parseIdAmount is the only money parser in the app, so the field agrees
  // with every statement import about what a string of digits means.
  const sen = parseIdAmount(comma && fraction === '' ? grouped : text)
  return { text, sen }
}

/** The text a field shows for a stored amount. Empty for nothing, never "0". */
export function toInputText(sen: bigint, decimals = false): string {
  return sen === 0n ? '' : formatIdr(sen, { symbol: false, decimals })
}

export interface TypedShare {
  /** Up to three digits, a comma and one decimal, as typed. */
  text: string
  /** Basis points, so 12,5% is 1250. Null when nothing was typed. */
  bp: number | null
}

/** A percentage with one decimal, read into basis points without a float. */
export function normaliseShare(raw: string): TypedShare {
  let whole = ''
  let fraction = ''
  let comma = false

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (comma) {
        if (fraction.length < 1) fraction += char
      } else if (whole.length < 3) {
        whole += char
      }
    } else if ((char === ',' || char === '.') && !comma) {
      comma = true
    }
  }

  if (whole === '' && fraction === '') return { text: comma ? ',' : '', bp: null }

  const wholeDigits = whole === '' ? '0' : whole.replace(/^0+(?=\d)/, '')
  const text = comma ? `${wholeDigits},${fraction}` : wholeDigits
  const bp = Number(wholeDigits) * 100 + (fraction === '' ? 0 : Number(fraction) * 10)
  return { text, bp }
}
