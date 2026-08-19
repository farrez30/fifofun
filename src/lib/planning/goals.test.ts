import { describe, expect, it } from 'vitest'
import { HAJJ } from './constants'
import {
  futureValue,
  hajjPlan,
  inflateTo,
  monthlyContribution,
  monthlyRate,
  monthsToReach,
  presentValue,
  scaleBy,
  suggestInstrument,
} from './goals'

/**
 * An independent month-by-month simulation, used to check the closed-form
 * answers rather than restating them. Contributions land at the end of the
 * month, matching the ordinary annuity the module documents.
 */
function simulate(monthly: bigint, months: number, annualRate: number, starting = 0n): bigint {
  const rate = monthlyRate(annualRate)
  let balance = starting
  for (let month = 0; month < months; month += 1) {
    balance = scaleBy(balance, 1 + rate) + monthly
  }
  return balance
}

describe('monthlyRate', () => {
  it('compounds back to the annual rate it came from', () => {
    for (const annual of [0.025, 0.045, 0.09, 0.11]) {
      expect(Math.pow(1 + monthlyRate(annual), 12) - 1).toBeCloseTo(annual, 12)
    }
  })

  it('is lower than the annual rate divided by twelve', () => {
    // This is the whole point of using it. Dividing by twelve treats a compound
    // annual rate as a nominal one and quietly overstates every projection.
    expect(monthlyRate(0.11)).toBeLessThan(0.11 / 12)
  })

  it('is zero when the rate is zero', () => {
    expect(monthlyRate(0)).toBe(0)
  })
})

