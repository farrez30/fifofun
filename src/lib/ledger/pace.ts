import { daysInMonth } from '@/lib/datetime'

/**
 * How far into the month "now" is, and what the month-to-date spend implies
 * for its end. Pure arithmetic for the budget page; the page passes its own
 * render-time `new Date()` so fixtures and tests stay deterministic.
 *
 * Two numbers with different honesty requirements live here, and they are
 * deliberately not treated the same. The pace marker (`day / days`) states a
 * fact — this fraction of the month has passed — so it is never adjusted.
 * The projection is a guess, and a naive `actual * days / day` on day two
 * turns one grocery run into a fifteen-fold forecast: noise dressed as a
 * number. Its divisor is floored at five, which caps the early-month
 * multiplier and converges to plain linear from day five onward. A blend
 * with the category's median was considered and rejected: "biasanya" is
 * already printed one column over, and folding it in would double-count
 * information the reader can combine by eye.
 *
 * Day counts today as elapsed while the actual already includes today's
 * spending, so the projection leans slightly low — conservative in the safe
 * direction.
 */

/** How many WIB minutes ahead of UTC; Jakarta has no daylight saving. */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export interface MonthPace {
  /** Day of the month in Jakarta, counting today. */
  day: number
  days: number
  /** `day / days`, as 0-100 for a style width. */
  elapsedPct: number
}

/** The pace through `period`, or null when `now` sits in a different month. */
export function monthPace(period: string, now: Date): MonthPace | null {
  const shifted = new Date(now.getTime() + JAKARTA_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth() + 1
  const key = `${year}-${String(month).padStart(2, '0')}`
  if (key !== period) return null

  const day = shifted.getUTCDate()
  const days = daysInMonth(year, month)
  return { day, days, elapsedPct: (day / days) * 100 }
}

/**
 * Month-end spend if the rhythm holds: `actual * days / max(day, 5)`.
 * Bigint throughout; degenerate inputs answer with the actual rather than
 * throwing, because a projection is decoration and must never take the page
 * down with it.
 */
export function projectMonthEnd(actual: bigint, day: number, days: number): bigint {
  if (actual <= 0n || day < 1 || days < 1) return actual
  const divisor = BigInt(Math.max(day, 5))
  return (actual * BigInt(days)) / divisor
}
