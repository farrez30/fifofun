import { describe, expect, it } from 'vitest'
import { rollUpByMonthAndCategory, totalsByCashflow, totalsByCategory } from './categories'
import type { CashflowType, LedgerEntry } from './types'

type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

let counter = 0

function entry(
  isoDate: string,
  amount: bigint,
  cashflow: CashflowType,
  categoryName: string | null,
  extra: Partial<Entry> = {},
): Entry {
  counter += 1
  return {
    id: `e${counter}`,
    occurredAt: new Date(isoDate),
    description: 'test',
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: cashflow === 'income' ? null : 'a',
    toAccountId: cashflow === 'income' ? 'a' : null,
    source: 'manual',
    categoryName,
    ...extra,
  }
}

/*
  Times are chosen deliberately. The ledger runs on Asia/Jakarta, so an entry at
  23:00 UTC on the last day of a month belongs to the next month locally, and a
  rollup that groups on the UTC date would file it under the wrong one.
*/
const ENTRIES: Entry[] = [
  entry('2026-01-05T03:00:00Z', 500_000_00n, 'spending', 'Makan/minum'),
  entry('2026-01-20T03:00:00Z', 300_000_00n, 'spending', 'Makan/minum'),
  entry('2026-01-20T03:00:00Z', 150_000_00n, 'spending', 'Transport'),
  entry('2026-01-10T03:00:00Z', 250_000_00n, 'bills', 'Wifi'),
  entry('2026-01-15T03:00:00Z', 9_000_000_00n, 'income', 'Gaji'),
  entry('2026-02-05T03:00:00Z', 600_000_00n, 'spending', 'Makan/minum'),
  entry('2026-02-06T03:00:00Z', 100_000_00n, 'spending', null),
]

describe('rollUpByMonthAndCategory', () => {
  it('groups spending and bills by month', () => {
    const rollup = rollUpByMonthAndCategory(ENTRIES)
    expect(rollup.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
  })

  it('adds up repeated categories inside a month', () => {
    const january = rollUpByMonthAndCategory(ENTRIES)[0]
    expect(january.byCategory['Makan/minum']).toBe(800_000_00n)
    expect(january.byCategory.Transport).toBe(150_000_00n)
  })

  it('leaves income out by default', () => {
    const january = rollUpByMonthAndCategory(ENTRIES)[0]
    expect(january.byCategory.Gaji).toBeUndefined()
  })

  it('includes whichever cashflows are asked for', () => {
    const january = rollUpByMonthAndCategory(ENTRIES, { cashflows: ['income'] })[0]
    expect(january.byCategory.Gaji).toBe(9_000_000_00n)
    expect(january.byCategory['Makan/minum']).toBeUndefined()
  })

  it('names uncategorised entries rather than dropping them', () => {
    const february = rollUpByMonthAndCategory(ENTRIES)[1]
    expect(february.byCategory['Belum berkategori']).toBe(100_000_00n)
  })

  it('leaves pass-through money out unless asked for', () => {
    const withReimbursement: Entry[] = [
      ...ENTRIES,
      entry('2026-02-10T03:00:00Z', 1_950_000_00n, 'spending', 'Belanja', { isPassThrough: true }),
    ]
    expect(rollUpByMonthAndCategory(withReimbursement)[1].byCategory.Belanja).toBeUndefined()
    expect(
      rollUpByMonthAndCategory(withReimbursement, { includePassThrough: true })[1].byCategory
        .Belanja,
    ).toBe(1_950_000_00n)
  })

  it('files an entry by its Jakarta month, not its UTC one', () => {
    // 31 January 23:00 UTC is 1 February 06:00 in Jakarta.
    const crossing = [entry('2026-01-31T23:00:00Z', 100_000_00n, 'spending', 'Jajan')]
    expect(rollUpByMonthAndCategory(crossing)[0].month).toBe('2026-02')
  })

  it('returns months in chronological order', () => {
    const shuffled = [...ENTRIES].reverse()
    expect(rollUpByMonthAndCategory(shuffled).map((m) => m.month)).toEqual(['2026-01', '2026-02'])
  })

  it('handles an empty ledger', () => {
    expect(rollUpByMonthAndCategory([])).toEqual([])
  })
})

describe('totalsByCategory', () => {
  it('combines every month, largest first', () => {
    const totals = totalsByCategory(ENTRIES)
    expect(totals[0]).toEqual({ category: 'Makan/minum', amount: 1_400_000_00n })
    const amounts = totals.map((t) => Number(t.amount))
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
  })
})

describe('totalsByCashflow', () => {
  it('separates the cashflow types', () => {
    const totals = totalsByCashflow(ENTRIES)
    expect(totals.income).toBe(9_000_000_00n)
    expect(totals.spending).toBe(1_650_000_00n)
    expect(totals.bills).toBe(250_000_00n)
  })

  it('omits pass-through money from both sides', () => {
    const withReimbursement: Entry[] = [
      entry('2026-02-01T03:00:00Z', 1_950_000_00n, 'income', 'Other Income', {
        isPassThrough: true,
      }),
      entry('2026-02-01T04:00:00Z', 1_950_000_00n, 'spending', 'Belanja', { isPassThrough: true }),
    ]
    expect(totalsByCashflow(withReimbursement)).toEqual({})
  })
})
