import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { summarisePeriod } from './period'
import type { CashflowType, LedgerEntry } from './types'

/**
 * The reference case is the Period Summary block on the March 2026 sheet, run
 * over 1 to 8 March: Income Rp172.514 and Total Spending Rp3.006.715.
 */

type Entry = LedgerEntry & {
  categoryName?: string | null
  fromAccountName?: string | null
  toAccountName?: string | null
  isPassThrough?: boolean
}

let counter = 0

function entry(
  date: string,
  description: string,
  amount: bigint,
  cashflow: CashflowType,
  extra: Partial<Entry> = {},
): Entry {
  counter += 1
  return {
    id: `p${counter}`,
    occurredAt: new Date(`${date}T05:00:00.000Z`),
    description,
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'xlsx',
    externalRef: null,
    note: null,
    categoryName: description,
    ...extra,
  }
}

const LEDGER: Entry[] = [
  entry('2026-03-01', 'Jajan', idr('80.500,00'), 'spending', {
    fromAccountName: 'GoPay',
  }),
  entry('2026-03-02', 'Belanja', idr('1.554.485,00'), 'spending', {
    fromAccountName: 'ShopeePay',
  }),
  entry('2026-03-02', 'Penyesuaian Income', idr('122.514,00'), 'income', {
    toAccountName: 'Bank Mandiri',
  }),
  entry('2026-03-02', 'Other Income', idr('50.000,00'), 'income', {
    toAccountName: 'Cash',
  }),
  entry('2026-03-05', 'Kosan', idr('100.000,00'), 'spending', {
    fromAccountName: 'Bank Mandiri',
  }),
  entry('2026-03-08', 'Makan/minum', idr('200.000,00'), 'spending', {
    fromAccountName: 'Bank Mandiri',
  }),
  entry('2026-03-02', 'Antar Account', idr('1.552.574,00'), 'transfer', {
    fromAccountName: 'Bank Mandiri',
    toAccountName: 'ShopeePay',
  }),
  entry('2026-03-24', 'Belanja', idr('4.700.000,00'), 'spending', {
    fromAccountName: 'ShopeePay',
  }),
]

const FIRST_WEEK = { from: new Date('2026-03-01'), to: new Date('2026-03-08') }

describe('summarisePeriod', () => {
  it('reproduces the first week of March exactly', () => {
    const summary = summarisePeriod(LEDGER, FIRST_WEEK)
    expect(summary.inflow).toBe(idr('172.514,00'))
    expect(summary.outflow).toBe(idr('1.934.985,00'))
    expect(summary.net).toBe(idr('-1.762.471,00'))
  })

  it('includes the whole of the closing day', () => {
    // The 8 March entry is stamped at midday. A range ending on the 8th that
    // compared against midnight would silently drop it.
    const summary = summarisePeriod(LEDGER, FIRST_WEEK)
    expect(summary.byCategory.some((line) => line.category === 'Makan/minum')).toBe(true)
  })

  it('leaves transfers out of both directions', () => {
    // Rp1,55 juta moved from Mandiri to ShopeePay. Counting it would show up as
    // both spending and income and inflate the week twice over.
    const summary = summarisePeriod(LEDGER, FIRST_WEEK)
    expect(summary.inflow + summary.outflow).toBe(idr('2.107.499,00'))
    expect(summary.byCashflow.find((line) => line.cashflow === 'transfer')?.total).toBe(
      idr('1.552.574,00'),
    )
  })

  it('gives each category a share of its own direction', () => {
    const summary = summarisePeriod(LEDGER, FIRST_WEEK)
    const belanja = summary.byCategory.find((line) => line.category === 'Belanja')
    // Rp1.554.485 of Rp1.934.985 spent, not of everything that moved.
    expect(belanja?.share).toBeCloseTo(80.33, 1)
  })

  it('filters by cashflow', () => {
    const summary = summarisePeriod(LEDGER, { ...FIRST_WEEK, cashflows: ['income'] })
    expect(summary.matched).toBe(2)
    expect(summary.outflow).toBe(0n)
  })

  it('filters by category', () => {
    const summary = summarisePeriod(LEDGER, { categories: ['Belanja'] })
    expect(summary.matched).toBe(2)
    expect(summary.outflow).toBe(idr('6.254.485,00'))
  })

  it('matches an account on either side of the entry', () => {
    const summary = summarisePeriod(LEDGER, { accounts: ['ShopeePay'] })
    // Two purchases out of it, and the top-up into it.
    expect(summary.matched).toBe(3)
  })

  it('searches the description', () => {
    expect(summarisePeriod(LEDGER, { search: 'makan' }).matched).toBe(1)
    expect(summarisePeriod(LEDGER, { search: 'MAKAN' }).matched).toBe(1)
  })

  it('reports the span it actually matched, not the range asked for', () => {
    const summary = summarisePeriod(LEDGER, {
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
      categories: ['Kosan'],
    })
    expect(summary.span?.from.toISOString().slice(0, 10)).toBe('2026-03-05')
    expect(summary.span?.to.toISOString().slice(0, 10)).toBe('2026-03-05')
  })

  it('returns an empty span rather than a fake one when nothing matches', () => {
    const summary = summarisePeriod(LEDGER, { categories: ['Sedekah'] })
    expect(summary).toMatchObject({ matched: 0, inflow: 0n, outflow: 0n, span: null })
  })

  it('keeps pass-through money out unless it is asked for', () => {
    const ledger = [
      ...LEDGER,
      entry('2026-03-03', 'Titipan', idr('1.950.000,00'), 'income', { isPassThrough: true }),
    ]
    expect(summarisePeriod(ledger, FIRST_WEEK).inflow).toBe(idr('172.514,00'))
    expect(summarisePeriod(ledger, { ...FIRST_WEEK, includePassThrough: true }).inflow).toBe(
      idr('2.122.514,00'),
    )
  })

  it('separates two categories that share a name across cashflows', () => {
    const ledger = [
      entry('2026-03-01', 'Piutang', idr('50.000,00'), 'receivable_new'),
      entry('2026-03-02', 'Piutang', idr('50.000,00'), 'receivable_settled'),
    ]
    const summary = summarisePeriod(ledger, {})
    expect(summary.byCategory).toHaveLength(2)
    expect(summary.net).toBe(0n)
  })
})
