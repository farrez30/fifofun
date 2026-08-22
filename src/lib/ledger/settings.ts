import { FUND_CASHFLOWS } from './funds'
import { DEFAULT_CATEGORY_BY_KIND } from './seed-data'
import type { CashflowType } from './types'

/**
 * The rules behind managing accounts and categories.
 *
 * Three of them exist because the rest of the app reaches for a row by
 * something other than its id. The importer and the Telegram bot look accounts
 * up by a fixed key, so a key can only be held by one account at a time and
 * losing it breaks an import rather than a label. A handful of category names
 * are looked up literally by the importer, so renaming one of those is allowed
 * but has a consequence worth saying out loud. And savings pots come in pairs,
 * one for money going in and one for money coming back out, so renaming or
 * archiving one without the other leaves half a pot behind.
 */

/** The handles the importer and the bot use, in the order accounts are listed. */
export const ACCOUNT_KEYS = [
  'mandiri',
  'cash',
  'gopay',
  'dana',
  'shopeepay',
  'ovo',
  'linkaja',
  'emoney',
] as const

export type AccountKey = (typeof ACCOUNT_KEYS)[number]

/** What actually breaks if a key moves, said in terms of what a person does. */
export const ACCOUNT_KEY_LABELS: Record<AccountKey, string> = {
  mandiri: 'e-statement Mandiri',
  cash: 'tarik tunai ATM dan bot Telegram',
  gopay: 'top-up GoPay',
  dana: 'top-up DANA',
  shopeepay: 'top-up ShopeePay',
  ovo: 'top-up OVO',
  linkaja: 'top-up LinkAja',
  emoney: 'top-up e-Money',
}

export interface IdentifiersParsed {
  ok: boolean
  values: string[]
  /** Why the list was refused, when it was. */
  reason?: string
}

const IDENTIFIER = /^\+?\d{6,20}$/
const MAX_IDENTIFIERS = 10

/**
 * The phone numbers behind a household's own e-wallets.
 *
 * They decide whether a payment to GoPay is a top-up of your own wallet or
 * money sent to somebody else, which is the difference between a transfer and
 * a spend, so a typo here quietly inflates a month. Refused rather than
 * cleaned: silently dropping the half of a number somebody mistyped would file
 * their next top-up as spending and say nothing.
 */
export function parseIdentifiers(raw: string): IdentifiersParsed {
  const parts = raw
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')

  const bad = parts.find((part) => !IDENTIFIER.test(part))
  if (bad) {
    return {
      ok: false,
      values: [],
      reason: `"${bad}" bukan nomor telepon. Tulis angkanya saja, boleh diawali +.`,
    }
  }
  if (parts.length > MAX_IDENTIFIERS) {
    return { ok: false, values: [], reason: `Paling banyak ${MAX_IDENTIFIERS} nomor.` }
  }

  return { ok: true, values: [...new Set(parts)] }
}

/**
 * The other half of a pot, if the cashflow has one.
 *
 * Money going into savings and money coming back out are two rows with the
 * same name under two cashflow types, which is how the funds panel pairs them.
 * A rename that moved only one of them would leave a pot whose withdrawals
 * belong to a pot that no longer exists.
 */
export function twinsOf(cashflow: CashflowType): CashflowType[] {
  if ((FUND_CASHFLOWS as readonly string[]).includes(cashflow)) return ['from_asset']
  if (cashflow === 'from_asset') return [...FUND_CASHFLOWS]
  if (cashflow === 'receivable_new') return ['receivable_settled']
  if (cashflow === 'receivable_settled') return ['receivable_new']
  return []
}

/** Every category name the importer looks for literally. */
export const LOOKED_UP_NAMES = [
  ...new Set([...Object.values(DEFAULT_CATEGORY_BY_KIND), 'Penyesuaian Income', 'Penyesuaian Spending']),
].sort((a, b) => a.localeCompare(b, 'id'))

export function isLookedUpByName(name: string): boolean {
  return LOOKED_UP_NAMES.includes(name)
}

export interface Sortable {
  id: string
  sortOrder: number
}

export interface Reorder {
  id: string
  sortOrder: number
}

/**
 * One row swapped with its neighbour, as the smallest set of writes that does it.
 *
 * Renumbering the whole list would be simpler to write and would send fifty
 * updates through PostgREST to move one row by one place. Two rows change; the
 * rest are already in the right order relative to each other.
 *
 * The positions are recomputed from the list order rather than from the stored
 * numbers, because a household migrated from before `sort_order` existed has
 * fifty rows all numbered zero, and swapping two zeroes changes nothing.
 */
export function planReorder(
  rows: Sortable[],
  id: string,
  direction: 'up' | 'down',
): Reorder[] {
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return []

  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= rows.length) return []

  return [
    { id: rows[index].id, sortOrder: target + 1 },
    { id: rows[target].id, sortOrder: index + 1 },
  ]
}
