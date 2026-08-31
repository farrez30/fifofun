import { median } from '@/lib/planning/lifestyle'
import type { MonthCategoryTotals } from './categories'

/**
 * Costs that arrive once a year rather than once a month, and what they are
 * worth per month.
 *
 * A budget screen that only asks "how much this month" quietly hides the
 * yearly ones: road tax, an insurance premium, a subscription billed
 * annually. The month it lands in looks like a catastrophe and the eleven
 * before it looked fine, when what was actually true is that a twelfth of it
 * was due all along.
 *
 * Read from the ledger rather than typed, which is this app's habit
 * everywhere else: a category the household paid twice, twelve months apart,
 * has told us its rhythm without being asked. Two occurrences are the
 * minimum — one payment is an event, not a cadence — and anything arriving
 * more often than every three months is just an ordinary expense with a quiet
 * month in it.
 */

export interface PeriodicCost {
  categoryId: string
  /** Calendar months between one arrival and the next. */
  gapMonths: number
  /** What it costs each time it arrives. */
  typical: bigint
  /** What that is worth set aside monthly: `typical / gapMonths`. */
  monthly: bigint
}

export interface PeriodicOptions {
  /** How many recent months to read. */
  window?: number
  /** Below this gap it is an ordinary monthly cost, not a periodic one. */
  minGap?: number
}

/** `YYYY-MM` as a count of months, so gaps are calendar months not array steps. */
function monthIndex(key: string): number {
  const [year, month] = key.split('-').map(Number)
  return year * 12 + (month - 1)
}

export function findPeriodicCosts(
  history: MonthCategoryTotals[],
  { window = 24, minGap = 3 }: PeriodicOptions = {},
): PeriodicCost[] {
  const recent = history.slice(-window)
  const seen = new Map<string, { months: number[]; amounts: bigint[] }>()

  for (const month of recent) {
    const at = monthIndex(month.month)
    for (const [categoryId, amount] of Object.entries(month.byCategory)) {
      if (amount <= 0n) continue
      const entry = seen.get(categoryId) ?? { months: [], amounts: [] }
      entry.months.push(at)
      entry.amounts.push(amount)
      seen.set(categoryId, entry)
    }
  }

  const found: PeriodicCost[] = []

  for (const [categoryId, { months, amounts }] of seen) {
    // One arrival says nothing about how often; two is the smallest claim.
    if (months.length < 2) continue

    const gaps: bigint[] = []
    for (let i = 1; i < months.length; i += 1) gaps.push(BigInt(months[i] - months[i - 1]))
    const gapMonths = Number(median(gaps))
    if (gapMonths < minGap) continue

    const typical = median(amounts)
    if (typical <= 0n) continue

    found.push({ categoryId, gapMonths, typical, monthly: typical / BigInt(gapMonths) })
  }

  // Biggest monthly reserve first: that is the one worth acting on.
  return found.sort((a, b) => (b.monthly === a.monthly ? 0 : b.monthly > a.monthly ? 1 : -1))
}
