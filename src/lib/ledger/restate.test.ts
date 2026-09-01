import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { restateBalances } from './restate'
import type { MonthlyStatement } from './monthly'
import type { LedgerEntry } from './types'

/**
 * A wallet that was topped up for three months and only reconciled in the
 * fourth: the ledger carried a float that had long since been spent.
 */

const EMPTY: MonthlyStatement = {
  saldoAwal: 0n,
  income: 0n,
  fromAsset: 0n,
  investSavings: 0n,
  bills: 0n,
  sinkingFund: 0n,
  financialGoals: 0n,
  debtPayment: 0n,
  spending: 0n,
  piutang: 0n,
  sisaUang: 0n,
}

function series(balances: Record<string, bigint>) {
  return Object.entries(balances).map(([month, sisaUang]) => ({
    month,
    statement: { ...EMPTY, sisaUang },
  }))
}

let counter = 0

function entry(month: string, overrides: Partial<LedgerEntry & { categoryName: string }>) {
  counter += 1
  return {
    id: `e${counter}`,
    occurredAt: new Date(`${month}-15T05:00:00.000Z`),
    description: 'x',
    amount: 0n,
    cashflow: 'transfer' as const,
    categoryId: null,
    categoryName: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'manual' as const,
    externalRef: null,
    note: null,
    ...overrides,
  }
}

const topUp = (month: string, amount: bigint) =>
  entry(month, { toAccountId: 'gopay', amount, cashflow: 'transfer' })

const adjustment = (month: string, amount: bigint) =>
  entry(month, {
    fromAccountId: 'gopay',
    amount,
    cashflow: 'spending',
    categoryName: 'Penyesuaian Spending',
  })

describe('restateBalances', () => {
  it('spreads the correction backwards in proportion to what was topped up', () => {
    const balances = series({
      '2026-01': idr('1.000.000,00'),
      '2026-02': idr('2.000.000,00'),
      '2026-03': idr('3.000.000,00'),
      '2026-04': idr('1.500.000,00'),
    })
    const entries = [
      topUp('2026-01', idr('100.000,00')),
      topUp('2026-02', idr('300.000,00')),
      // April books the correction: Rp400.000 of float that had already gone.
      adjustment('2026-04', idr('400.000,00')),
    ]

    const { series: restated, total, bookedIn } = restateBalances(balances, entries)

    expect(total).toBe(idr('400.000,00'))
    expect(bookedIn).toEqual(['2026-04'])
    // One quarter of the top-ups landed in January, three quarters in February.
    expect(restated[0].statement.sisaUang).toBe(idr('900.000,00'))
    expect(restated[1].statement.sisaUang).toBe(idr('1.600.000,00'))
    // March carries the whole correction; it had no top-ups of its own.
    expect(restated[2].statement.sisaUang).toBe(idr('2.600.000,00'))
  })

  it('lands on the same figure it started from: a restatement moves the path, not the end', () => {
    const balances = series({
      '2026-01': idr('1.000.000,00'),
      '2026-02': idr('2.000.000,00'),
      '2026-03': idr('1.500.000,00'),
    })
    const entries = [topUp('2026-01', idr('50.000,00')), adjustment('2026-03', idr('200.000,00'))]

    const { series: restated } = restateBalances(balances, entries)
    const last = restated[restated.length - 1].statement.sisaUang
    expect(last).toBe(idr('1.500.000,00'))
  })

  it('leaves every month from the correction onwards alone', () => {
    const balances = series({
      '2026-01': idr('1.000.000,00'),
      '2026-02': idr('700.000,00'),
      '2026-03': idr('900.000,00'),
    })
    const entries = [topUp('2026-01', idr('300.000,00')), adjustment('2026-02', idr('300.000,00'))]

    const { series: restated } = restateBalances(balances, entries)
    // January carries the lot; February already booked it, March never saw it.
    expect(restated[0].statement.sisaUang).toBe(idr('700.000,00'))
    expect(restated[1].statement.sisaUang).toBe(idr('700.000,00'))
    expect(restated[2].statement.sisaUang).toBe(idr('900.000,00'))
  })

  it('splits evenly where there is nothing to weigh, rather than giving up', () => {
    const balances = series({
      '2026-01': idr('300.000,00'),
      '2026-02': idr('300.000,00'),
      '2026-03': idr('300.000,00'),
    })
    // Cash: money is spent from it, never transferred into it.
    const cash = entry('2026-03', {
      fromAccountId: 'cash',
      amount: idr('60.000,00'),
      cashflow: 'spending',
      categoryName: 'Penyesuaian Spending',
    })

    const { series: restated } = restateBalances(balances, [cash])
    expect(restated[0].statement.sisaUang).toBe(idr('270.000,00'))
    expect(restated[1].statement.sisaUang).toBe(idr('240.000,00'))
  })

  it('keeps every rupiah: the parts add back up to the whole', () => {
    const balances = series({
      '2026-01': 100n,
      '2026-02': 100n,
      '2026-03': 100n,
      '2026-04': 100n,
    })
    // An amount that cannot divide evenly by the weights.
    const entries = [
      topUp('2026-01', 1n),
      topUp('2026-02', 1n),
      topUp('2026-03', 1n),
      adjustment('2026-04', 100n),
    ]

    const { series: restated } = restateBalances(balances, entries)
    // The month before the correction has taken all of it.
    expect(restated[2].statement.sisaUang).toBe(0n)
  })

  it('leaves a household with no corrections exactly as it was', () => {
    const balances = series({ '2026-01': idr('1.000.000,00'), '2026-02': idr('900.000,00') })
    const untouched = restateBalances(balances, [topUp('2026-01', idr('10.000,00'))])

    expect(untouched.total).toBe(0n)
    expect(untouched.series).toBe(balances)
  })

  it('restates one account alone when the chart is scoped to it', () => {
    const balances = series({ '2026-01': idr('500.000,00'), '2026-02': idr('400.000,00') })
    const other = entry('2026-02', {
      fromAccountId: 'ovo',
      amount: idr('100.000,00'),
      cashflow: 'spending',
      categoryName: 'Penyesuaian Spending',
    })

    expect(restateBalances(balances, [other], 'gopay').total).toBe(0n)
    expect(restateBalances(balances, [other], 'ovo').total).toBe(idr('100.000,00'))
  })

  it('ignores an adjustment that ADDS money, which is a different story', () => {
    const balances = series({ '2026-01': idr('100.000,00'), '2026-02': idr('200.000,00') })
    const found = entry('2026-02', {
      toAccountId: 'gopay',
      amount: idr('50.000,00'),
      cashflow: 'income',
      categoryName: 'Penyesuaian Income',
    })

    expect(restateBalances(balances, [found]).total).toBe(0n)
  })
})
