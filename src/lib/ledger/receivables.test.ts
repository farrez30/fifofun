import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { reviewReceivables } from './receivables'
import type { CashflowType, LedgerEntry } from './types'

/**
 * The reference case is the Spotify split of March 2026: six people at
 * Rp17.500 each, three of whom paid the same day. The spreadsheet still calls
 * all six NOT PAID, because the state lives in the name.
 */

type Entry = LedgerEntry & { categoryName?: string | null }

let counter = 0

function entry(
  date: string,
  name: string,
  amount: bigint,
  cashflow: CashflowType = 'receivable_new',
): Entry {
  counter += 1
  return {
    id: `r${counter}`,
    occurredAt: new Date(`${date}T03:00:00.000Z`),
    description: name,
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'xlsx',
    externalRef: null,
    note: null,
    categoryName: name,
  }
}

const RP = idr('17.500,00')
const ASOF = new Date('2026-03-31T03:00:00.000Z')

describe('reviewReceivables', () => {
  it('settles a debt from the ledger, whatever the name still says', () => {
    const review = reviewReceivables(
      [
        entry('2026-03-01', 'Patungan Spotify - Alma (3/26-NOT PAID)', RP),
        entry('2026-03-01', 'Patungan Spotify - Alma (3/26-NOT PAID)', RP, 'receivable_settled'),
      ],
      { asOf: ASOF },
    )

    expect(review.receivables[0]).toMatchObject({ state: 'settled', outstanding: 0n })
    expect(review.outstanding).toBe(0n)
    expect(review.open).toEqual([])
  })

  it('reproduces the March split: six lent, three back, three still out', () => {
    const names = ['Alma', 'Ghozi', 'Hafidz', 'Raafi', 'Utha 3/26', 'Utha 2/26']
    const entries = names.map((name) => entry('2026-03-01', name, RP))
    for (const name of ['Alma', 'Ghozi', 'Raafi']) {
      entries.push(entry('2026-03-01', name, RP, 'receivable_settled'))
    }

    const review = reviewReceivables(entries, { asOf: ASOF })

    expect(review.lent).toBe(idr('105.000,00'))
    expect(review.returned).toBe(idr('52.500,00'))
    expect(review.outstanding).toBe(idr('52.500,00'))
    expect(review.open.map((item) => item.name)).toEqual(['Hafidz', 'Utha 2/26', 'Utha 3/26'])
  })

  it('recognises a part payment as neither open nor closed', () => {
    const review = reviewReceivables(
      [
        entry('2026-03-01', 'Wafi', idr('100.000,00')),
        entry('2026-03-10', 'Wafi', idr('40.000,00'), 'receivable_settled'),
      ],
      { asOf: ASOF },
    )
    expect(review.receivables[0]).toMatchObject({
      state: 'partial',
      outstanding: idr('60.000,00'),
    })
  })

  it('says so when more came back than went out', () => {
    // Silently reporting this as settled would hide a miscategorised income.
    const review = reviewReceivables(
      [
        entry('2026-03-01', 'Wafi', idr('50.000,00')),
        entry('2026-03-10', 'Wafi', idr('80.000,00'), 'receivable_settled'),
      ],
      { asOf: ASOF },
    )
    expect(review.receivables[0]).toMatchObject({
      state: 'overpaid',
      outstanding: idr('-30.000,00'),
    })
  })

  it('ages an open debt from the day the money left', () => {
    const review = reviewReceivables([entry('2026-03-01', 'Wafi', RP)], { asOf: ASOF })
    expect(review.receivables[0].age).toBe(30)
  })

  it('stops the clock on a debt once it is settled', () => {
    const review = reviewReceivables(
      [
        entry('2026-01-01', 'Wafi', RP),
        entry('2026-01-11', 'Wafi', RP, 'receivable_settled'),
      ],
      { asOf: ASOF },
    )
    expect(review.receivables[0]).toMatchObject({ age: 10, state: 'settled' })
  })

  it('ranks by what is still owed, not by how long it has been owed', () => {
    // Rp17.500 outstanding for a year is a smaller problem than Rp400.000
    // outstanding for a week, and ranking by age would put it on top.
    const review = reviewReceivables(
      [
        entry('2025-03-01', 'Utang lama kecil', RP),
        entry('2026-03-24', 'Utang baru besar', idr('400.000,00')),
      ],
      { asOf: ASOF },
    )
    expect(review.open.map((item) => item.name)).toEqual(['Utang baru besar', 'Utang lama kecil'])
  })

  it('flags a debt that has gone quiet for too long', () => {
    const review = reviewReceivables(
      [
        entry('2026-03-24', 'Baru', RP),
        entry('2025-03-01', 'Lama', RP),
      ],
      { asOf: ASOF, staleAfter: 30 },
    )
    expect(review.stale.map((item) => item.name)).toEqual(['Lama'])
  })

  it('ignores every cashflow that is not a receivable', () => {
    const review = reviewReceivables(
      [
        entry('2026-03-01', 'Belanja', idr('500.000,00'), 'spending'),
        entry('2026-03-01', 'Gaji', idr('6.000.000,00'), 'income'),
        entry('2026-03-01', 'Wafi', RP),
      ],
      { asOf: ASOF },
    )
    expect(review.receivables.map((item) => item.name)).toEqual(['Wafi'])
  })

  it('handles a settlement whose original outlay was never recorded', () => {
    // Half the pair missing is a data problem, not a crash. It shows up as
    // overpaid, which is exactly the signal that something was not recorded.
    const review = reviewReceivables(
      [entry('2026-03-01', 'Wafi', RP, 'receivable_settled')],
      { asOf: ASOF },
    )
    expect(review.receivables[0]).toMatchObject({ state: 'overpaid', lent: 0n })
  })
})
