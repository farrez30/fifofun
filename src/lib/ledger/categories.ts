import type { CashflowType, LedgerEntry } from './types'
import { monthKeyOf, monthKeyToString } from './monthly'

/**
 * Rolls the ledger up by month and category.
 *
 * This is the bridge between what actually happened and the planning modules:
 * a lifestyle profile derived from thirteen months of real statements is worth
 * more than any template, and this is what turns one into the other.
 */

export interface MonthCategoryTotals {
  month: string
  byCategory: Record<string, bigint>
}

export interface RollupOptions {
  /** Which cashflow types to include. Spending and bills by default. */
  cashflows?: CashflowType[]
  /** Where an entry has no category. */
  uncategorisedLabel?: string
  /**
   * Whether to include entries marked as pass-through. Off by default: money
   * that arrived and left the same day was never really income or spending, and
   * counting it inflates both sides.
   */
  includePassThrough?: boolean
}

type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

const DEFAULT_CASHFLOWS: CashflowType[] = ['spending', 'bills']

export function rollUpByMonthAndCategory(
  entries: Entry[],
  options: RollupOptions = {},
): MonthCategoryTotals[] {
  const wanted = new Set(options.cashflows ?? DEFAULT_CASHFLOWS)
  const fallback = options.uncategorisedLabel ?? 'Belum berkategori'

  const months = new Map<string, Record<string, bigint>>()

  for (const entry of entries) {
    if (!wanted.has(entry.cashflow)) continue
    if (entry.isPassThrough && !options.includePassThrough) continue

    const month = monthKeyToString(monthKeyOf(entry.occurredAt))
    const category = entry.categoryName ?? fallback

    const bucket = months.get(month) ?? {}
    bucket[category] = (bucket[category] ?? 0n) + entry.amount
    months.set(month, bucket)
  }

  // Chronological, because every consumer treats the tail as "recently".
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byCategory]) => ({ month, byCategory }))
}

/** Totals for a single period, largest first. */
export function totalsByCategory(
  entries: Entry[],
  options: RollupOptions = {},
): { category: string; amount: bigint }[] {
  const combined: Record<string, bigint> = {}

  for (const month of rollUpByMonthAndCategory(entries, options)) {
    for (const [category, amount] of Object.entries(month.byCategory)) {
      combined[category] = (combined[category] ?? 0n) + amount
    }
  }

  return Object.entries(combined)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
}

/** Totals by cashflow type, used to feed the Sankey and the health ratios. */
export function totalsByCashflow(entries: Entry[]): Record<CashflowType, bigint> {
  const totals = {} as Record<CashflowType, bigint>

  for (const entry of entries) {
    if (entry.isPassThrough) continue
    totals[entry.cashflow] = (totals[entry.cashflow] ?? 0n) + entry.amount
  }

  return totals
}
