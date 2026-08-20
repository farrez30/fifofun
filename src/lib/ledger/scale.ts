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
  const rough = Number(safeMax) / Math.max(1, target)
  const magnitude = 10 ** Math.floor(Math.log10(rough))

  /*
    Every nice step near the right order of magnitude is tried, and the one that
    lands closest to the number of gridlines asked for wins. Taking the first
    step at or above `max / target` instead, which is the shorter version of this
    function, overshoots: an Rp11,4 juta peak got Rp5 juta steps and an Rp15 juta
    axis, leaving a quarter of the plot empty for no reason.

    Ties go to the axis with the least headroom, so the bars fill the space.

    Every step is at least one sen, whatever the arithmetic says. Below about
    four sen the rounding produces zero, and a step of zero is not a small step:
    it is a loop that never advances, and it hung a test run rather than drawing
    a bad axis.
  */
  const candidates = [0.5, ...NICE_STEPS]
    .map((multiple) => BigInt(Math.max(1, Math.round(multiple * magnitude))))
    .map((step) => {
      const spans = (safeMax + step - 1n) / step
      const top = spans * step
      return { step, top, count: Number(spans) + 1, headroom: top - safeMax }
    })
    .filter(({ count }) => count >= 3 && count <= 8)

  const best =
    candidates.sort((a, b) => {
      const aim = Math.abs(a.count - (target + 1)) - Math.abs(b.count - (target + 1))
      if (aim !== 0) return aim
      return a.headroom > b.headroom ? 1 : a.headroom < b.headroom ? -1 : 0
    })[0] ??
    // Nothing in the band happens only for absurdly small amounts, where a
    // single step covering the whole range is the honest answer.
    { step: safeMax, top: safeMax, count: 2, headroom: 0n }

  const { step: chosen, top } = best

  const ticks: bigint[] = []
  for (let value = 0n; value <= top; value += chosen) ticks.push(value)

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
