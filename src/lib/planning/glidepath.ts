import { futureBalance, monthsToReach } from './goals'

/**
 * A goal's balance from today until it is paid for, computed twice.
 *
 * The panel around it already prints what compounding contributes as a rupiah
 * figure, and that figure is the one thing on the page nobody can feel. Two
 * curves drawn from the same monthly contribution make it a distance instead:
 * one where the money earns a return, one where it sits in a drawer. They start
 * together, and the horizontal gap between where each of them meets the target
 * is how many years the return is worth. That is the number a household can act
 * on, because it is denominated in the thing they are actually short of.
 *
 * Both curves use the closed form the rest of the planning layer uses rather
 * than a private simulation. A chart that disagreed with the figure beside it by
 * even a rupiah would be worse than no chart, and the only reliable way to keep
 * them in step is to have them share the arithmetic.
 */

/** The longest plan the goal control offers, and so the widest axis drawn. */
export const MAX_HORIZON_YEARS = 40

/** The narrowest axis drawn, so a two year goal is not four columns wide. */
const MIN_HORIZON_YEARS = 6

/** Empty years kept past the marker, so it can always be dragged further right. */
const HEADROOM_YEARS = 3

export interface GlidepathPoint {
  /** Calendar year this sample lands on. */
  year: number
  monthsIn: number
  /**
   * Balance with the instrument's return applied, and null once the target is
   * covered. Nobody keeps paying into a goal they have already reached, and a
   * curve drawn climbing past it says they do. It also wrecks the scale: eight
   * further years of compounding tripled the plot's height and squashed the
   * approach, which is the only part of the picture anybody reads.
   */
  invested: bigint | null
  /** The same contributions earning nothing, on the same terms. */
  idle: bigint | null
}

export interface Arrival {
  months: number
  /** Calendar year the target is covered in. */
  year: number
  /** Where along the horizon that falls, from 0 to 1. */
  fraction: number
}

export interface Glidepath {
  points: GlidepathPoint[]
  target: bigint
  monthly: bigint
  annualRate: number
  startingBalance: bigint
  /** Years drawn, counting from today. */
  horizonYears: number
  /** When the invested balance covers the target. */
  invested: Arrival | null
  /** When the same money would get there sitting still, if it ever does. */
  idle: Arrival | null
  /** Months the return takes off the wait, when both land inside the horizon. */
  monthsEarned: number | null
  /** The highest value drawn, for the vertical scale. */
  peak: bigint
}

export interface GlidepathOptions {
  target: bigint
  /** What goes in at the end of every month. */
  monthly: bigint
  annualRate: number
  currentYear: number
  /** The plan's own length, which the axis has to be wide enough to hold. */
  years: number
  startingBalance?: bigint
}

export function buildGlidepath({
  target,
  monthly,
  annualRate,
  currentYear,
  years,
  startingBalance = 0n,
}: GlidepathOptions): Glidepath {
  const cap = MAX_HORIZON_YEARS * 12
  const inside = (months: number | null) => (months !== null && months <= cap ? months : null)

  const investedMonths = inside(monthsToReach(target, monthly, annualRate, startingBalance))
  const idleMonths = inside(monthsToReach(target, monthly, 0, startingBalance))

  /*
    Wide enough for the plan, for the marker's headroom, and for the idle curve
    to be seen meeting the target when it ever does. Letting the slower of the
    two set the width is the point rather than a side effect: the distance
    between the two arrivals is the whole argument, and an axis that stopped at
    the faster one would crop it out.
  */
  const horizonYears = Math.min(
    MAX_HORIZON_YEARS,
    Math.max(
      MIN_HORIZON_YEARS,
      years + HEADROOM_YEARS,
      idleMonths === null ? 0 : Math.ceil(idleMonths / 12),
    ),
  )

  const horizonMonths = horizonYears * 12
  const arrivalOf = (months: number | null): Arrival | null =>
    months === null
      ? null
      : {
          months,
          year: currentYear + Math.ceil(months / 12),
          fraction: months / horizonMonths,
        }

  const points: GlidepathPoint[] = []
  for (let year = 0; year <= horizonYears; year += 1) {
    const monthsIn = year * 12
    /*
      Capped at the target as well as stopped after it. The instalment is solved
      to cover the target and rounds up, so the sample landing on the arrival
      month can sit a couple of hundred sen above it. That is rounding rather
      than growth, and left in it pushes the axis onto a whole extra gridline
      and gives the plot a sixth of its height to empty space.
    */
    const until = (arrival: number | null, balance: () => bigint) => {
      if (arrival !== null && monthsIn > arrival) return null
      const value = balance()
      return value > target ? target : value
    }

    points.push({
      year: currentYear + year,
      monthsIn,
      invested: until(investedMonths, () =>
        futureBalance(startingBalance, monthly, annualRate, monthsIn),
      ),
      idle: until(idleMonths, () => futureBalance(startingBalance, monthly, 0, monthsIn)),
    })
  }

  // Floored at the target, so a goal that is never reached still shows the line
  // it is falling short of. Without that the plot would crop out the one mark
  // that gives every other mark its meaning. Nothing rises above it, so in
  // practice the target is this chart's ceiling.
  const peak = points.reduce(
    (highest, point) => (point.invested !== null && point.invested > highest ? point.invested : highest),
    target,
  )

  return {
    points,
    target,
    monthly,
    annualRate,
    startingBalance,
    horizonYears,
    invested: arrivalOf(investedMonths),
    idle: arrivalOf(idleMonths),
    monthsEarned:
      investedMonths === null || idleMonths === null ? null : idleMonths - investedMonths,
    peak,
  }
}
