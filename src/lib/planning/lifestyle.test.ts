import { describe, expect, it } from 'vitest'
import {
  LIFESTYLE_TEMPLATES,
  compareLifestyles,
  deriveLifestyle,
  median,
  scaleLifestyle,
  templateProfile,
  type MonthSpend,
} from './lifestyle'

describe('median', () => {
  it('returns zero for nothing', () => {
    expect(median([])).toBe(0n)
  })

  it('takes the middle of an odd count', () => {
    expect(median([3n, 1n, 2n])).toBe(2n)
  })

  it('takes the lower middle of an even count rather than averaging', () => {
    // Averaging would reintroduce sensitivity to an extreme value, which is the
    // entire reason for using a median here.
    expect(median([1n, 2n, 3n, 1000n])).toBe(2n)
  })

  it('ignores an extreme value entirely', () => {
    expect(median([80_500_00n, 75_000_00n, 4_801_400_00n])).toBe(80_500_00n)
  })

  it('does not mutate its input', () => {
    const values = [3n, 1n, 2n]
    median(values)
    expect(values).toEqual([3n, 1n, 2n])
  })
})

/** Three months where Jajan blew up once, the real case from the spreadsheet. */
const HISTORY: MonthSpend[] = [
  {
    month: '2026-01',
    byCategory: { Jajan: 80_500_00n, 'Makan/minum': 2_000_000_00n, Transport: 500_000_00n },
  },
  {
    month: '2026-02',
    byCategory: { Jajan: 75_000_00n, 'Makan/minum': 2_100_000_00n, Transport: 480_000_00n },
  },
  {
    month: '2026-03',
    byCategory: { Jajan: 4_801_400_00n, 'Makan/minum': 1_900_000_00n, Transport: 520_000_00n },
  },
]

describe('deriveLifestyle', () => {
  it('is not dragged upward by a single blown month', () => {
    const derived = deriveLifestyle(HISTORY)
    // The mean would be about Rp1,65jt. The median is what a normal month costs.
    expect(derived.byCategory.Jajan).toBe(80_500_00n)
  })

  it('names the blown month instead of silently absorbing it', () => {
    const derived = deriveLifestyle(HISTORY)
    expect(derived.outliers).toHaveLength(1)
    expect(derived.outliers[0]).toMatchObject({
      category: 'Jajan',
      month: '2026-03',
      amount: 4_801_400_00n,
      typical: 80_500_00n,
    })
    expect(derived.outliers[0].multiple).toBeGreaterThan(59)
  })

  it('counts a month with no entry for a category as a zero', () => {
    const occasional: MonthSpend[] = [
      { month: '2026-01', byCategory: { Hiburan: 900_000_00n } },
      { month: '2026-02', byCategory: {} },
      { month: '2026-03', byCategory: {} },
    ]
    // Dropping the empty months would claim Rp900.000 is a normal month for a
    // category that is spent on once a quarter.
    const derived = deriveLifestyle(occasional, { floor: 0n })
    expect(derived.byCategory.Hiburan ?? 0n).toBe(0n)
  })

  it('uses only the most recent window', () => {
    const long: MonthSpend[] = Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      byCategory: { Transport: BigInt(i + 1) * 100_000_00n },
    }))
    const derived = deriveLifestyle(long, { months: 3 })
    expect(derived.monthsUsed).toBe(3)
    // Months 10, 11 and 12, whose median is the eleventh.
    expect(derived.byCategory.Transport).toBe(1_100_000_00n)
  })

  it('drops categories below the noise floor', () => {
    const noisy: MonthSpend[] = [
      { month: '2026-01', byCategory: { Parkir: 5_000_00n, Transport: 500_000_00n } },
      { month: '2026-02', byCategory: { Parkir: 4_000_00n, Transport: 500_000_00n } },
    ]
    const derived = deriveLifestyle(noisy)
    expect(derived.byCategory.Parkir).toBeUndefined()
    expect(derived.byCategory.Transport).toBe(500_000_00n)
  })

  it('totals only what it kept', () => {
    const derived = deriveLifestyle(HISTORY)
    const sum = Object.values(derived.byCategory).reduce((a, b) => a + b, 0n)
    expect(derived.total).toBe(sum)
  })

  it('handles an empty history without throwing', () => {
    const derived = deriveLifestyle([])
    expect(derived.monthsUsed).toBe(0)
    expect(derived.total).toBe(0n)
    expect(derived.outliers).toEqual([])
  })

  it('marks its origin so a derived profile is never confused with a template', () => {
    expect(deriveLifestyle(HISTORY).origin).toBe('history')
    expect(templateProfile('seimbang').origin).toBe('template')
  })
})

