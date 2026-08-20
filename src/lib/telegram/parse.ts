import type { CashflowType } from '@/lib/ledger/types'

/**
 * Quick entry from a chat message.
 *
 * The point of this channel is cash, which no bank statement can ever see. It
 * has to be faster than opening the app or it will not get used, so the grammar
 * is what someone would type anyway: an amount and a few words.
 *
 *   50rb makan siang        spending 50.000, note "makan siang"
 *   12.500 parkir           spending 12.500
 *   +9jt gaji               income 9.000.000
 *   masuk 500rb refund      income 500.000
 *   1,5jt bensin            spending 1.500.000
 *
 * Nothing here guesses at an amount it cannot read. A message that does not
 * parse is answered with what was expected rather than recorded as a zero, since
 * a silently wrong entry is worse than a rejected one in a ledger whose whole
 * purpose is to be right.
 */

/** Suffix multipliers, in whole Rupiah. Longest first so `jt` beats `j`. */
const MULTIPLIERS: { suffix: string; times: bigint }[] = [
  { suffix: 'miliar', times: 1_000_000_000n },
  { suffix: 'milyar', times: 1_000_000_000n },
  { suffix: 'juta', times: 1_000_000n },
  { suffix: 'ribu', times: 1_000n },
  { suffix: 'jt', times: 1_000_000n },
  { suffix: 'rb', times: 1_000n },
  { suffix: 'm', times: 1_000_000_000n },
  { suffix: 'k', times: 1_000n },
]

/** Words that state the direction explicitly, before any sign is considered. */
const DIRECTION_WORDS: { match: RegExp; cashflow: CashflowType }[] = [
  { match: /^(masuk|terima|diterima|dapat|gajian)\b/i, cashflow: 'income' },
  { match: /^(keluar|bayar|beli|belanja)\b/i, cashflow: 'spending' },
  { match: /^(nabung|tabung|invest|investasi)\b/i, cashflow: 'invest_savings' },
  { match: /^(tagihan|bill)\b/i, cashflow: 'bills' },
  { match: /^(cicilan|angsuran)\b/i, cashflow: 'debt_payment' },
  { match: /^(piutang|utangin|talangin)\b/i, cashflow: 'receivable_new' },
]

export interface QuickEntry {
  amount: bigint
  cashflow: CashflowType
  /** Everything left after the amount and direction word were consumed. */
  note: string
  /** Matched against the household's categories by the caller. */
  categoryHint: string | null
}

export interface ParseFailure {
  reason: 'no-amount' | 'zero-amount' | 'empty'
  /** Shown back to the user, so a failed message teaches the grammar. */
  help: string
}

const HELP =
  'Tulis nominal lalu keterangannya. Contoh: "50rb makan siang", "12.500 parkir", ' +
  '"+9jt gaji", "nabung 1jt". Awalan + berarti pemasukan, dan rb, jt, k, m dikenali sebagai pengali.'

/**
 * Reads an amount with an optional multiplier suffix.
 *
 * With a suffix, the number is Indonesian decimal notation: a comma is the
 * decimal point and a full stop groups thousands, so `1,5jt` is one and a half
 * million and `1.500rb` is the same figure written the other way. Without a
 * suffix it is a plain Indonesian integer, so `12.500` is twelve and a half
 * thousand rather than twelve.
 *
 * All of it stays in `bigint`. Reading `1,5jt` through a float and multiplying
 * would be exact today and drift the moment the numbers get larger.
 */
export function parseQuickAmount(raw: string): bigint | null {
  const text = raw.trim().toLowerCase()

  const matched = MULTIPLIERS.find((entry) => text.endsWith(entry.suffix))
  const digits = matched ? text.slice(0, -matched.suffix.length).trim() : text
  if (!digits) return null

  if (!matched) {
    // No suffix: an Indonesian integer, where a full stop groups thousands.
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(digits)) return null
    return BigInt(digits.replace(/\./g, '')) * 100n
  }

  const shaped = digits.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,3}))?$/)
  if (!shaped) return null

  const whole = BigInt(shaped[1].replace(/\./g, ''))
  const fractionDigits = shaped[2] ?? ''
  const fraction = fractionDigits ? BigInt(fractionDigits) : 0n
  const scale = 10n ** BigInt(fractionDigits.length)

  // Rupiah first, then to sen, so a fractional multiplier stays exact.
  const rupiah = whole * matched.times + (fraction * matched.times) / scale
  return rupiah * 100n
}

export function parseQuickEntry(message: string): QuickEntry | ParseFailure {
  const text = message.trim().replace(/\s+/g, ' ')
  if (!text) return { reason: 'empty', help: HELP }

  let rest = text
  let cashflow: CashflowType | null = null

  const directionWord = DIRECTION_WORDS.find((entry) => entry.match.test(rest))
  if (directionWord) {
    cashflow = directionWord.cashflow
    rest = rest.replace(directionWord.match, '').trim()
  }

  // A sign binds tighter than a word, because someone who typed one meant it.
  const signed = rest.match(/^([+-])\s*/)
  if (signed) {
    cashflow = signed[1] === '+' ? 'income' : 'spending'
    rest = rest.slice(signed[0].length)
  }

  const [amountToken, ...noteWords] = rest.split(' ')
  const amount = parseQuickAmount(amountToken ?? '')

  if (amount === null) return { reason: 'no-amount', help: HELP }
  if (amount === 0n) {
    return { reason: 'zero-amount', help: 'Nominal nol tidak dicatat. ' + HELP }
  }

  const note = noteWords.join(' ').trim()

  return {
    amount,
    cashflow: cashflow ?? 'spending',
    note,
    // The first word is the likeliest category; the caller matches it against
    // the household's own list rather than a fixed one defined here.
    categoryHint: noteWords[0] ?? null,
  }
}

export function isFailure(result: QuickEntry | ParseFailure): result is ParseFailure {
  return 'reason' in result
}
