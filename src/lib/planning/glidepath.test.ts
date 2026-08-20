import { describe, expect, it } from 'vitest'
import { monthlyContribution } from './goals'
import { buildGlidepath, MAX_HORIZON_YEARS } from './glidepath'

describe('buildGlidepath', () => {
  /** The panel's own defaults: half a milliard over ten years. */
  const plan = monthlyContribution(500_000_000_00n, 120, 0.11)
  const contributionFor = (years: number) =>
    monthlyContribution(500_000_000_00n, years * 12, 0.11).monthly

  const base = {
    target: 500_000_000_00n,
    monthly: plan.monthly,
    annualRate: 0.11,
    currentYear: 2026,
    years: 10,
  }

  it('lands on the target in the year the plan was built for', () => {
    // The contribution came from `monthlyContribution` for exactly 120 months,
    // so a chart that put the crossing anywhere else would be contradicting the
    // figure printed beside it.
    const path = buildGlidepath(base)
    expect(path.invested?.months).toBe(120)
    expect(path.invested?.year).toBe(2036)
  })

  it('samples one point per year, including today', () => {
    const path = buildGlidepath(base)
    expect(path.points).toHaveLength(path.horizonYears + 1)
    expect(path.points[0]).toMatchObject({ year: 2026, monthsIn: 0, invested: 0n, idle: 0n })
  })

  it('keeps empty years past the marker so it can still be dragged right', () => {
    const path = buildGlidepath({ ...base, years: 3 })
    expect(path.horizonYears).toBeGreaterThan(3)
  })

  it('widens far enough to show idle money crossing, when it ever does', () => {
    const path = buildGlidepath(base)
    expect(path.idle).not.toBeNull()
    expect(path.horizonYears).toBeGreaterThanOrEqual(Math.ceil(path.idle!.months / 12))
  })

  it('never draws past the longest plan the control offers', () => {
    const long = monthlyContribution(500_000_000_00n, MAX_HORIZON_YEARS * 12, 0.11)
    const path = buildGlidepath({
      ...base,
      monthly: long.monthly,
      years: MAX_HORIZON_YEARS,
    })
    expect(path.horizonYears).toBe(MAX_HORIZON_YEARS)
  })

  it('leaves idle money unmarked when it never arrives inside the horizon', () => {
    // Forty years of return does most of the work, so the contribution it asks
    // for is nowhere near enough on its own.
    const long = monthlyContribution(500_000_000_00n, MAX_HORIZON_YEARS * 12, 0.11)
    const path = buildGlidepath({ ...base, monthly: long.monthly, years: MAX_HORIZON_YEARS })
    expect(path.idle).toBeNull()
    expect(path.monthsEarned).toBeNull()
  })

  it('counts the wait the return takes off', () => {
    const path = buildGlidepath(base)
    expect(path.monthsEarned).toBe(path.idle!.months - 120)
    expect(path.monthsEarned).toBeGreaterThan(0)
  })

  it('has the two curves start together and then part', () => {
    const path = buildGlidepath(base)
    expect(path.points[0].invested).toBe(path.points[0].idle)
    for (const point of path.points.slice(1)) {
      if (point.invested === null || point.idle === null) continue
      expect(point.invested).toBeGreaterThan(point.idle)
    }
  })

  it('stops each series once its own target is covered', () => {
    // Nobody keeps paying into a goal they have reached, and a curve climbing
    // past the target both says they do and triples the height of the plot,
    // squashing the approach that is the only part anybody reads.
    const path = buildGlidepath(base)
    const drawn = path.points.filter((point) => point.invested !== null)
    expect(drawn.at(-1)!.monthsIn).toBeLessThanOrEqual(path.invested!.months)
    expect(path.points.at(-1)!.invested).toBeNull()
    // And the slower one is still being paid into long after.
    const idleDrawn = path.points.filter((point) => point.idle !== null)
    expect(idleDrawn.length).toBeGreaterThan(drawn.length)
  })

  it('keeps the target inside the plot even when nothing reaches it', () => {
    const path = buildGlidepath({ ...base, monthly: 1n })
    expect(path.peak).toBe(path.target)
  })

  it('draws one curve twice when nothing is earned', () => {
    const flat = buildGlidepath({
      ...base,
      monthly: monthlyContribution(500_000_000_00n, 120, 0).monthly,
      annualRate: 0,
    })
    for (const point of flat.points) expect(point.invested).toBe(point.idle)
    expect(flat.monthsEarned).toBe(0)
  })

  it('places both arrivals inside the plot', () => {
    const path = buildGlidepath(base)
    for (const arrival of [path.invested, path.idle]) {
      expect(arrival!.fraction).toBeGreaterThan(0)
      expect(arrival!.fraction).toBeLessThanOrEqual(1)
    }
  })

  it('arrives immediately when the money is already there', () => {
    const path = buildGlidepath({ ...base, startingBalance: 600_000_000_00n, monthly: 0n })
    expect(path.invested?.months).toBe(0)
    expect(path.invested?.year).toBe(2026)
  })

  it('leaves nothing drawn above the target', () => {
    // Which is only true because both series stop on arrival. The target is the
    // ceiling of this chart, and it has to stay near the top of the plot at
    // every horizon: a curve allowed to run on tripled the height and squashed
    // the approach into the bottom quarter.
    for (const years of [2, 5, 10, 25]) {
      const path = buildGlidepath({ ...base, years, monthly: contributionFor(years) })
      expect(path.peak).toBe(path.target)
    }
  })
})

describe('the marker the axis carries', () => {
  /*
    The control feeds itself: the marker sets the deadline, the deadline sets the
    instalment, the instalment sets how long money left alone would take, and
    that sets how wide the axis is. So the axis the marker stands on is an output
    of the marker's own position, and the loop has to be checked rather than
    assumed. A horizon that ever came back narrower than the year just chosen
    would snap the marker backwards under the finger.
  */
  const at = (years: number) =>
    buildGlidepath({
      target: 500_000_000_00n,
      monthly: monthlyContribution(500_000_000_00n, years * 12, 0.11).monthly,
      annualRate: 0.11,
      currentYear: 2026,
      years,
    })

  it('always keeps the year the marker was dropped on', () => {
    for (let years = 1; years <= MAX_HORIZON_YEARS; years += 1) {
      const path = at(years)
      expect(path.horizonYears, `${years} years fell off its own axis`).toBeGreaterThanOrEqual(
        years,
      )
      expect(path.points.at(-1)!.year).toBe(2026 + path.horizonYears)
    }
  })

  it('leaves somewhere to drag to, right up to the longest plan', () => {
    // Without headroom the marker would reach the right hand edge and stop, and
    // the only way on would be the number field it is meant to replace.
    for (let years = 1; years < MAX_HORIZON_YEARS; years += 1) {
      expect(at(years).horizonYears, `${years} years had nowhere further to go`).toBeGreaterThan(
        years,
      )
    }
    expect(at(MAX_HORIZON_YEARS).horizonYears).toBe(MAX_HORIZON_YEARS)
  })

  it('settles rather than running away when the marker is dragged out', () => {
    // Each step widens the axis, which offers a further year, which widens it
    // again. It has to converge on the cap instead of climbing for ever.
    let years = 1
    for (let step = 0; step < 60; step += 1) {
      years = Math.min(MAX_HORIZON_YEARS, at(years).horizonYears)
    }
    expect(years).toBe(MAX_HORIZON_YEARS)
  })
})
