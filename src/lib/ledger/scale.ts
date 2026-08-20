/**
 * Axis ticks a person can read.
 *
 * A chart whose tallest bar is Rp11.437.221 and whose axis runs to Rp11.437.221
 * is unreadable: every gridline is a number nobody would ever say out loud, and
 * the reader ends up hovering each bar because the axis was no help. Rounding
 * the top of the axis up to a figure with two significant digits costs a little
 * headroom and turns the gridlines into landmarks.
 *
 * The steps are the ones people count in: one, two, two and a half, five, and
 * their powers of ten. Two and a half earns its place in Rupiah, where a chart
 * topping out near Rp12 juta wants Rp2,5 juta steps and gets an ugly five
 * gridlines at Rp2 juta or a cramped twelve at Rp1 juta without it.
 */

/** Multipliers of a power of ten that read as round numbers. */
const NICE_STEPS = [1, 2, 2.5, 5, 10]

/**
 * Picks the round step that covers `range` in roughly `target` jumps.
 *
 * Every nice step near the right order of magnitude is tried, and the one that
 * lands closest to the number of gridlines asked for wins. Taking the first step
 * at or above `range / target` instead, which is the shorter version of this
 * function, overshoots: an Rp11,4 juta peak got Rp5 juta steps and an Rp15 juta
 * axis, leaving a quarter of the plot empty for no reason.
 *
 * Ties go to the step with the least headroom, so the bars fill the space.
 *
 * Every step is at least one sen, whatever the arithmetic says. Below about four
 * sen the rounding produces zero, and a step of zero is not a small step: it is
 * a loop that never advances, and it hung a test run rather than drawing a bad
 * axis.
 */
function chooseStep(range: bigint, target: number): bigint {
  const safe = range > 0n ? range : 1n
  const rough = Number(safe) / Math.max(1, target)
  const magnitude = 10 ** Math.floor(Math.log10(rough))

  const candidates = [0.5, ...NICE_STEPS]
    .map((multiple) => BigInt(Math.max(1, Math.round(multiple * magnitude))))
    .map((step) => {
      const spans = (safe + step - 1n) / step
      return { step, count: Number(spans) + 1, headroom: spans * step - safe }
    })
    .filter(({ count }) => count >= 3 && count <= 8)

  const best = candidates.sort((a, b) => {
    const aim = Math.abs(a.count - (target + 1)) - Math.abs(b.count - (target + 1))
    if (aim !== 0) return aim
    return a.headroom > b.headroom ? 1 : a.headroom < b.headroom ? -1 : 0
  })[0]

  // Nothing in the band happens only for absurdly small amounts, where a single
  // step covering the whole range is the honest answer.
  return best?.step ?? safe
}

/** Rounds away from zero on the low side: -3 with a step of 2 becomes -4. */
function floorTo(value: bigint, step: bigint): bigint {
  const whole = value / step
  return value < 0n && value % step !== 0n ? (whole - 1n) * step : whole * step
}

/** Rounds away from zero on the high side: 3 with a step of 2 becomes 4. */
function ceilTo(value: bigint, step: bigint): bigint {
  const whole = value / step
  return value > 0n && value % step !== 0n ? (whole + 1n) * step : whole * step
}

export interface Scale {
  /** The value the top gridline sits at, at or above the largest datum. */
  top: bigint
  /** Gridline values from zero to the top, inclusive of both. */
  ticks: bigint[]
  /** Height as a percentage of the plot, for a value on this scale. */
  percentOf: (value: bigint) => number
}

/**
 * Builds a scale whose top is a round number and which has roughly `target`
 * gridlines. Never returns a zero top, so a chart of an empty month still has
 * an axis rather than dividing by nothing.
 */
export function buildScale(max: bigint, target = 4): Scale {
  const safeMax = max > 0n ? max : 1n
  const step = chooseStep(safeMax, target)
  const top = ceilTo(safeMax, step)

  const ticks: bigint[] = []
  for (let value = 0n; value <= top; value += step) ticks.push(value)

  return {
    top,
    ticks,
    percentOf: (value) => {
      if (top === 0n) return 0
      const magnified = (value < 0n ? -value : value) * 10_000n
      const share = Number(magnified / top) / 100
      return value < 0n ? -share : share
    },
  }
}

export interface SpanScale {
  /** The value the leftmost gridline sits at, at or below the smallest datum. */
  bottom: bigint
  /** The value the rightmost gridline sits at, at or above the largest datum. */
  top: bigint
  /** Gridline values from bottom to top, inclusive of both. */
  ticks: bigint[]
  /** Position as a percentage of the plot, measured from the bottom. */
  percentOf: (value: bigint) => number
}

export interface SpanScaleOptions {
  /** Roughly how many gridlines to aim for. */
  target?: number
  /**
   * Whether zero has to be inside the range. On by default.
   *
   * Turn it off only for a chart drawn as a line. A bar or an area measured
   * from a floor that is not zero overstates every difference it shows, and
   * nothing in the picture says so; a line claims only that the points differ
   * by what the axis says they differ by, which stays true wherever the floor
   * is put.
   */
  includeZero?: boolean
}

/**
 * Builds a scale for a chart whose marks are levels rather than heights.
 *
 * Both ends are rounded to a multiple of the same step, which puts zero on a
 * gridline for free and keeps the two halves of a chart that crosses zero in
 * proportion to each other.
 */
export function buildSpanScale(
  low: bigint,
  high: bigint,
  { target = 4, includeZero = true }: SpanScaleOptions = {},
): SpanScale {
  const lo = includeZero && low > 0n ? 0n : low
  const hi = includeZero && high < 0n ? 0n : high
  const step = chooseStep(hi - lo, target)

  const bottom = floorTo(lo, step)
  const ceiling = ceilTo(hi, step)
  // A month where nothing moved leaves both ends on zero. One step of width is
  // enough for the axis to exist and for every bar to be honestly empty.
  const top = ceiling === bottom ? bottom + step : ceiling

  const ticks: bigint[] = []
  for (let value = bottom; value <= top; value += step) ticks.push(value)

  const width = top - bottom

  return {
    bottom,
    top,
    ticks,
    percentOf: (value) => Number(((value - bottom) * 10_000n) / width) / 100,
  }
}
