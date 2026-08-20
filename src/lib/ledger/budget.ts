import { median } from '@/lib/planning/lifestyle'
import type { MonthCategoryTotals } from './categories'

/**
 * Budget against actual.
 *
 * This is the panel that answers the failure the spreadsheet allowed: a category
 * budgeted at Rp80.500 that spent Rp4.801.400 and said nothing. Reproducing the
 * comparison is not enough on its own, because the spreadsheet already had it.
 * What it lacked was ranking, so the one line that mattered sat somewhere in a
 * list of twenty and nothing pulled the eye to it.
 *
 * Three states, not two. A category over its budget and a category with no
 * budget at all are different problems: the first is a plan that was broken, the
 * second is spending nobody ever planned for. Collapsing them into "over" hides
 * the second, which is the one that actually happened.
 */

export type BudgetStatus = 'under' | 'over' | 'unbudgeted'

export interface BudgetLine {
  category: string
  budget: bigint
  actual: bigint
  /** Actual minus budget. Positive means the plan was exceeded. */
  delta: bigint
  /**
   * Spent as a percentage of budget, or null where there is no budget to be a
   * percentage of. Null rather than zero or Infinity, so the UI has to decide
   * what to show instead of rendering a number that means nothing.
   */
  share: number | null
  status: BudgetStatus
}

export interface BudgetReview {
  period: string
  /** Worst overrun first, in Rupiah rather than in percent. See below. */
  lines: BudgetLine[]
  totalBudget: bigint
  totalActual: bigint
  /** Lines that are over budget or were never budgeted at all. */
  breaches: BudgetLine[]
  /** Where the budget figures came from, so the UI can say so. */
  source: 'manual' | 'derived'
}

function shareOf(actual: bigint, budget: bigint): number | null {
  if (budget <= 0n) return null
  // Two decimal places of a ratio, computed in bigint so a large budget cannot
  // lose precision on the way through a float.
  return Number((actual * 10_000n) / budget) / 100
}

/**
 * Ranks by Rupiah over budget, not by percentage.
 *
 * A category at 300% of a Rp20.000 budget is over by Rp40.000. A category at
 * 150% of a Rp4.000.000 budget is over by Rp2.000.000. Percentage ranking puts
 * the first one on top, and it is the second that will empty the account. It
 * also gives unbudgeted spending nowhere to sort, since it has no percentage,
 * which is how the largest single overspend in the source spreadsheet would end
 * up at the bottom of the list.
 */
function byOverrun(a: BudgetLine, b: BudgetLine): number {
  if (a.delta !== b.delta) return b.delta > a.delta ? 1 : -1
  return a.category.localeCompare(b.category, 'id')
}

export function reviewBudget(
  period: string,
  budgets: Record<string, bigint>,
  actuals: Record<string, bigint>,
  source: BudgetReview['source'] = 'manual',
): BudgetReview {
  // Both directions matter. A budgeted category that spent nothing is worth
  // seeing, and so is spending in a category nobody budgeted.
  const categories = [...new Set([...Object.keys(budgets), ...Object.keys(actuals)])]

  const lines = categories
    .map<BudgetLine>((category) => {
      const budget = budgets[category] ?? 0n
      const actual = actuals[category] ?? 0n
      const status: BudgetStatus =
        budget <= 0n ? (actual > 0n ? 'unbudgeted' : 'under') : actual > budget ? 'over' : 'under'

      return { category, budget, actual, delta: actual - budget, share: shareOf(actual, budget), status }
    })
    .sort(byOverrun)

  const sum = (pick: (line: BudgetLine) => bigint) => lines.reduce((total, l) => total + pick(l), 0n)

  return {
    period,
    lines,
    totalBudget: sum((l) => l.budget),
    totalActual: sum((l) => l.actual),
    breaches: lines.filter((line) => line.status !== 'under'),
    source,
  }
}

export interface ProposeOptions {
  /** How many recent months to look at. */
  months?: number
  /**
   * Categories under this per month get no budget line. Zero by default, which
   * is deliberately lower than the lifestyle module's floor: that one is
   * deciding which costs define how a household lives, and Rp80 ribu of Jajan
   * does not. This one is deciding what to watch, and Rp80 ribu of Jajan is
   * precisely the line that went to Rp4,8 juta.
   */
  floor?: bigint
}

/**
 * A starting budget derived from what the household actually spends.
 *
 * The median, not the mean, and for the same reason the lifestyle module uses
 * it: one Rp4,8 juta month in a category that normally sees Rp80 ribu would drag
 * a mean up until the budget quietly ratifies the mistake it was meant to catch.
 *
 * This is a proposal, never a decision. It is what the panel shows before anyone
 * has set a budget, so the comparison exists on the first screen instead of an
 * empty state, and it is labelled as derived wherever it appears.
 */
export function proposeBudget(
  history: MonthCategoryTotals[],
  options: ProposeOptions = {},
): Record<string, bigint> {
  const recent = history.slice(-(options.months ?? 6))
  const floor = options.floor ?? 0n
  const proposal: Record<string, bigint> = {}

  for (const category of new Set(recent.flatMap((month) => Object.keys(month.byCategory)))) {
    // A month with no entry really did spend nothing, so it counts as a zero.
    // Dropping those months would turn an occasional cost into a monthly one.
    const typical = median(recent.map((month) => month.byCategory[category] ?? 0n))
    if (typical > 0n && typical >= floor) proposal[category] = typical
  }

  return proposal
}
