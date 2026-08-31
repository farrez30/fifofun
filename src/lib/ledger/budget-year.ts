import { formatMonthKey } from '@/lib/datetime'
import { formatIdr } from '@/lib/money'
import type { MonthCategoryTotals } from './categories'

/**
 * Twelve months of "did we hold the line", worked out before rendering.
 *
 * Aggregate on purpose. Per-category small multiples across a year is a wall
 * of forty strips nobody reads; the year-level question is whether the months
 * stayed inside their budgets, and one column per month answers it. The
 * drill-down is navigation: every month links to its own budget page.
 *
 * Same serialisation rule as budget-plan: strings and numbers out, because
 * the strip is a client island and `bigint` does not cross that line. All
 * twelve columns share one ceiling so their lengths are comparable — the
 * house rule the bullet charts follow. Three states are kept distinct, and
 * distinct from zero: a month over its budget (the alarm), a month with
 * spending but no budget (quiet — nobody broke a plan that never existed),
 * and a month with no data at all (an absence, not a zero).
 */

export interface BudgetYearInput {
  /** The twelve `YYYY-MM` keys shown, oldest first. */
  periods: string[]
  /** Spending by month; only the listed periods are read. */
  history: MonthCategoryTotals[]
  /** Budget totals: every stored row for the listed periods. */
  budgets: { period: string; amount: bigint }[]
}

export interface YearMonthView {
  month: string
  /** "Jul '26" — compact, for the readout. */
  label: string
  hasData: boolean
  outSen: string
  outText: string
  /** 0-100 of the shared ceiling. */
  outPct: number
  budgetText: string | null
  budgetPct: number | null
  /** Spending past a budget that exists. */
  over: boolean
}

export interface BudgetYearView {
  months: YearMonthView[]
  /** Whether anything at all — data or budget — exists to draw. */
  hasAny: boolean
}

function pctOf(value: bigint, ceiling: bigint): number {
  if (ceiling <= 0n) return 0
  return Number((value * 10_000n) / ceiling) / 100
}

export function buildBudgetYear({ periods, history, budgets }: BudgetYearInput): BudgetYearView {
  const outByMonth = new Map(
    history.map((month) => [
      month.month,
      Object.values(month.byCategory).reduce((sum, sen) => sum + sen, 0n),
    ]),
  )

  const budgetByMonth = new Map<string, bigint>()
  for (const row of budgets) {
    budgetByMonth.set(row.period, (budgetByMonth.get(row.period) ?? 0n) + row.amount)
  }

  // One ceiling for all twelve, so a long bar means a big month, not a big
  // share of its own column.
  let ceiling = 0n
  for (const period of periods) {
    const out = outByMonth.get(period) ?? 0n
    const budget = budgetByMonth.get(period) ?? 0n
    if (out > ceiling) ceiling = out
    if (budget > ceiling) ceiling = budget
  }

  const months = periods.map<YearMonthView>((period) => {
    const hasData = outByMonth.has(period)
    const out = outByMonth.get(period) ?? 0n
    const budget = budgetByMonth.get(period)

    return {
      month: period,
      label: formatMonthKey(period, 'compact'),
      hasData,
      outSen: out.toString(),
      outText: formatIdr(out),
      outPct: pctOf(out, ceiling),
      budgetText: budget === undefined ? null : formatIdr(budget),
      budgetPct: budget === undefined ? null : pctOf(budget, ceiling),
      over: budget !== undefined && out > budget,
    }
  })

  return { months, hasAny: ceiling > 0n }
}
