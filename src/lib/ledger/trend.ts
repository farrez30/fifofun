import { median } from '@/lib/planning/lifestyle'
import type { MonthlySeries } from './monthly'

/**
 * Where the money is heading, month by month.
 *
 * Every other view in this app answers a question about one month. None of them
 * answers the one a household actually worries about, which is whether the pile
 * is growing or shrinking: a month can look fine on its own and still be the
 * fourth in a row that ended lower than it started.
 *
 * Only money is counted here. The spreadsheet also tracks gold and land, and
 * this app has nowhere to record either yet, so calling the result net worth
 * would overstate what it knows.
 */

export interface TrendPoint {
  month: string
  balance: bigint
}

export type TrendDirection = 'naik' | 'turun' | 'datar'

export interface BalanceTrend {
  points: TrendPoint[]
  /** The month the balance was at its lowest; the one that came closest to empty. */
  low: TrendPoint
  high: TrendPoint
  latest: TrendPoint
  /** From the first month recorded to the last. */
  change: bigint
  /**
   * The middle month-to-month change. Median rather than mean, so one bonus or
   * one house deposit does not decide which way the whole run is called.
   */
  typicalChange: bigint
  direction: TrendDirection
}

/**
 * Below this share of the balance, a month-to-month drift is not a direction.
 *
 * A household whose balance wanders by a few tenths of a percent is level, and
 * calling that a rise invites someone to plan around a movement that is really
 * the timing of one salary landing either side of a month boundary.
 */
const FLAT_BAND_BASIS_POINTS = 50n

export function buildBalanceTrend(series: MonthlySeries[]): BalanceTrend | null {
  // Two months is the fewest that can have a direction at all.
  if (series.length < 2) return null

  const points: TrendPoint[] = series.map(({ month, statement }) => ({
    month,
    balance: statement.sisaUang,
  }))

  const first = points[0]
  const latest = points[points.length - 1]

  let low = first
  let high = first
  for (const point of points) {
    if (point.balance < low.balance) low = point
    if (point.balance > high.balance) high = point
  }

  const changes = points.slice(1).map((point, index) => point.balance - points[index].balance)
  const typicalChange = median(changes)
  const change = latest.balance - first.balance

  const scale = median(points.map((point) => point.balance))
  const magnitude = change < 0n ? -change : change
  const band = (scale < 0n ? -scale : scale) * FLAT_BAND_BASIS_POINTS
  const direction: TrendDirection =
    magnitude * 10_000n <= band ? 'datar' : change > 0n ? 'naik' : 'turun'

  return { points, low, high, latest, change, typicalChange, direction }
}
