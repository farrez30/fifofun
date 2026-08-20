import { median } from '@/lib/planning/lifestyle'
import { isMaterial } from './budget'
import type { MonthCategoryTotals } from './categories'

/**
 * Each spending category's own run of months.
 *
 * The budget panel can tell a household that Jajan came in above its usual this
 * month. What it cannot say is whether that is a bad week or the fourth month of
 * a climb, and those two call for completely different responses. The answer is
 * in the ledger already; nothing in the app was drawing it.
 *
 * One series per category rather than one stacked chart of all of them. Stacked,
 * only the band on the floor can actually be compared between months, and the
 * question here is always about one category at a time.
 */

export type CategoryMovement = 'melonjak' | 'mereda' | 'biasa' | 'baru'

export interface CategoryTrend {
  category: string
  /** One entry per month of the window, chronological. A quiet month is a zero. */
  points: { month: string; amount: bigint }[]
  latest: bigint
  peak: bigint
  /**
   * The middle month of the window, not counting the month being judged. A
   * baseline that includes the month it is measuring can never be exceeded by
   * very much, which is the same trap `proposeBudget` avoids.
   */
  usual: bigint
  /** Everything spent on this category across the window. The ranking key. */
  total: bigint
  movement: CategoryMovement
}

export interface CategoryTrendReview {
  /** The months covered, chronological. */
  months: string[]
  trends: CategoryTrend[]
  /** Categories that did not make the cut, and what they came to between them. */
  omitted: number
  omittedTotal: bigint
}

export interface CategoryTrendOptions {
  /** How many months back to look. */
  months?: number
  /** How many categories to keep, largest total first. */
  top?: number
}

export function buildCategoryTrends(
  history: MonthCategoryTotals[],
  options: CategoryTrendOptions = {},
): CategoryTrendReview {
  const window = history.slice(-(options.months ?? 12))
  const months = window.map((month) => month.month)

  if (window.length === 0) {
    return { months, trends: [], omitted: 0, omittedTotal: 0n }
  }

  const latestMonth = window[window.length - 1]
  const latestTotal = Object.values(latestMonth.byCategory).reduce(
    (total, amount) => total + amount,
    0n,
  )

  const categories = [...new Set(window.flatMap((month) => Object.keys(month.byCategory)))]

  const all = categories
    .map<CategoryTrend>((category) => {
      // A month with no entry really did spend nothing. Leaving those months out
      // would turn an occasional cost into a monthly one.
      const points = window.map((month) => ({
        month: month.month,
        amount: month.byCategory[category] ?? 0n,
      }))
      const amounts = points.map((point) => point.amount)
      const latest = amounts[amounts.length - 1]
      const earlier = amounts.slice(0, -1)
      const usual = median(earlier)

      return {
        category,
        points,
        latest,
        peak: amounts.reduce((max, amount) => (amount > max ? amount : max), 0n),
        usual,
        total: amounts.reduce((sum, amount) => sum + amount, 0n),
        movement: movementOf(latest, usual, earlier, latestTotal),
      }
    })
    .sort((a, b) => (a.total === b.total ? a.category.localeCompare(b.category, 'id') : b.total > a.total ? 1 : -1))

  const top = options.top ?? 8
  const kept = all.slice(0, top)
  const rest = all.slice(top)

  return {
    months,
    trends: kept,
    omitted: rest.length,
    omittedTotal: rest.reduce((sum, trend) => sum + trend.total, 0n),
  }
}

/**
 * Half again as much as usual, before a month counts as a move.
 *
 * Materiality alone is the budget panel's test, and it is the wrong one here.
 * There, the reference is a figure the household chose, so going past it at all
 * means something and one percent of the month only strains out the noise. Here
 * the reference is the household's own median, and ordinary months differ from
 * their median all the time: Belanja going from Rp1,7 juta to Rp1,9 juta clears
 * one percent of the month comfortably and is simply what a month looks like.
 *
 * So both tests have to pass. A category has moved when it is well above what
 * it usually is and large enough to matter to the month. Fifty nine times its
 * usual, which is what Jajan did, clears both without argument.
 */
const MOVE_RATIO_BASIS_POINTS = 15_000n

/** Whether `bigger` is at least `basisPoints` of `smaller`, with nothing over nothing false. */
function outweighs(bigger: bigint, smaller: bigint, basisPoints: bigint): boolean {
  if (bigger <= 0n) return false
  if (smaller <= 0n) return true
  return bigger * 10_000n >= smaller * basisPoints
}

function movementOf(
  latest: bigint,
  usual: bigint,
  earlier: bigint[],
  monthTotal: bigint,
): CategoryMovement {
  // Nothing to compare against yet. Calling a category's first appearance a
  // surge would flag every new habit on the month it starts.
  if (earlier.length === 0) return 'biasa'
  if (latest > 0n && earlier.every((amount) => amount === 0n)) return 'baru'

  const moved = (from: bigint, to: bigint) =>
    isMaterial(from - to, monthTotal) && outweighs(from, to, MOVE_RATIO_BASIS_POINTS)

  if (latest > usual && moved(latest, usual)) return 'melonjak'
  if (usual > latest && moved(usual, latest)) return 'mereda'
  return 'biasa'
}
