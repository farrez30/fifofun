import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { findPeriodicCosts } from './periodic'
import type { MonthCategoryTotals } from './categories'

/** Twelve months where only the named categories spend anything. */
function months(spec: Record<string, Record<string, bigint>>): MonthCategoryTotals[] {
  return Object.entries(spec).map(([month, byCategory]) => ({ month, byCategory }))
}

describe('findPeriodicCosts', () => {
  it('reads a yearly cost as a twelfth of itself each month', () => {
    const history = months({
      '2025-08': { pajak: idr('1.200.000,00') },
      '2025-09': { makan: idr('2.000.000,00') },
      '2026-08': { pajak: idr('1.200.000,00') },
    })

    expect(findPeriodicCosts(history)).toEqual([
      {
        categoryId: 'pajak',
        gapMonths: 12,
        typical: idr('1.200.000,00'),
        monthly: idr('1.200.000,00') / 12n,
      },
    ])
  })

  it('leaves an ordinary monthly cost alone', () => {
    const history = months({
      '2026-05': { makan: idr('2.000.000,00') },
      '2026-06': { makan: idr('2.100.000,00') },
      '2026-07': { makan: idr('1.900.000,00') },
    })
    expect(findPeriodicCosts(history)).toEqual([])
  })

  it('says nothing about a cost that has only arrived once', () => {
    const history = months({ '2026-07': { pajak: idr('1.200.000,00') } })
    expect(findPeriodicCosts(history)).toEqual([])
  })

  it('counts calendar months, not entries, across gaps with no data at all', () => {
    // The rollup omits months with no spending; the gap is still six months.
    const history = months({
      '2026-01': { asuransi: idr('600.000,00') },
      '2026-07': { asuransi: idr('600.000,00') },
    })
    const [found] = findPeriodicCosts(history)
    expect(found.gapMonths).toBe(6)
    expect(found.monthly).toBe(idr('600.000,00') / 6n)
  })

  it('ranks the heaviest monthly reserve first', () => {
    const history = months({
      '2025-08': { pajak: idr('1.200.000,00'), domain: idr('180.000,00') },
      '2026-08': { pajak: idr('1.200.000,00'), domain: idr('180.000,00') },
    })
    expect(findPeriodicCosts(history).map((cost) => cost.categoryId)).toEqual(['pajak', 'domain'])
  })

  it('only reads the recent window', () => {
    const history = months({
      '2020-01': { lama: idr('900.000,00') },
      '2020-06': { lama: idr('900.000,00') },
      '2026-06': { makan: idr('2.000.000,00') },
      '2026-07': { makan: idr('2.000.000,00') },
    })
    expect(findPeriodicCosts(history, { window: 2 })).toEqual([])
  })
})
