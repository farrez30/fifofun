import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import type { MonthCategoryTotals } from './categories'
import { buildCategoryTrends } from './category-trend'

function months(rows: Record<string, Record<string, string>>): MonthCategoryTotals[] {
  return Object.entries(rows).map(([month, byCategory]) => ({
    month,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([category, amount]) => [category, idr(amount)]),
    ),
  }))
}

/**
 * The failure the source spreadsheet allowed: Jajan normally runs about
 * Rp80.000 and one month reached Rp4,8 juta without anything saying so.
 */
const JAJAN = months({
  '2026-01': { Jajan: '80.500,00', Belanja: '1.855.653,00', 'Biaya Bank': '36.500,00' },
  '2026-02': { Jajan: '92.000,00', Belanja: '1.700.000,00', 'Biaya Bank': '36.500,00' },
  '2026-03': { Jajan: '4.801.400,00', Belanja: '1.900.000,00', 'Biaya Bank': '45.700,00' },
})

describe('buildCategoryTrends', () => {
  it('gives every category a point for every month, zeros included', () => {
    const review = buildCategoryTrends(JAJAN)
    for (const trend of review.trends) {
      expect(trend.points.map((point) => point.month)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
      ])
    }
  })

  it('counts a quiet month as nothing spent, not as a month that never was', () => {
    const review = buildCategoryTrends(
      months({
        '2026-01': { Kesehatan: '2.000.000,00' },
        '2026-02': { Belanja: '500.000,00' },
        '2026-03': { Belanja: '500.000,00' },
      }),
    )
    const health = review.trends.find((trend) => trend.category === 'Kesehatan')
    expect(health?.points.map((point) => point.amount)).toEqual([idr('2.000.000,00'), 0n, 0n])
    // Two of its three months were zero, so its usual is zero, not two million.
    expect(health?.usual).toBe(0n)
  })

  it('calls the month that ran away a surge', () => {
    const jajan = buildCategoryTrends(JAJAN).trends.find((trend) => trend.category === 'Jajan')
    expect(jajan?.movement).toBe('melonjak')
    expect(jajan?.latest).toBe(idr('4.801.400,00'))
  })

  it('leaves a small overrun quiet, on the same rule the budget panel uses', () => {
    // Bank charges went from Rp36.500 to Rp45.700. Both panels have to agree
    // that Rp9.200 out of a Rp6,7 juta month is not worth an alarm.
    const bank = buildCategoryTrends(JAJAN).trends.find(
      (trend) => trend.category === 'Biaya Bank',
    )
    expect(bank?.movement).toBe('biasa')
  })

  it('measures against the months before, not against the month being judged', () => {
    const jajan = buildCategoryTrends(JAJAN).trends.find((trend) => trend.category === 'Jajan')
    // The median of Rp80.500 and Rp92.000 is the lower of the two, and neither
    // of them is the Rp4,8 juta month.
    expect(jajan?.usual).toBe(idr('80.500,00'))
  })

  it('leaves an ordinary month in the biggest category alone', () => {
    const belanja = buildCategoryTrends(JAJAN).trends.find(
      (trend) => trend.category === 'Belanja',
    )
    /*
      Rp1,7 juta to Rp1,9 juta is three percent of the month, which clears the
      budget panel's materiality test on its own. Against a household's own
      median that is simply what a month looks like, so a second test asks
      whether the category is well above its usual as well as large.
    */
    expect(belanja?.movement).toBe('biasa')
  })

  it('needs a category to be both large and well above itself', () => {
    // Big enough to matter to the month, only a fifth above its usual.
    const steady = buildCategoryTrends(
      months({
        '2026-01': { Rumah: '5.000.000,00' },
        '2026-02': { Rumah: '5.000.000,00' },
        '2026-03': { Rumah: '6.000.000,00' },
      }),
    )
    expect(steady.trends[0].movement).toBe('biasa')

    // Five times its usual, and too small for the month to notice.
    const tiny = buildCategoryTrends(
      months({
        '2026-01': { Rumah: '5.000.000,00', Parkir: '2.000,00' },
        '2026-02': { Rumah: '5.000.000,00', Parkir: '2.000,00' },
        '2026-03': { Rumah: '5.000.000,00', Parkir: '10.000,00' },
      }),
    )
    expect(tiny.trends.find((trend) => trend.category === 'Parkir')?.movement).toBe('biasa')
  })

  it('notices a category that has gone quiet', () => {
    const review = buildCategoryTrends(
      months({
        '2026-01': { Kosan: '2.000.000,00' },
        '2026-02': { Kosan: '2.000.000,00' },
        '2026-03': { Belanja: '500.000,00' },
      }),
    )
    expect(review.trends.find((trend) => trend.category === 'Kosan')?.movement).toBe('mereda')
  })

  it('calls a category that has never appeared before new', () => {
    const review = buildCategoryTrends(
      months({
        '2026-01': { Belanja: '1.000.000,00' },
        '2026-02': { Belanja: '1.000.000,00' },
        '2026-03': { Belanja: '1.000.000,00', Kendaraan: '3.500.000,00' },
      }),
    )
    expect(review.trends.find((trend) => trend.category === 'Kendaraan')?.movement).toBe('baru')
  })

  it('ranks by what the category costs, not by how sharply it moved', () => {
    const review = buildCategoryTrends(JAJAN)
    // Belanja is the biggest bill of the three even though Jajan is the one
    // that jumped. Ranking on the jump would bury the category that actually
    // empties the account.
    expect(review.trends[0].category).toBe('Belanja')
  })

  it('hands back what it left out, not only a count of it', () => {
    // A figure a reader cannot open is a dead end. The panel offers these
    // behind a summary rather than leaving them as a number.
    const review = buildCategoryTrends(JAJAN, { top: 1 })
    expect(review.rest).toHaveLength(review.omitted)
    expect(review.rest.map((trend) => trend.category)).not.toContain(review.trends[0].category)
    expect(review.rest.reduce((sum, trend) => sum + trend.total, 0n)).toBe(review.omittedTotal)
    // Still ordered by size, like the ones that made the cut.
    const totals = review.rest.map((trend) => trend.total)
    expect([...totals].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0))).toEqual(totals)
  })

  it('keeps only the top slice and says what it left out', () => {
    const review = buildCategoryTrends(JAJAN, { top: 1 })
    expect(review.trends).toHaveLength(1)
    expect(review.omitted).toBe(2)
    expect(review.omittedTotal).toBe(
      idr('80.500,00') +
        idr('92.000,00') +
        idr('4.801.400,00') +
        idr('36.500,00') +
        idr('36.500,00') +
        idr('45.700,00'),
    )
  })

  it('looks only as far back as the window it was given', () => {
    const review = buildCategoryTrends(JAJAN, { months: 2 })
    expect(review.months).toEqual(['2026-02', '2026-03'])
    expect(review.trends[0].points).toHaveLength(2)
  })

  it('has nothing to say about an empty ledger', () => {
    const review = buildCategoryTrends([])
    expect(review.trends).toEqual([])
    expect(review.months).toEqual([])
    expect(review.omitted).toBe(0)
  })

  it('does not call a single recorded month a surge', () => {
    const review = buildCategoryTrends(months({ '2026-03': { Belanja: '9.000.000,00' } }))
    expect(review.trends[0].movement).toBe('biasa')
    expect(review.trends[0].usual).toBe(0n)
  })
})
