import { describe, expect, it } from 'vitest'
import { parseIdAmount } from '@/lib/money'
import { FRAMEWORKS } from './constants'
import {
  allocateIncome,
  applyShare,
  emergencyFundMonths,
  emergencyFundTarget,
  getFramework,
  householdScaling,
  marriageComparison,
  recommendFramework,
} from './allocation'

const INCOME = parseIdAmount('10.000.000,00')

describe('framework data', () => {
  it('divides income exactly once where the framework is a partition', () => {
    for (const framework of FRAMEWORKS.filter((f) => f.partition)) {
      const sum = framework.buckets.reduce((total, bucket) => total + bucket.share, 0)
      expect(Math.round(sum * 100), framework.id).toBe(100)
    }
  })

  it('allows bound-style frameworks to overlap past 100%', () => {
    // QM states floors and ceilings rather than slices, so its shares are meant
    // to overlap. Rendering it as a pie chart would be wrong.
    const qm = getFramework('qm-1234')
    expect(qm.partition).toBe(false)
    const sum = qm.buckets.reduce((total, bucket) => total + bucket.share, 0)
    expect(sum).toBeGreaterThan(1)
  })

  it('gives every framework a source and a note on who it suits', () => {
    for (const framework of FRAMEWORKS) {
      expect(framework.origin, framework.id).not.toBe('')
      expect(framework.suitsWhen, framework.id).not.toBe('')
    }
  })

  it('labels the ZAPFIN percentages as an adaptation', () => {
    // ZAP Finance never published a canonical table, so the app must not imply
    // that these exact figures came from them.
    const zapfin = getFramework('zapfin')
    expect(zapfin.name).toContain('adaptasi')
    expect(zapfin.caveat).toBeTruthy()
  })
})

describe('applyShare', () => {
  it('keeps money in integer arithmetic', () => {
    expect(applyShare(parseIdAmount('10.000.000,00'), 0.5)).toBe(parseIdAmount('5.000.000,00'))
    expect(applyShare(parseIdAmount('10.000.000,00'), 0.025)).toBe(parseIdAmount('250.000,00'))
  })

  it('does not drift on amounts that would break float maths', () => {
    const large = parseIdAmount('999.999.999.999,99')
    expect(applyShare(large, 0.5) * 2n).toBeLessThanOrEqual(large)
  })
})

describe('allocateIncome', () => {
  it('splits income according to the chosen framework', () => {
    const allocation = allocateIncome(INCOME, '50-30-20')
    const byKey = Object.fromEntries(allocation.buckets.map((b) => [b.key, b.amount]))

    expect(byKey.needs).toBe(parseIdAmount('5.000.000,00'))
    expect(byKey.wants).toBe(parseIdAmount('3.000.000,00'))
    expect(byKey.savings).toBe(parseIdAmount('2.000.000,00'))
  })

  it('never loses more than rounding to the parts', () => {
    // An awkward income that does not divide cleanly.
    const allocation = allocateIncome(parseIdAmount('7.777.777,77'), 'ojk-10-20-30-40')
    expect(allocation.unallocated).toBeGreaterThanOrEqual(0n)
    expect(allocation.unallocated).toBeLessThan(BigInt(allocation.buckets.length))
  })

  it('marks floors and ceilings rather than presenting every figure as a target', () => {
    const allocation = allocateIncome(INCOME, '40-30-20-10')
    const debt = allocation.buckets.find((b) => b.key === 'debt')!
    const savings = allocation.buckets.find((b) => b.key === 'savings')!

    expect(debt.maxAmount).toBe(parseIdAmount('3.000.000,00'))
    expect(debt.minAmount).toBeNull()
    expect(savings.minAmount).toBe(parseIdAmount('2.000.000,00'))
    expect(savings.maxAmount).toBeNull()
  })

  it('explains every figure it produces', () => {
    for (const bucket of allocateIncome(INCOME, 'zapfin').buckets) {
      expect(bucket.rationale.length).toBeGreaterThan(20)
    }
  })

  it('rejects a negative income instead of producing nonsense', () => {
    expect(() => allocateIncome(-1n, '50-30-20')).toThrow()
  })

  it('rejects an unknown framework', () => {
    expect(() => allocateIncome(INCOME, 'nope')).toThrow()
  })
})

