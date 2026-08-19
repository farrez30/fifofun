/**
 * Money is stored as bigint "sen" (1 sen = Rp0,01) everywhere in this app.
 *
 * Rupiah has no circulating sub-unit, but Mandiri statements carry two decimals
 * ("113.458,07"), and the import reconciles by asserting an exact running-balance
 * chain. Floats break that chain, so nothing here ever converts through Number.
 */

const ID_SHAPE = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/
const EN_SHAPE = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/

/** Strips the currency prefix and sign, returning the bare numeric text. */
function peel(raw: string): { negative: boolean; body: string } {
  let s = raw.replace(/\u00a0/g, ' ').trim()
  if (s === '') throw new Error('Cannot parse an empty amount')

  let negative = false
  // A leading minus may sit before or after the currency symbol: "-Rp1.000" / "Rp -1.000".
  s = s.replace(/^-\s*/, () => ((negative = true), ''))
  s = s.replace(/^(?:IDR|Rp)\.?\s*/i, '')
  s = s.replace(/^-\s*/, () => ((negative = true), ''))

  return { negative, body: s.trim() }
}

function assemble(intDigits: string, decDigits: string | undefined, negative: boolean): bigint {
  // "5" means 50 sen, "05" means 5 sen. Pad right, never left.
  const sen = BigInt(intDigits) * 100n + BigInt((decDigits ?? '').padEnd(2, '0') || '0')
  return negative ? -sen : sen
}

/** Parses Indonesian-formatted money ("1.552.574,00") into sen. Throws on anything else. */
export function parseIdAmount(raw: string): bigint {
  const { negative, body } = peel(raw)
  const m = ID_SHAPE.exec(body)
  if (!m) throw new Error(`Not an id-ID amount: ${JSON.stringify(raw)}`)
  return assemble(m[1].replace(/\./g, ''), m[2], negative)
}

/** Parses US-formatted money ("1,053,706.00") into sen, used by the rekening koran PDF. */
export function parseEnAmount(raw: string): bigint {
  const { negative, body } = peel(raw)
  const m = EN_SHAPE.exec(body)
  if (!m) throw new Error(`Not an en-US amount: ${JSON.stringify(raw)}`)
  return assemble(m[1].replace(/,/g, ''), m[2], negative)
}

function splitSign(sen: bigint): { sign: string; abs: bigint } {
  return sen < 0n ? { sign: '-', abs: -sen } : { sign: '', abs: sen }
}

const GROUPED = new Intl.NumberFormat('id-ID', { useGrouping: true, maximumFractionDigits: 0 })

export interface FormatIdrOptions {
  /** Show the two-decimal sen part. Off by default; daily amounts read better without it. */
  decimals?: boolean
  /** Prefix with "Rp". Turn off inside a column that already says Rupiah in its header. */
  symbol?: boolean
}

/** Formats sen for display, e.g. 155257400n -> "Rp1.552.574". */
export function formatIdr(sen: bigint, options: FormatIdrOptions = {}): string {
  const { decimals = false, symbol = true } = options
  const { sign, abs } = splitSign(sen)
  const prefix = `${sign}${symbol ? 'Rp' : ''}`

  if (decimals) {
    const frac = (abs % 100n).toString().padStart(2, '0')
    return `${prefix}${GROUPED.format(abs / 100n)},${frac}`
  }
  // Round half away from zero: adding 50 before flooring does that on the absolute value.
  return `${prefix}${GROUPED.format((abs + 50n) / 100n)}`
}

const COMPACT_STEPS = [
  { suffix: 'mi', rupiah: 1_000_000_000n },
  { suffix: 'jt', rupiah: 1_000_000n },
  { suffix: 'rb', rupiah: 1_000n },
] as const

/** Shortens sen for chart labels, e.g. 486319572n -> "Rp4,9jt". */
export function formatIdrCompact(sen: bigint): string {
  const { sign, abs } = splitSign(sen)
  const rupiah = (abs + 50n) / 100n

  for (let i = 0; i < COMPACT_STEPS.length; i++) {
    if (rupiah < COMPACT_STEPS[i].rupiah) continue

    // One decimal place, rounded half up, computed in bigint so large values stay exact.
    let step = COMPACT_STEPS[i]
    let tenths = (rupiah * 10n + step.rupiah / 2n) / step.rupiah
    // Rounding can push a value over the next unit (999,96jt -> 1000,0jt); promote it.
    if (tenths >= 10_000n && i > 0) {
      step = COMPACT_STEPS[i - 1]
      tenths = (rupiah * 10n + step.rupiah / 2n) / step.rupiah
    }

    const whole = tenths / 10n
    const rest = tenths % 10n
    const value = rest === 0n ? `${whole}` : `${whole},${rest}`
    return `${sign}Rp${value}${step.suffix}`
  }
  return `${sign}Rp${GROUPED.format(rupiah)}`
}

export function addSen(a: bigint, b: bigint): bigint {
  return a + b
}

export function sumSen(values: Iterable<bigint>): bigint {
  let total = 0n
  for (const value of values) total += value
  return total
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Converts sen to a Number of rupiah, for chart scales and other display maths only.
 * Never feed the result back into a stored amount.
 */
export function senToRupiahNumber(sen: bigint): number {
  const rupiah = sen / 100n
  if (rupiah > MAX_SAFE || rupiah < -MAX_SAFE) {
    throw new Error(`Amount too large to convert safely to Number: ${sen} sen`)
  }
  return Number(rupiah)
}
