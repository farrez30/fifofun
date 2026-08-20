import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { reviewBills } from './bills'
import type { CashflowType, LedgerEntry } from './types'

/**
 * The reference case is the Bills block on the March 2026 sheet: Wifi
 * Rp271.950, Langganan Youtube Rp25.925 and Langganan Spotify Rp104.900 marked
 * Paid, and eight other bills left Unpaid.
 */

type Entry = LedgerEntry & { categoryName?: string | null; accountName?: string | null }

let counter = 0

function entry(
  month: string,
  categoryName: string,
  amount: bigint,
  overrides: Partial<Entry> = {},
): Entry {
  counter += 1
  return {
    id: `e${counter}`,
    occurredAt: new Date(`${month}-15T03:00:00.000Z`),
    description: categoryName,
    amount,
    cashflow: 'bills' as CashflowType,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'xlsx',
    externalRef: null,
    note: null,
    categoryName,
    ...overrides,
  }
}

describe('reviewBills', () => {
  it('reads paid from the ledger rather than from a stored status', () => {
    const review = reviewBills(
      [
        entry('2026-03', 'Wifi', idr('271.950,00'), { accountName: 'Bank Mandiri' }),
        entry('2026-03', 'Langganan Youtube', idr('25.925,00')),
      ],
      '2026-03',
      { known: ['Wifi', 'Langganan Youtube', 'Langganan Spotify'] },
    )

    const byName = Object.fromEntries(review.bills.map((bill) => [bill.category, bill]))
    expect(byName.Wifi).toMatchObject({ state: 'paid', paid: idr('271.950,00'), account: 'Bank Mandiri' })
    expect(byName['Langganan Youtube'].state).toBe('paid')
    expect(review.total).toBe(idr('297.875,00'))
  })

  it('calls a bill due when the month carries no payment for it', () => {
    const review = reviewBills(
      [
        entry('2026-02', 'Wifi', idr('271.950,00')),
        entry('2026-03', 'Langganan Youtube', idr('25.925,00')),
      ],
      '2026-03',
    )

    const wifi = review.bills.find((bill) => bill.category === 'Wifi')
    expect(wifi).toMatchObject({ state: 'due', paid: 0n, monthsSinceLast: 1 })
  })

  it('tells an unpaid bill what it is going to cost', () => {
    // Three months of history, one of them an outlier. A mean would quote
    // Rp340.650 for a bill that is really Rp271.950.
    const review = reviewBills(
      [
        entry('2025-12', 'Wifi', idr('271.950,00')),
        entry('2026-01', 'Wifi', idr('271.950,00')),
        entry('2026-02', 'Wifi', idr('478.050,00')),
      ],
      '2026-03',
    )

    const wifi = review.bills[0]
    expect(wifi.usual).toBe(idr('271.950,00'))
    expect(review.outstanding).toBe(idr('271.950,00'))
  })

  it('does not average in the months a quarterly bill was not due', () => {
    // Paid once, for Rp2 juta. Spreading that across four months would quote
    // Rp500 ribu for something that never costs Rp500 ribu.
    const review = reviewBills(
      [entry('2025-12', 'Pajak Kendaraan', idr('2.000.000,00'))],
      '2026-01',
    )
    expect(review.bills[0].usual).toBe(idr('2.000.000,00'))
  })

  it('lets a bill go dormant instead of nagging about a cancelled subscription', () => {
    const review = reviewBills(
      [entry('2025-09', 'Langganan DanceFitMe', idr('49.000,00'))],
      '2026-03',
    )
    expect(review.bills[0]).toMatchObject({ state: 'dormant', monthsSinceLast: 6 })
    expect(review.due).toEqual([])
  })

  it('shows a known bill that has never been paid, without calling it overdue', () => {
    const review = reviewBills([], '2026-03', { known: ['Aeropolis Gym & Pool'] })
    expect(review.bills[0]).toMatchObject({
      state: 'dormant',
      paid: 0n,
      usual: 0n,
      monthsSinceLast: null,
    })
  })

  it('puts the unpaid ones first, expensive first within that', () => {
    const review = reviewBills(
      [
        entry('2026-02', 'Wifi', idr('271.950,00')),
        entry('2026-02', 'Langganan Spotify', idr('104.900,00')),
        entry('2026-03', 'Langganan Youtube', idr('25.925,00')),
      ],
      '2026-03',
    )
    expect(review.bills.map((bill) => bill.category)).toEqual([
      'Wifi',
      'Langganan Spotify',
      'Langganan Youtube',
    ])
  })

  it('ignores anything that is not a bill', () => {
    const review = reviewBills(
      [
        entry('2026-03', 'Belanja', idr('500.000,00'), { cashflow: 'spending' }),
        entry('2026-03', 'Wifi', idr('271.950,00')),
      ],
      '2026-03',
    )
    expect(review.bills.map((bill) => bill.category)).toEqual(['Wifi'])
  })

  it('ignores a payment dated after the month being looked at', () => {
    // Importing April's statement must not retroactively settle March.
    const review = reviewBills(
      [
        entry('2026-02', 'Wifi', idr('271.950,00')),
        entry('2026-04', 'Wifi', idr('271.950,00')),
      ],
      '2026-03',
    )
    expect(review.bills[0]).toMatchObject({ state: 'due', paid: 0n })
  })

  it('leaves pass-through money out, as every other total does', () => {
    const review = reviewBills(
      [entry('2026-03', 'Wifi', idr('271.950,00'), { isPassThrough: true } as Partial<Entry>)],
      '2026-03',
      { known: ['Wifi'] },
    )
    expect(review.total).toBe(0n)
  })
})