describe('recommendFramework', () => {
  it('puts irregular income on floors and ceilings, not fixed percentages', () => {
    const result = recommendFramework({ adults: 1, children: 0, irregularIncome: true })
    expect(result.framework.id).toBe('qm-1234')
    expect(result.reason).toContain('enam bulan')
  })

  it('prefers the framework that budgets instalments explicitly when debt is heavy', () => {
    const result = recommendFramework({ adults: 2, children: 1, debtServiceRatio: 0.25 })
    expect(result.framework.id).toBe('40-30-20-10')
  })

  it('offers ZAPFIN when zakat should be its own bucket', () => {
    const result = recommendFramework({ adults: 2, children: 0, wantsZakatBucket: true })
    expect(result.framework.id).toBe('zapfin')
  })

  it('keeps it simplest for a single earner with no dependants', () => {
    expect(recommendFramework({ adults: 1, children: 0 }).framework.id).toBe('50-30-20')
  })

  it('always offers the alternatives it did not pick', () => {
    const result = recommendFramework({ adults: 1, children: 0 })
    expect(result.alternatives).toHaveLength(FRAMEWORKS.length - 1)
  })
})

describe('householdScaling', () => {
  it('costs a couple about one and a half people, not two', () => {
    expect(householdScaling(2, 0).multiplier).toBe(1.5)
  })

  it('adds 0,3 per child', () => {
    expect(householdScaling(2, 1).multiplier).toBe(1.8)
    expect(householdScaling(2, 2).multiplier).toBe(2.1)
  })

  it('still offers the naive doubling so the difference is visible', () => {
    expect(householdScaling(2, 0, 'naive-double').multiplier).toBe(2)
    expect(householdScaling(2, 2, 'naive-double').multiplier).toBe(4)
  })

  it('supports the square root scale', () => {
    expect(householdScaling(2, 0, 'square-root').multiplier).toBeCloseTo(1.414, 3)
  })

  it('explains itself in every mode', () => {
    for (const method of ['oecd-modified', 'naive-double', 'square-root'] as const) {
      expect(householdScaling(2, 1, method).explanation.length).toBeGreaterThan(40)
    }
  })

  it('refuses a household with no adults', () => {
    expect(() => householdScaling(0, 2)).toThrow()
  })
})

describe('marriageComparison', () => {
  it('shows sharing a household as a saving rather than a doubling', () => {
    const result = marriageComparison(parseIdAmount('5.000.000,00'))
    expect(result.separateTotal).toBe(parseIdAmount('10.000.000,00'))
    expect(result.togetherCost).toBe(parseIdAmount('7.500.000,00'))
    expect(result.saving).toBe(parseIdAmount('2.500.000,00'))
    expect(result.savingPercent).toBeCloseTo(25, 1)
  })

  it('shrinks the saving as children are added', () => {
    const noKids = marriageComparison(parseIdAmount('5.000.000,00'), 0)
    const twoKids = marriageComparison(parseIdAmount('5.000.000,00'), 2)
    expect(twoKids.togetherCost).toBeGreaterThan(noKids.togetherCost)
    expect(twoKids.saving).toBeLessThan(noKids.saving)
  })
})

describe('emergency fund', () => {
  it('scales with how many people depend on the income', () => {
    expect(emergencyFundMonths({ adults: 1, children: 0 })).toBe(4)
    expect(emergencyFundMonths({ adults: 2, children: 0 })).toBe(6)
    expect(emergencyFundMonths({ adults: 2, children: 1 })).toBe(9)
    expect(emergencyFundMonths({ adults: 2, children: 2 })).toBe(12)
  })

  it('treats irregular income as the most demanding case', () => {
    expect(emergencyFundMonths({ adults: 1, children: 0, irregularIncome: true })).toBe(12)
  })

  it('computes the target and says why that many months', () => {
    const target = emergencyFundTarget(parseIdAmount('8.000.000,00'), { adults: 2, children: 1 })
    expect(target.months).toBe(9)
    expect(target.amount).toBe(parseIdAmount('72.000.000,00'))
    expect(target.rationale).toContain('anak bergantung')
    expect(target.rationale).toContain('tiga bulan')
  })
})
