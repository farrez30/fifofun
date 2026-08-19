import { describe, expect, it } from 'vitest'
import { assessRatios, type FinancialSnapshot } from './ratios'

/** A household that clears every threshold, used as the base for variations. */
const HEALTHY: FinancialSnapshot = {
  monthlyIncome: 10_000_000_00n,
  monthlyDebtService: 2_000_000_00n, // 20%, under the 30% ceiling
  monthlySavings: 1_500_000_00n, // 15%, over the 10% floor
  monthlyExpenses: 7_000_000_00n,
  liquidAssets: 42_000_000_00n, // exactly six months
  totalAssets: 200_000_000_00n,
  totalDebt: 60_000_000_00n, // 30% of assets, so 70% solvency
}

function pick(snapshot: FinancialSnapshot, id: string) {
  const result = assessRatios(snapshot).results.find((r) => r.threshold.id === id)
  if (!result) throw new Error(`No ratio ${id}`)
  return result
}

describe('assessRatios', () => {
  it('reports every published ratio', () => {
    const report = assessRatios(HEALTHY)
    expect(report.results.map((r) => r.threshold.id)).toEqual([
      'debt-service',
      'debt-to-asset',
      'savings',
      'liquidity',
      'solvency',
    ])
  })

  it('calls a sound household healthy and gives it nothing to fix', () => {
    const report = assessRatios(HEALTHY)
    expect(report.counts).toEqual({ healthy: 5, warning: 0, danger: 0 })
    expect(report.score).toBe(100)
    expect(report.weakest).toBeNull()
    expect(report.results.every((r) => r.target === null)).toBe(true)
  })

  it('treats a value exactly on the threshold as healthy', () => {
    // Thresholds are inclusive on the healthy side, so 30% debt service passes.
    const onTheLine = { ...HEALTHY, monthlyDebtService: 3_000_000_00n }
    expect(pick(onTheLine, 'debt-service').verdict).toBe('healthy')
  })

  it('separates warning from danger on the far side', () => {
    expect(pick({ ...HEALTHY, monthlyDebtService: 3_400_000_00n }, 'debt-service').verdict).toBe(
      'warning',
    )
    expect(pick({ ...HEALTHY, monthlyDebtService: 3_600_000_00n }, 'debt-service').verdict).toBe(
      'danger',
    )
  })

  it('reads higher-is-better ratios in the right direction', () => {
    // 4% saved is below the 5% warning line, so it is dangerous, not merely low.
    const thin = { ...HEALTHY, monthlySavings: 400_000_00n }
    expect(pick(thin, 'savings').verdict).toBe('danger')
    expect(pick({ ...HEALTHY, monthlySavings: 700_000_00n }, 'savings').verdict).toBe('warning')
  })

  describe('targets', () => {
    it('states how much to cut to reach the debt service ceiling', () => {
      const stretched = { ...HEALTHY, monthlyDebtService: 4_000_000_00n }
      const target = pick(stretched, 'debt-service').target
      // 30% of 10jt is 3jt, so 1jt has to go.
      expect(target).toEqual({
        field: 'monthlyDebtService',
        direction: 'decrease',
        amount: 1_000_000_00n,
      })
    })

    it('states how much more to save to reach the floor', () => {
      const thin = { ...HEALTHY, monthlySavings: 400_000_00n }
      expect(pick(thin, 'savings').target).toEqual({
        field: 'monthlySavings',
        direction: 'increase',
        amount: 600_000_00n,
      })
    })

    it('sizes the liquidity gap in months of actual expenses', () => {
      const thin = { ...HEALTHY, liquidAssets: 7_000_000_00n }
      // Six months of 7jt is 42jt, so 35jt is missing.
      expect(pick(thin, 'liquidity').target).toEqual({
        field: 'liquidAssets',
        direction: 'increase',
        amount: 35_000_000_00n,
      })
    })

    it('rounds a target up so applying it actually clears the threshold', () => {
      // 30% of an amount that does not divide evenly must round up, not down.
      const awkward: FinancialSnapshot = { ...HEALTHY, monthlyIncome: 3_333_333_33n }
      const target = pick({ ...awkward, monthlyDebtService: 2_000_000_00n }, 'debt-service').target
      expect(target).not.toBeNull()

      const after = { ...awkward, monthlyDebtService: 2_000_000_00n - target!.amount }
      expect(pick(after, 'debt-service').verdict).toBe('healthy')
    })

    it('expresses a solvency shortfall as debt to repay, since assets are not a lever', () => {
      const leveraged = { ...HEALTHY, totalDebt: 140_000_000_00n }
      const target = pick(leveraged, 'solvency').target
      // Half of 200jt is 100jt of net worth; the household has 60jt.
      expect(target).toEqual({
        field: 'totalDebt',
        direction: 'decrease',
        amount: 40_000_000_00n,
      })
    })
  })

  describe('missing inputs', () => {
    it('returns null rather than a misleading zero when income is unknown', () => {
      const noIncome = { ...HEALTHY, monthlyIncome: 0n }
      const result = pick(noIncome, 'debt-service')
      expect(result.value).toBeNull()
      expect(result.verdict).toBeNull()
      expect(result.target).toBeNull()
    })

    it('scores only the ratios it could compute', () => {
      const assetless: FinancialSnapshot = { ...HEALTHY, totalAssets: 0n }
      const report = assessRatios(assetless)
      // Debt-to-asset and solvency both divide by assets, leaving three.
      expect(report.counts.healthy + report.counts.warning + report.counts.danger).toBe(3)
      expect(report.score).toBe(100)
    })

    it('scores zero when nothing at all can be computed', () => {
      const empty: FinancialSnapshot = {
        monthlyIncome: 0n,
        monthlyDebtService: 0n,
        monthlySavings: 0n,
        monthlyExpenses: 0n,
        liquidAssets: 0n,
        totalAssets: 0n,
        totalDebt: 0n,
      }
      const report = assessRatios(empty)
      expect(report.score).toBe(0)
      expect(report.weakest).toBeNull()
    })
  })

  describe('weakest', () => {
    it('picks danger over warning', () => {
      const mixed: FinancialSnapshot = {
        ...HEALTHY,
        monthlyDebtService: 3_400_000_00n, // warning
        liquidAssets: 3_500_000_00n, // half a month, danger
      }
      expect(assessRatios(mixed).weakest?.threshold.id).toBe('liquidity')
    })

    it('picks the ratio furthest from its threshold when both are in the same band', () => {
      const mixed: FinancialSnapshot = {
        ...HEALTHY,
        monthlyDebtService: 3_100_000_00n, // 31%, just over
        monthlySavings: 600_000_00n, // 6%, well under the 10% floor
      }
      const weakest = assessRatios(mixed).weakest
      expect(weakest?.verdict).toBe('warning')
      expect(weakest?.threshold.id).toBe('savings')
    })
  })

  it('gives advice only where something is wrong', () => {
    const stretched = { ...HEALTHY, monthlyDebtService: 4_000_000_00n }
    expect(pick(stretched, 'debt-service').advice).toBeTruthy()
    expect(pick(stretched, 'savings').advice).toBeNull()
  })

  it('keeps precision on amounts large enough to break floating point', () => {
    const wealthy: FinancialSnapshot = {
      ...HEALTHY,
      totalAssets: 9_007_199_254_740_993_00n,
      totalDebt: 4_503_599_627_370_496_00n,
    }
    const ratio = pick(wealthy, 'debt-to-asset').value
    expect(ratio).toBeCloseTo(0.5, 6)
  })
})
