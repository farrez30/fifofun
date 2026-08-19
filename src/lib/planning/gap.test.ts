import { describe, expect, it } from 'vitest'
import { analyseGap, monthsUntilClosed, planCuts, type GapInput } from './gap'
import { templateProfile } from './lifestyle'

/** Short by Rp2jt a month: needs Rp10jt, earns Rp8jt. */
const SHORT: GapInput = {
  currentIncome: 8_000_000_00n,
  currentSpending: 7_500_000_00n,
  targetSpending: 8_000_000_00n,
  targetSavings: 2_000_000_00n,
}

describe('analyseGap', () => {
  it('sizes the gap as everything the plan needs against what comes in', () => {
    const gap = analyseGap(SHORT)
    expect(gap.required).toBe(10_000_000_00n)
    expect(gap.available).toBe(8_000_000_00n)
    expect(gap.monthlyGap).toBe(2_000_000_00n)
    expect(gap.closed).toBe(false)
  })

  it('reports a plan that already fits as closed, with the room left over', () => {
    const comfortable = analyseGap({ ...SHORT, currentIncome: 12_000_000_00n })
    expect(comfortable.closed).toBe(true)
    expect(comfortable.monthlyGap).toBe(0n)
    expect(comfortable.surplus).toBe(2_000_000_00n)
    expect(comfortable.byIncome).toBeNull()
    expect(comfortable.bySpending).toBeNull()
  })

  it('treats income exactly equal to the requirement as closed', () => {
    const exact = analyseGap({ ...SHORT, currentIncome: 10_000_000_00n })
    expect(exact.closed).toBe(true)
    expect(exact.surplus).toBe(0n)
  })

  describe('the income route', () => {
    it('asks for exactly the gap, and states it as a percentage', () => {
      const gap = analyseGap(SHORT)
      expect(gap.byIncome!.extraNeeded).toBe(2_000_000_00n)
      expect(gap.byIncome!.percentIncrease).toBe(25)
    })
  })

  describe('the spending route', () => {
    it('cuts exactly the gap when there is room', () => {
      const gap = analyseGap({ ...SHORT, spendingFloor: 4_000_000_00n })
      expect(gap.bySpending!.cutNeeded).toBe(2_000_000_00n)
      expect(gap.bySpending!.feasible).toBe(true)
      expect(gap.bySpending!.shortfall).toBe(0n)
      expect(gap.bySpending!.percentCut).toBe(25)
    })

    it('refuses to recommend a cut below the floor', () => {
      // Only Rp500.000 of room, against a Rp2jt gap.
      const gap = analyseGap({ ...SHORT, spendingFloor: 7_500_000_00n })
      expect(gap.bySpending!.feasible).toBe(false)
      expect(gap.bySpending!.cutNeeded).toBe(500_000_00n)
      expect(gap.bySpending!.shortfall).toBe(1_500_000_00n)
      expect(gap.bySpending!.reason).toMatch(/tidak bisa menutup/)
    })

    it('is infeasible when the floor is already at or above the target', () => {
      const gap = analyseGap({ ...SHORT, spendingFloor: 9_000_000_00n })
      expect(gap.bySpending!.cutNeeded).toBe(0n)
      expect(gap.bySpending!.feasible).toBe(false)
      expect(gap.bySpending!.shortfall).toBe(2_000_000_00n)
    })

    it('assumes no floor when none is given, rather than inventing one', () => {
      const gap = analyseGap(SHORT)
      expect(gap.bySpending!.feasible).toBe(true)
    })
  })

  describe('the balanced route', () => {
    it('splits the gap in two', () => {
      const gap = analyseGap(SHORT)
      expect(gap.balanced!.extraIncome).toBe(1_000_000_00n)
      expect(gap.balanced!.spendingCut).toBe(1_000_000_00n)
    })

    it('never loses a sen to rounding on an odd gap', () => {
      const odd = analyseGap({ ...SHORT, currentIncome: 8_000_000_00n - 1n })
      const { extraIncome, spendingCut } = odd.balanced!
      expect(extraIncome + spendingCut).toBe(odd.monthlyGap)
    })
  })
})

describe('planCuts', () => {
  it('names the categories that would fund the cut, largest first', () => {
    const { candidates } = planCuts(
      templateProfile('nyaman'),
      templateProfile('seimbang'),
      2_000_000_00n,
    )
    const amounts = candidates.map((c) => Number(c.saves))
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('says when the downgrade covers the gap and when it does not', () => {
    const generous = planCuts(templateProfile('nyaman'), templateProfile('hemat'), 1_000_000_00n)
    expect(generous.enough).toBe(true)

    const impossible = planCuts(
      templateProfile('seimbang'),
      templateProfile('nyaman'),
      1_000_000_00n,
    )
    expect(impossible.enough).toBe(false)
  })

  it('lists nothing when the target costs more than the current life', () => {
    const { candidates, covered } = planCuts(
      templateProfile('hemat'),
      templateProfile('premium'),
      1_000_000_00n,
    )
    expect(candidates).toEqual([])
    expect(covered).toBe(0n)
  })

  it('states each category as a share of the gap', () => {
    const { candidates } = planCuts(
      templateProfile('nyaman'),
      templateProfile('hemat'),
      10_000_000_00n,
    )
    for (const candidate of candidates) {
      expect(candidate.shareOfGap).toBeGreaterThan(0)
    }
  })

  it('does not divide by a gap of zero', () => {
    const { candidates } = planCuts(templateProfile('nyaman'), templateProfile('hemat'), 0n)
    expect(candidates.every((c) => c.shareOfGap === 0)).toBe(true)
  })
})

describe('monthsUntilClosed', () => {
  it('closes eventually when income outgrows costs', () => {
    const projection = monthsUntilClosed(SHORT, 0.08, 0.035, { fromYear: 2026 })
    expect(projection.months).not.toBeNull()
    expect(projection.year).toBeGreaterThan(2026)
  })

  it('never closes when both grow at the same rate', () => {
    const projection = monthsUntilClosed(SHORT, 0.05, 0.05)
    expect(projection.months).toBeNull()
    expect(projection.reason).toMatch(/tetap di tempat/)
  })

  it('widens rather than closes when costs outgrow income', () => {
    const projection = monthsUntilClosed(SHORT, 0.03, 0.08)
    expect(projection.months).toBeNull()
    expect(projection.reason).toMatch(/melebar/)
  })

  it('is immediate when the plan already fits', () => {
    const projection = monthsUntilClosed(
      { ...SHORT, currentIncome: 20_000_000_00n },
      0.08,
      0.035,
      { fromYear: 2026 },
    )
    expect(projection.months).toBe(0)
    expect(projection.year).toBe(2026)
  })

  it('closes sooner the faster income grows', () => {
    const slow = monthsUntilClosed(SHORT, 0.05, 0.035)
    const fast = monthsUntilClosed(SHORT, 0.15, 0.035)
    expect(fast.months!).toBeLessThan(slow.months!)
  })

  it('gives up rather than projecting past the horizon', () => {
    // A hair above cost inflation would take centuries.
    const projection = monthsUntilClosed(SHORT, 0.0351, 0.035, { maxYears: 10 })
    expect(projection.months).toBeNull()
    expect(projection.reason).toMatch(/tidak menutup dalam 10 tahun/)
  })

  it('omits a calendar year when it was not given a starting one', () => {
    expect(monthsUntilClosed(SHORT, 0.08, 0.035).year).toBeNull()
  })
})