describe('templates', () => {
  it('gets more expensive with every tier', () => {
    const totals = LIFESTYLE_TEMPLATES.map((t) => templateProfile(t.id).total)
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1])
    }
  })

  it('rejects an unknown tier rather than returning an empty profile', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => templateProfile('mewah')).toThrow(/Unknown lifestyle template/)
  })

  it('hands back a copy, so editing one profile cannot alter the template', () => {
    const first = templateProfile('hemat')
    first.byCategory.Jajan = 999_999_00n
    expect(templateProfile('hemat').byCategory.Jajan).toBe(200_000_00n)
  })
})

describe('scaleLifestyle', () => {
  it('costs a couple half again as much as one person, not double', () => {
    const one = templateProfile('seimbang')
    const two = scaleLifestyle(one, 2, 0)
    expect(two.multiplier).toBe(1.5)
    expect(two.scaled.total).toBe((one.total * 15_000n) / 10_000n)
  })

  it('offers the naive doubling for comparison', () => {
    const one = templateProfile('seimbang')
    expect(scaleLifestyle(one, 2, 0, 'naive-double').multiplier).toBe(2)
  })

  it('adds 0,3 for each child', () => {
    const one = templateProfile('hemat')
    expect(scaleLifestyle(one, 2, 2).multiplier).toBe(2.1)
  })

  it('leaves a single adult untouched', () => {
    const one = templateProfile('nyaman')
    const scaled = scaleLifestyle(one, 1, 0)
    expect(scaled.multiplier).toBe(1)
    expect(scaled.scaled.total).toBe(one.total)
  })
})

describe('compareLifestyles', () => {
  it('reports what moving between tiers costs per month', () => {
    const from = templateProfile('hemat')
    const to = templateProfile('nyaman')
    const comparison = compareLifestyles(from, to)
    expect(comparison.monthlyDifference).toBe(to.total - from.total)
    expect(comparison.monthlyDifference).toBeGreaterThan(0n)
  })

  it('includes categories present on only one side', () => {
    const comparison = compareLifestyles(templateProfile('hemat'), templateProfile('nyaman'))
    const bensin = comparison.deltas.find((d) => d.category === 'Bensin')
    expect(bensin?.current).toBe(0n)
    expect(bensin?.target).toBe(700_000_00n)
  })

  it('folds a renamed category onto the need it belongs to', () => {
    // Hemat pays for a kos, nyaman for a kontrakan. That is one housing line
    // going up, not one line vanishing and another appearing.
    const comparison = compareLifestyles(templateProfile('hemat'), templateProfile('nyaman'))
    expect(comparison.deltas.some((d) => d.category === 'Kosan')).toBe(false)
    expect(comparison.deltas.some((d) => d.category === 'Kontrakan')).toBe(false)

    const housing = comparison.deltas.find((d) => d.category === 'Tempat tinggal')!
    expect(housing.current).toBe(1_200_000_00n)
    expect(housing.target).toBe(4_000_000_00n)
    expect(housing.difference).toBe(2_800_000_00n)
  })

  it('adds up two aliases that both appear in the same profile', () => {
    const both = {
      origin: 'custom' as const,
      label: 'Pindahan',
      byCategory: { Kosan: 1_000_000_00n, Kontrakan: 2_000_000_00n },
      total: 3_000_000_00n,
    }
    const comparison = compareLifestyles(both, templateProfile('hemat'))
    const housing = comparison.deltas.find((d) => d.category === 'Tempat tinggal')!
    expect(housing.current).toBe(3_000_000_00n)
  })

  it('puts the largest movement first, in either direction', () => {
    const comparison = compareLifestyles(templateProfile('premium'), templateProfile('hemat'))
    const magnitudes = comparison.deltas.map((d) => (d.difference < 0n ? -d.difference : d.difference))
    for (let i = 1; i < magnitudes.length; i += 1) {
      expect(magnitudes[i]).toBeLessThanOrEqual(magnitudes[i - 1])
    }
  })

  it('reports a downgrade as a negative difference', () => {
    const comparison = compareLifestyles(templateProfile('premium'), templateProfile('hemat'))
    expect(comparison.monthlyDifference).toBeLessThan(0n)
  })
})
