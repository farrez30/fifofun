import { describe, expect, it } from 'vitest'
import { parseIdAmount } from '@/lib/money'
import { proposeBudget, reviewBudget } from './budget'
import type { MonthCategoryTotals } from './categories'

/**
 * The reference case is the failure that motivated this panel: March 2026, where
 * a Jajan budget of Rp80.500 met Rp4.801.400 of actual spending because a Shopee
 * purchase landed in the wrong category, and the spreadsheet reported it without
 * anything drawing the eye to it.
 */
const idr = parseIdAmount

describe('reviewBudget', () => {
  it('reproduces the March 2026 overrun exactly', () => {
    const review = reviewBudget(
      '2026-03',
      { Jajan: idr('80.500,00') },
      { Jajan: idr('4.801.400,00') },
    )
    const [jajan] = review.lines
    expect(jajan.status).toBe('over')
    expect(jajan.delta).toBe(idr('4.720.900,00'))
    expect(jajan.share).toBe(5964.47)
  })

  it('ranks by Rupiah over budget, not by percentage', () => {
    // 300% of a small budget is a smaller problem than 150% of a large one, and
    // ranking by percentage would put them the wrong way round.
    const review = reviewBudget(
      '2026-03',
      { Jajan: idr('20.000,00'), Belanja: idr('4.000.000,00') },
      { Jajan: idr('60.000,00'), Belanja: idr('6.000.000,00') },
    )
    expect(review.lines.map((line) => line.category)).toEqual(['Belanja', 'Jajan'])
  })

  it('gives spending with no budget its own status rather than calling it under', () => {
    const review = reviewBudget('2026-03', {}, { Dating: idr('1.200.000,00') })
    expect(review.lines[0].status).toBe('unbudgeted')
    expect(review.lines[0].share).toBeNull()
    expect(review.breaches).toHaveLength(1)
  })

  it('puts unbudgeted spending at the top where a percentage sort would bury it', () => {
    const review = reviewBudget(
      '2026-03',
      { Jajan: idr('20.000,00') },
      { Jajan: idr('60.000,00'), Belanja: idr('4.700.000,00') },
    )
    expect(review.lines[0].category).toBe('Belanja')
  })

  it('keeps a budgeted category that spent nothing, and calls it under', () => {
    const review = reviewBudget('2026-03', { Kesehatan: idr('500.000,00') }, {})
    expect(review.lines[0]).toMatchObject({
      category: 'Kesehatan',
      actual: 0n,
      status: 'under',
      share: 0,
    })
    expect(review.breaches).toEqual([])
  })

  it('treats spending exactly on budget as under, not over', () => {
    const review = reviewBudget('2026-03', { Bensin: idr('300.000,00') }, { Bensin: idr('300.000,00') })
    expect(review.lines[0].status).toBe('under')
    expect(review.lines[0].share).toBe(100)
  })

  it('totals both sides across every category', () => {
    const review = reviewBudget(
      '2026-03',
      { Jajan: idr('80.500,00'), Bensin: idr('300.000,00') },
      { Jajan: idr('4.801.400,00'), Dating: idr('1.200.000,00') },
    )
    expect(review.totalBudget).toBe(idr('380.500,00'))
    expect(review.totalActual).toBe(idr('6.001.400,00'))
  })
})

describe('proposeBudget', () => {
  const history = [
    { month: '2026-01', byCategory: { Jajan: idr('80.000,00'), Makan: idr('1.500.000,00') } },
    { month: '2026-02', byCategory: { Jajan: idr('90.000,00'), Makan: idr('1.600.000,00') } },
    { month: '2026-03', byCategory: { Jajan: idr('4.801.400,00'), Makan: idr('1.400.000,00') } },
  ]

  it('is not dragged up by the one month that went wrong', () => {
    // The mean of Jajan here is Rp1.657.133. A budget set at that figure would
    // ratify the mistake it exists to catch.
    expect(proposeBudget(history).Jajan).toBe(idr('90.000,00'))
  })

  it('proposes the typical month for a steady category', () => {
    expect(proposeBudget(history).Makan).toBe(idr('1.500.000,00'))
  })

  it('honours a floor when one is asked for', () => {
    expect(proposeBudget(history, { floor: idr('100.000,00') })).not.toHaveProperty('Jajan')
  })

  it('treats a month with no entry as a real zero', () => {
    const occasional: MonthCategoryTotals[] = [
      { month: '2026-01', byCategory: { Pajak: idr('2.000.000,00') } },
      { month: '2026-02', byCategory: {} },
      { month: '2026-03', byCategory: {} },
    ]
    // An annual cost is not a monthly budget line, and averaging it into one
    // would understate every other month by the same amount.
    expect(proposeBudget(occasional)).toEqual({})
  })
})
