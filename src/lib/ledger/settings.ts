import { FUND_CASHFLOWS } from './funds'
import { DEFAULT_CATEGORY_BY_KIND } from './seed-data'
import { CASHFLOW_LABELS, type CashflowType } from './types'

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

export interface Grouped {
  id: string
  parentId: string | null
}

/**
 * The categories something else rolls up into.
 *
 * A group holds nothing itself. Letting one take a transaction would split a
 * figure between the group and the things inside it, so the same money would
 * be both counted once in the group's own row and again in the group's total,
 * and no reader could tell which. Every place that writes a category asks this
 * first, and the dropdowns never offer one.
 */
export function groupIds(rows: Grouped[]): Set<string> {
  const groups = new Set<string>()
  for (const row of rows) if (row.parentId) groups.add(row.parentId)
  return groups
}

/** Whether this category is a group, given the whole list it came from. */
export function isGroup(rows: Grouped[], id: string): boolean {
  return rows.some((row) => row.parentId === id)
}

export interface Selectable extends Grouped {
  name: string
  cashflow: CashflowType
}

export interface OptionGroup<T> {
  label: string
  options: T[]
}

/**
 * The categories a person may pick, arranged under the heading they belong to.
 *
 * Groups are dropped from the list and become the headings instead, which is
 * the only arrangement `<optgroup>` allows: it does not nest, so a heading is
 * either the group or the cashflow, and the group is the more useful of the
 * two once there is one. Anything without a group keeps its cashflow heading,
 * the way the whole list used to read.
 *
 * Order follows the list as it arrives, which is the household's own ordering,
 * so a heading appears where its first member does.
 */
export function optionGroups<T extends Selectable>(categories: T[]): OptionGroup<T>[] {
  const groups = groupIds(categories)
  const nameById = new Map(categories.map((category) => [category.id, category.name]))
  const ordered: OptionGroup<T>[] = []
  const byLabel = new Map<string, OptionGroup<T>>()

  for (const category of categories) {
    if (groups.has(category.id)) continue

    const label = category.parentId
      ? (nameById.get(category.parentId) ?? CASHFLOW_LABELS[category.cashflow])
      : CASHFLOW_LABELS[category.cashflow]

    const existing = byLabel.get(label)
    if (existing) {
      existing.options.push(category)
      continue
    }

    const group = { label, options: [category] }
    byLabel.set(label, group)
    ordered.push(group)
  }

  return ordered
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
 * One stretch of the list put in a new order, as the smallest set of writes
 * that does it.
 *
 * A drag reorders one run of siblings (the accounts, or the categories under
 * one heading). Those rows keep the places in the whole list they already
 * held and are dealt back into them in the new order, so nothing outside the
 * run moves and only the rows whose number actually changes are written.
 *
 * When the run's numbers collide the positions are recomputed from the list
 * order instead, because a household migrated from before `sort_order`
 * existed has fifty rows all numbered zero, and reshuffling zeroes changes
 * nothing.
 *
 * Null when `ids` is not exactly a reordering of rows in the list: a repeated
 * id, or one that is not there, means the screen and the database disagree,
 * and guessing which one is right is how a list ends up scrambled.
 */
export function planArrange(rows: Sortable[], ids: string[]): Reorder[] | null {
  const order = arrangeRows(rows, ids)
  if (order === null) return null
  const stored = new Map(rows.map((row) => [row.id, row.sortOrder]))

  // The run already owns distinct numbers: deal those back out and nothing
  // else is touched. Years of moves leave the numbers sparse (0, 29, 31, 35),
  // and renumbering all seventy-odd categories to move one took ten seconds.
  const numbers = rows.filter((row) => ids.includes(row.id)).map((row) => row.sortOrder)
  if (new Set(numbers).size === numbers.length) {
    return ids
      .map((id, index) => ({ id, sortOrder: numbers[index] }))
      .filter((step) => stored.get(step.id) !== step.sortOrder)
  }

  return order
    .map((row, index) => ({ id: row.id, sortOrder: index + 1 }))
    .filter((step) => stored.get(step.id) !== step.sortOrder)
}

/**
 * The whole list with one run dealt back into its own places in a new order.
 * The screen uses this to show a drop before the server has answered, so
 * what it shows and what gets written cannot disagree.
 */
export function arrangeRows<T extends { id: string }>(rows: T[], ids: string[]): T[] | null {
  if (new Set(ids).size !== ids.length) return null
  const byId = new Map(rows.map((row) => [row.id, row]))
  const slots = rows.flatMap((row, index) => (ids.includes(row.id) ? [index] : []))
  if (slots.length !== ids.length) return null

  const order = [...rows]
  slots.forEach((slot, step) => {
    order[slot] = byId.get(ids[step])!
  })
  return order
}
