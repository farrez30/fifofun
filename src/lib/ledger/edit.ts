import { directionOf } from './direction'
import type { CashflowType, EntrySource } from './types'

/**
 * What may be changed about a transaction, and what a split turns into.
 *
 * The rule that shapes everything here: a row that came from the bank is a
 * fact, and a row somebody typed is an opinion. The amount, the date and the
 * accounts of a statement row are what the reconciliation checks itself
 * against, so they cannot be edited at all; the category, the note and whether
 * it was money held for somebody else are decisions about that fact, and
 * those can always be changed.
 *
 * Splitting is the exception that proves it. One receipt paid at one shop can
 * be four categories, and the split keeps the original amount intact by
 * dividing it into children that add up to it exactly, rather than by editing
 * the parent into something the bank never said.
 */

export const SOURCE_LABELS: Record<EntrySource, string> = {
  xlsx: 'e-Statement',
  email: 'Email Livin',
  manual: 'Dicatat manual',
  telegram: 'Bot Telegram',
}

/** Whether the row is the bank's word rather than somebody's. */
export function isBankFact(source: EntrySource): boolean {
  return source === 'xlsx' || source === 'email'
}

export interface Editable {
  category: boolean
  amount: boolean
  when: boolean
  accounts: boolean
  split: boolean
  remove: boolean
  passThrough: boolean
}

export function editableFields({
  source,
  cashflow,
}: {
  source: EntrySource
  cashflow: CashflowType
}): Editable {
  const fact = isBankFact(source)
  // Which accounts a transfer moves money between is the whole content of the
  // row. There is no category to choose and nothing to divide into parts.
  const transfer = cashflow === 'transfer'

  return {
    category: !transfer,
    amount: !fact,
    when: !fact,
    accounts: !fact,
    split: !transfer,
    remove: !fact,
    passThrough: true,
  }
}

/** The categories that can be filed against a row without flipping its sides. */
export function compatibleCategories<T extends { cashflow: CashflowType }>(
  categories: T[],
  cashflow: CashflowType,
): T[] {
  const wanted = directionOf(cashflow)
  return categories.filter((category) => directionOf(category.cashflow) === wanted)
}

export const SPLIT_MIN = 2
export const SPLIT_MAX = 6

export interface SplitPart {
  amount: bigint
  categoryId: string
  description: string
}

export interface SplitParent {
  id: string
  description: string
  amount: bigint
}

export interface SplitChild {
  amount: bigint
  categoryId: string
  description: string
  dedupeKey: string
}

export type SplitPlan =
  | { ok: true; children: SplitChild[] }
  | { ok: false; problem: 'count' | 'zero' | 'sum'; difference: bigint }

/**
 * The children a split produces, or the reason it cannot happen.
 *
 * The parts must add up to the parent exactly. Anything else would either
 * invent money or lose it, and the running balance the import reconciles
 * against is built from these rows.
 *
 * Each child carries a dedupe key derived from the parent, so splitting the
 * same row twice writes over the same children rather than accumulating a new
 * set beside the old one. Numbered from one because the key shows up in
 * support conversations, and a part zero is not a thing anybody says.
 */
export function planSplit(parent: SplitParent, parts: SplitPart[]): SplitPlan {
  if (parts.length < SPLIT_MIN || parts.length > SPLIT_MAX) {
    return { ok: false, problem: 'count', difference: 0n }
  }
  if (parts.some((part) => part.amount <= 0n)) {
    return { ok: false, problem: 'zero', difference: 0n }
  }

  const total = parts.reduce((sum, part) => sum + part.amount, 0n)
  if (total !== parent.amount) {
    return { ok: false, problem: 'sum', difference: parent.amount - total }
  }

  return {
    ok: true,
    children: parts.map((part, index) => ({
      amount: part.amount,
      categoryId: part.categoryId,
      // A part nobody named is still that purchase, so the parent's own
      // description is a better answer than an empty cell in the ledger.
      description: part.description.trim() || parent.description,
      dedupeKey: `split:${parent.id}:${index + 1}`,
    })),
  }
}

/** What is left of the parent once these parts are accounted for. */
export function splitRemainder(parent: bigint, parts: { amount: bigint }[]): bigint {
  return parent - parts.reduce((sum, part) => sum + part.amount, 0n)
}

export type SplitBlocker =
  | { kind: 'remainder'; amount: bigint }
  | { kind: 'excess'; amount: bigint }
  | { kind: 'zero'; part: number }
  | { kind: 'category'; part: number }
  | null

/**
 * Why the split cannot be submitted yet, or null when it can.
 *
 * The form reported only the remainder, so two parts that summed exactly with
 * a category left unset read "Pas" beside a submit button that refused to work
 * and gave no reason. A disabled control with no stated cause is a dead end,
 * and the cause is knowable, so it is returned rather than guessed at.
 *
 * Ordered by what a person fixes first: the arithmetic, then the empty
 * amounts, then the missing categories.
 */
export function splitBlocker(
  parent: bigint,
  parts: { amount: bigint; categoryId: string }[],
): SplitBlocker {
  const remainder = splitRemainder(parent, parts)
  if (remainder > 0n) return { kind: 'remainder', amount: remainder }
  if (remainder < 0n) return { kind: 'excess', amount: -remainder }

  const zero = parts.findIndex((part) => part.amount <= 0n)
  if (zero !== -1) return { kind: 'zero', part: zero + 1 }

  const missing = parts.findIndex((part) => part.categoryId === '')
  if (missing !== -1) return { kind: 'category', part: missing + 1 }

  return null
}