describe('scaleBy', () => {
  it('refuses a factor that is not a finite number', () => {
    expect(() => scaleBy(100n, Number.NaN)).toThrow(/finite/)
    expect(() => scaleBy(100n, Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })

  it('refuses a factor too large to apply without losing precision', () => {
    expect(() => scaleBy(100n, 1e9)).toThrow(/too large/)
  })

  it('keeps large amounts exact', () => {
    expect(scaleBy(1_000_000_000_000_00n, 2)).toBe(2_000_000_000_000_00n)
  })
})

describe('futureValue and presentValue', () => {
  it('doubles at roughly the rule of 72', () => {
    // 7,2% for ten years should land near twice the starting amount.
    const doubled = futureValue(10_000_000_00n, 0.072, 10)
    expect(Number(doubled) / Number(10_000_000_00n)).toBeCloseTo(2, 1)
  })

  it('leaves an amount alone over zero years', () => {
    expect(futureValue(1_234_567_00n, 0.1, 0)).toBe(1_234_567_00n)
    expect(presentValue(1_234_567_00n, 0.1, 0)).toBe(1_234_567_00n)
  })

  it('undoes itself', () => {
    const today = 50_000_000_00n
    const later = futureValue(today, 0.1, 18)
    // Integer truncation costs at most a few sen over eighteen years.
    expect(Number(presentValue(later, 0.1, 18) - today)).toBeLessThan(100)
  })

  it('rejects negative time', () => {
    expect(() => futureValue(100n, 0.1, -1)).toThrow(/negative/)
    expect(() => presentValue(100n, 0.1, -1)).toThrow(/negative/)
  })

  it('shows what education inflation does to a university bill', () => {
    // Rp19jt a year today, for a child born this year, at 10%.
    const atEighteen = futureValue(19_010_000_00n, 0.1, 18)
    expect(atEighteen).toBeGreaterThan(100_000_000_00n)
  })
})

describe('inflateTo', () => {
  it('prices something in the year it falls due', () => {
    expect(inflateTo(1_000_000_00n, 2036, 2026, 0.035)).toBe(futureValue(1_000_000_00n, 0.035, 10))
  })

  it('does not discount a cost already in the past', () => {
    expect(inflateTo(1_000_000_00n, 2020, 2026)).toBe(1_000_000_00n)
  })
})

describe('monthlyContribution', () => {
  it('reaches the target when simulated month by month', () => {
    const plan = monthlyContribution(500_000_000_00n, 240, 0.09)
    const ending = simulate(plan.monthly, 240, 0.09)
    expect(ending).toBeGreaterThanOrEqual(plan.target)
  })

  it('does not overshoot by more than one instalment', () => {
    const plan = monthlyContribution(500_000_000_00n, 240, 0.09)
    const ending = simulate(plan.monthly, 240, 0.09)
    expect(ending - plan.target).toBeLessThan(plan.monthly)
  })

  it('needs less each month than plain saving once returns are involved', () => {
    const plan = monthlyContribution(500_000_000_00n, 240, 0.09)
    expect(plan.monthly).toBeLessThan(plan.monthlyWithoutReturns)
    expect(plan.fromReturns).toBeGreaterThan(0n)
  })

  it('falls back to plain division at a zero rate', () => {
    const plan = monthlyContribution(1_200_000_00n, 12, 0)
    expect(plan.monthly).toBe(100_000_00n)
    expect(plan.fromReturns).toBe(0n)
    expect(plan.monthly).toBe(plan.monthlyWithoutReturns)
  })

  it('rounds up, because a plan that lands short is a plan that failed', () => {
    // Rp1.000.001 over three months does not divide evenly.
    const plan = monthlyContribution(1_000_001n, 3, 0)
    expect(plan.monthly * 3n).toBeGreaterThanOrEqual(1_000_001n)
  })

  it('asks for nothing when the money is already there', () => {
    const plan = monthlyContribution(10_000_000_00n, 60, 0.05, 10_000_000_00n)
    expect(plan.monthly).toBe(0n)
  })

  it('counts growth on what is already saved', () => {
    const withBalance = monthlyContribution(100_000_000_00n, 120, 0.07, 20_000_000_00n)
    const without = monthlyContribution(100_000_000_00n, 120, 0.07)
    expect(withBalance.monthly).toBeLessThan(without.monthly)
  })

  it('rejects a plan with no months in it', () => {
    expect(() => monthlyContribution(100n, 0)).toThrow(/at least one month/)
    expect(() => monthlyContribution(100n, -5)).toThrow(/at least one month/)
  })
})

describe('monthsToReach', () => {
  it('agrees with the contribution it was solved from', () => {
    const plan = monthlyContribution(500_000_000_00n, 240, 0.09)
    const months = monthsToReach(plan.target, plan.monthly, 0.09)
    // Rounding the instalment up buys back at most a month.
    expect(months).toBeGreaterThanOrEqual(239)
    expect(months).toBeLessThanOrEqual(240)
  })

  it('is plain division when nothing grows', () => {
    expect(monthsToReach(1_200_000_00n, 100_000_00n, 0)).toBe(12)
  })

  it('rounds up a partial final month', () => {
    expect(monthsToReach(1_000_000_00n, 300_000_00n, 0)).toBe(4)
  })

  it('is zero when the target is already met', () => {
    expect(monthsToReach(1_000_000_00n, 100_000_00n, 0, 1_000_000_00n)).toBe(0)
  })

  it('says never rather than infinity when nothing is being put in', () => {
    expect(monthsToReach(1_000_000_00n, 0n, 0)).toBeNull()
    expect(monthsToReach(1_000_000_00n, 0n, 0, 0n)).toBeNull()
  })

  it('still gets there on growth alone when a balance exists', () => {
    const months = monthsToReach(20_000_000_00n, 0n, 0.1, 10_000_000_00n)
    expect(months).not.toBeNull()
    // Doubling at 10% takes a bit over seven years.
    expect(months!).toBeGreaterThan(80)
    expect(months!).toBeLessThan(95)
  })
})

describe('suggestInstrument', () => {
  it('keeps money that is needed soon out of anything volatile', () => {
    const soon = suggestInstrument(6)
    expect(['deposito', 'rd-pasar-uang']).toContain(soon.instrument.id)
  })

  it('allows equity once the horizon is long', () => {
    expect(suggestInstrument(120).instrument.id).toBe('rd-saham')
  })

  it('does not fall back to a deposit account for a thirty-year goal', () => {
    // Longer than every published window, so the fallback has to be the longest
    // horizon rather than the first entry in the list.
    const chosen = suggestInstrument(80 * 12).instrument
    expect(chosen.id).not.toBe('deposito')
    expect(chosen.horizonYears[1]).toBe(50)
  })

  it('always explains itself', () => {
    for (const months of [3, 24, 48, 240]) {
      expect(suggestInstrument(months).rationale.length).toBeGreaterThan(40)
    }
  })
})

describe('hajjPlan', () => {
  it('separates the deposit from the balance', () => {
    const plan = hajjPlan(2_000_000_00n, 2026)
    expect(plan.depositTarget).toBe(HAJJ.initialDeposit.value)
    expect(plan.balanceDue).toBe(HAJJ.totalBipih.value - HAJJ.initialDeposit.value)
  })

  it('dates departure from when the queue is joined, not from today', () => {
    const plan = hajjPlan(1_000_000_00n, 2026)
    expect(plan.queueEntryYear).toBeGreaterThan(2026)
    const [minWait, maxWait] = HAJJ.waitingYears.value
    expect(plan.departureYears).toEqual([
      plan.queueEntryYear! + minWait,
      plan.queueEntryYear! + maxWait,
    ])
  })

  it('joins the queue this year when the deposit is already saved', () => {
    const plan = hajjPlan(0n, 2026, { alreadySaved: HAJJ.initialDeposit.value })
    expect(plan.monthsToDeposit).toBe(0)
    expect(plan.queueEntryYear).toBe(2026)
  })

  it('moves departure earlier when more goes in each month', () => {
    const slow = hajjPlan(500_000_00n, 2026)
    const fast = hajjPlan(3_000_000_00n, 2026)
    expect(fast.monthsToDeposit!).toBeLessThan(slow.monthsToDeposit!)
    expect(fast.departureYears![0]).toBeLessThanOrEqual(slow.departureYears![0])
  })

  it('reports no queue at all when nothing is being saved', () => {
    const plan = hajjPlan(0n, 2026)
    expect(plan.monthsToDeposit).toBeNull()
    expect(plan.queueEntryYear).toBeNull()
    expect(plan.departureYears).toBeNull()
    expect(plan.insight).toMatch(/queue/i)
  })

  it('prices the balance in the money of the departure year, not today', () => {
    const plan = hajjPlan(2_000_000_00n, 2026)
    expect(plan.balanceAtDeparture!).toBeGreaterThan(plan.balanceDue)
  })

  it('spreads the balance across the wait rather than demanding it up front', () => {
    const plan = hajjPlan(2_000_000_00n, 2026)
    expect(plan.monthsInQueue).toBe(HAJJ.waitingYears.value[0] * 12)
    expect(plan.monthlyForBalance!).toBeLessThan(plan.balanceAtDeparture!)
    expect(plan.monthlyForBalance!).toBeGreaterThan(0n)
  })

  it('says why the deposit outranks a larger goal', () => {
    expect(hajjPlan(2_000_000_00n, 2026).insight).toMatch(/forward/i)
  })
})

describe('suggestInstrument ordering', () => {
  it('does not depend on the order instruments are declared in', () => {
    // A four-year goal has both a balanced fund and gold available at the same
    // expected return. The tie has to resolve to the one published for that
    // horizon, not to whichever happens to sit later in the array.
    expect(suggestInstrument(48).instrument.id).toBe('rd-campuran')
  })
})
