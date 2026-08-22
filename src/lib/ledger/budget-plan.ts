import { proposeBudget } from './budget'
import { formatIdr } from '@/lib/money'
import type { MonthCategoryTotals } from './categories'
import type { CashflowType } from './types'

/**
 * The budget screen, worked out before anything is rendered.
 *
 * Everything here is strings and numbers by the time it leaves, because the
 * table that edits budgets is a client island and `bigint` does not cross that
 * line. The reason it is a whole module rather than logic in the page is the
 * arithmetic underneath: what a category usually costs, what it was budgeted
 * last month, what it actually cost this month, and which of those a household
 * has never had. Four figures per row, three of which can legitimately be
 * unknown, and unknown has to read as unknown rather than as zero.
 */

export interface BudgetCategory {
  id: string
  name: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
}

export interface BudgetPlanInput {
  /** `YYYY-MM` being edited. */
  period: string
  /** The month before it, for the comparison column. */
  previous: string
  categories: BudgetCategory[]
  /** Spending by month, keyed by category id rather than by name. */
  history: MonthCategoryTotals[]
  /** What is stored for `period`, keyed by category id. */
  saved: Record<string, bigint>
  /** What is stored for `previous`, keyed by category id. */
  previousSaved: Record<string, bigint>
}

export interface BudgetLineView {
  id: string
  name: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
  /** The median of the months before this one, or null where there is none. */
  usual: string | null
  /** What was budgeted last month, or what was spent if nothing was. */
  lastMonth: { text: string; derived: boolean } | null
  /** The amount stored for this month, as sen digits. Empty when none. */
  amount: string
  /** What was actually spent this month, when the month has any data at all. */
  actual: { text: string; pct: number; over: boolean } | null
}

export interface BudgetPlanView {
  period: string
  previous: string
  lines: BudgetLineView[]
  /** Whether any earlier month exists to take a median from. */
  hasHistory: boolean
  /** Whether this month has any spending recorded yet. */
  hasData: boolean
  /** How many categories carry a budget for this month. */
  budgeted: number
  /** The total of those budgets. */
  total: string
  /** Whether last month has budgets this month is missing. */
  canCopy: boolean
}

export interface BudgetDiff {
  upsert: { categoryId: string; amount: bigint }[]
  remove: string[]
}

/**
 * The smallest set of writes that turns one month's budgets into another.
 *
 * A category the form did not mention is left alone rather than deleted. The
 * table only lists live categories, and an archived one with a budget on it
 * should keep it: the month it belongs to has already been judged against it.
 */
export function diffBudgets(
  existing: Record<string, bigint>,
  submitted: Record<string, bigint | null>,
): BudgetDiff {
  const upsert: BudgetDiff['upsert'] = []
  const remove: string[] = []

  for (const [categoryId, amount] of Object.entries(submitted)) {
    const current = existing[categoryId]
    if (amount === null || amount === 0n) {
      if (current !== undefined) remove.push(categoryId)
      continue
    }
    if (current !== amount) upsert.push({ categoryId, amount })
  }

  return { upsert, remove }
}

/** A `YYYY-MM` from the address bar, or the fallback when it is not one. */
export function parseMonthParam(value: string | string[] | undefined, fallback: string): string {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return fallback

  const year = Number(raw.slice(0, 4))
  // A budget for the year 300 is a typing accident, and a month that far out
  // would ask the page to render a comparison against nothing at all.
  return year >= 2000 && year <= 2100 ? raw : fallback
}

export function buildBudgetPlan({
  period,
  previous,
  categories,
  history,
  saved,
  previousSaved,
}: BudgetPlanInput): BudgetPlanView {
  const before = history.filter((month) => month.month < period)
  /*
    The median of the months before this one, never including it. A budget
    derived from the month it is judging can never be exceeded, which is the
    same reason the dashboard slices its history at the current month.
  */
  const usual = proposeBudget(before)

  const thisMonth = history.find((month) => month.month === period)?.byCategory ?? {}
  const lastMonth = history.find((month) => month.month === previous)?.byCategory ?? {}
  const hasData = Object.keys(thisMonth).length > 0

  // Spending first, then bills, which is the order they are decided in: what
  // is discretionary is what a budget actually changes.
  const order: CashflowType[] = ['spending', 'bills']
  const sorted = [...categories].sort(
    (a, b) => order.indexOf(a.cashflow) - order.indexOf(b.cashflow),
  )

  const lines = sorted.map<BudgetLineView>((category) => {
    const budget = saved[category.id]
    const spent = thisMonth[category.id]
    const previousBudget = previousSaved[category.id]
    const previousSpent = lastMonth[category.id]

    return {
      id: category.id,
      name: category.name,
      cashflow: category.cashflow,
      icon: category.icon,
      hue: category.hue,
      usual: usual[category.id] === undefined ? null : formatIdr(usual[category.id]),
      lastMonth:
        previousBudget !== undefined
          ? { text: formatIdr(previousBudget), derived: false }
          : previousSpent !== undefined
            ? { text: formatIdr(previousSpent), derived: true }
            : null,
      amount: budget === undefined ? '' : budget.toString(),
      actual:
        !hasData || spent === undefined
          ? null
          : {
              text: formatIdr(spent),
              // Against the budget that was actually set, not against the
              // median: comparing spending to a figure nobody chose would
              // report a household as over a budget it never agreed to.
              pct:
                budget === undefined || budget <= 0n
                  ? 0
                  : Number((spent * 100n) / budget),
              over: budget !== undefined && spent > budget,
            },
    }
  })

  const budgeted = lines.filter((line) => line.amount !== '').length
  const total = lines.reduce((sum, line) => sum + BigInt(line.amount || '0'), 0n)

  return {
    period,
    previous,
    lines,
    hasHistory: before.length > 0,
    hasData,
    budgeted,
    total: formatIdr(total),
    // Only worth offering when it would actually fill something in.
    canCopy: lines.some((line) => line.amount === '' && previousSaved[line.id] !== undefined),
  }
}
