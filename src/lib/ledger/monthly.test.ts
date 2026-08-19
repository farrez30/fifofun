import { describe, expect, it } from 'vitest'
import { parseIdAmount } from '@/lib/money'
import { toJakartaInstant } from '@/lib/datetime'
import {
  computeAccountMovements,
  computeMonthlySeries,
  computeMonthlyStatement,
  findOverdrawnAccounts,
  groupByMonth,
  openingBalanceCheck,
} from './monthly'
import { type Account, type CashflowType, type LedgerEntry, validateEntry } from './types'

let counter = 0

function entry(
  cashflow: CashflowType,
  amount: string,
  month = 1,
  accounts: { from?: string | null; to?: string | null } = {},
): LedgerEntry {
  counter += 1
  const needsFrom = cashflow !== 'income' && cashflow !== 'from_asset' && cashflow !== 'receivable_settled'
  const needsTo = cashflow === 'income' || cashflow === 'from_asset' || cashflow === 'receivable_settled' || cashflow === 'transfer'
  return {
    id: `e${counter}`,
    occurredAt: toJakartaInstant({ year: 2026, month, day: 15 }, { hour: 12, minute: 0, second: 0 }),
    description: `${cashflow} ${amount}`,
    amount: parseIdAmount(amount),
    cashflow,
    categoryId: null,
    fromAccountId: accounts.from ?? (needsFrom ? 'mandiri' : null),
    toAccountId: accounts.to ?? (needsTo ? 'mandiri' : null),
    source: 'manual',
  }
}

/**
 * The reference figures below are the user's real January to March 2026 totals,
 * taken from the spreadsheet this app replaces. They are the acceptance test:
 * if these three numbers do not come out exactly, the app is wrong.
 */
describe('monthly statement against the real spreadsheet', () => {
  it('reproduces January 2026', () => {
    const statement = computeMonthlyStatement(
      [
        entry('income', '6.587.500,00', 1),
        entry('bills', '3.080.225,00', 1),
        entry('spending', '4.324.411,00', 1),
        entry('receivable_new', '102.000,00', 1),
      ],
      parseIdAmount('4.317.549,00'),
    )
    expect(statement.sisaUang).toBe(parseIdAmount('3.398.413,00'))
  })

  it('reproduces February 2026, where receivables were settled', () => {
    const statement = computeMonthlyStatement(
      [
        entry('income', '8.171.629,00', 2),
        entry('bills', '2.690.151,00', 2),
        entry('spending', '3.830.737,00', 2),
        // Settling a receivable brings money back, so the net figure is negative.
        entry('receivable_settled', '102.000,00', 2),
      ],
      parseIdAmount('3.398.413,00'),
    )
    expect(statement.piutang).toBe(-parseIdAmount('102.000,00'))
    expect(statement.sisaUang).toBe(parseIdAmount('5.151.154,00'))
  })

  it('reproduces March 2026', () => {
    const statement = computeMonthlyStatement(
      [
        entry('income', '6.172.514,00', 3),
        entry('bills', '532.883,00', 3),
        entry('spending', '8.287.460,00', 3),
        entry('receivable_new', '52.500,00', 3),
      ],
      parseIdAmount('5.151.154,00'),
    )
    expect(statement.sisaUang).toBe(parseIdAmount('2.450.825,00'))
  })

  it('carries each month into the next without anyone retyping it', () => {
    const series = computeMonthlySeries(
      [
        entry('income', '6.587.500,00', 1),
        entry('bills', '3.080.225,00', 1),
        entry('spending', '4.324.411,00', 1),
        entry('receivable_new', '102.000,00', 1),

        entry('income', '8.171.629,00', 2),
        entry('bills', '2.690.151,00', 2),
        entry('spending', '3.830.737,00', 2),
        entry('receivable_settled', '102.000,00', 2),

        entry('income', '6.172.514,00', 3),
        entry('bills', '532.883,00', 3),
        entry('spending', '8.287.460,00', 3),
        entry('receivable_new', '52.500,00', 3),
      ],
      parseIdAmount('4.317.549,00'),
    )

    expect(series.map((month) => month.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(series.map((month) => month.statement.sisaUang)).toEqual([
      parseIdAmount('3.398.413,00'),
      parseIdAmount('5.151.154,00'),
      parseIdAmount('2.450.825,00'),
    ])
    // Each month's opening equals the previous month's closing.
    expect(series[1].statement.saldoAwal).toBe(series[0].statement.sisaUang)
    expect(series[2].statement.saldoAwal).toBe(series[1].statement.sisaUang)
  })
})

describe('monthly statement mechanics', () => {
  it('leaves spendable money unchanged when funds move between own accounts', () => {
    const before = computeMonthlyStatement([entry('income', '1.000.000,00')], 0n)
    const after = computeMonthlyStatement(
      [
        entry('income', '1.000.000,00'),
        entry('transfer', '400.000,00', 1, { from: 'mandiri', to: 'gopay' }),
      ],
      0n,
    )
    expect(after.sisaUang).toBe(before.sisaUang)
  })

  it('treats saving as leaving the spendable pool', () => {
    const statement = computeMonthlyStatement(
      [entry('income', '1.000.000,00'), entry('invest_savings', '300.000,00')],
      0n,
    )
    expect(statement.sisaUang).toBe(parseIdAmount('700.000,00'))
  })

  it('treats drawing on savings as returning to the spendable pool', () => {
    const statement = computeMonthlyStatement([entry('from_asset', '250.000,00')], 0n)
    expect(statement.sisaUang).toBe(parseIdAmount('250.000,00'))
  })

  it('groups entries by Jakarta month, not by UTC month', () => {
    // 01 Jan 2026 02:00 WIB is still 31 Dec 2025 in UTC.
    const newYear: LedgerEntry = {
      ...entry('spending', '10.000,00'),
      occurredAt: toJakartaInstant({ year: 2026, month: 1, day: 1 }, { hour: 2, minute: 0, second: 0 }),
    }
    expect([...groupByMonth([newYear]).keys()]).toEqual(['2026-01'])
  })
})

describe('account movements', () => {
  const accounts: Account[] = [
    { id: 'mandiri', name: 'Bank Mandiri', kind: 'bank', openingBalance: parseIdAmount('4.181.668,00') },
    { id: 'gopay', name: 'Gopay', kind: 'ewallet', openingBalance: parseIdAmount('18.300,00') },
  ]

  it('computes opening plus credit minus debit', () => {
    const movements = computeAccountMovements(
      [
        entry('transfer', '100.000,00', 1, { from: 'mandiri', to: 'gopay' }),
        entry('spending', '20.000,00', 1, { from: 'gopay' }),
      ],
      accounts,
    )
    const gopay = movements.find((m) => m.accountId === 'gopay')!
    expect(gopay.credit).toBe(parseIdAmount('100.000,00'))
    expect(gopay.debit).toBe(parseIdAmount('20.000,00'))
    expect(gopay.closing).toBe(parseIdAmount('98.300,00'))
  })

  it('flags an account driven below zero', () => {
    // The source spreadsheet let Gopay sit at minus Rp47.200 for a whole month.
    const movements = computeAccountMovements(
      [entry('spending', '65.500,00', 1, { from: 'gopay' })],
      accounts,
    )
    const overdrawn = findOverdrawnAccounts(movements)
    expect(overdrawn).toHaveLength(1)
    expect(overdrawn[0].closing).toBe(-parseIdAmount('47.200,00'))
  })
})

describe('opening balance check', () => {
  const accounts: Account[] = [
    { id: 'a', name: 'A', kind: 'bank', openingBalance: parseIdAmount('4.000.000,00') },
    { id: 'b', name: 'B', kind: 'cash', openingBalance: parseIdAmount('500.000,00') },
  ]

  it('balances when earmarked savings are subtracted', () => {
    const result = openingBalanceCheck(accounts, parseIdAmount('1.000.000,00'), parseIdAmount('3.500.000,00'))
    expect(result.ok).toBe(true)
    expect(result.difference).toBe(0n)
  })

  it('reports the exact gap when it does not', () => {
    const result = openingBalanceCheck(accounts, 0n, parseIdAmount('4.000.000,00'))
    expect(result.ok).toBe(false)
    expect(result.difference).toBe(parseIdAmount('500.000,00'))
  })
})

describe('entry validation', () => {
  it('accepts entries that follow the account rules', () => {
    expect(validateEntry(entry('income', '1.000,00'))).toEqual([])
    expect(validateEntry(entry('spending', '1.000,00'))).toEqual([])
    expect(
      validateEntry(entry('transfer', '1.000,00', 1, { from: 'a', to: 'b' })),
    ).toEqual([])
  })

  it('rejects income that names a source account', () => {
    const bad = { ...entry('income', '1.000,00'), fromAccountId: 'mandiri' }
    expect(validateEntry(bad).map((p) => p.message)).toContain(
      'income must not have a source account',
    )
  })

  it('rejects a transfer that is missing a side, which would corrupt balances', () => {
    const bad = { ...entry('transfer', '1.000,00', 1, { from: 'a', to: 'b' }), toAccountId: null }
    expect(validateEntry(bad).map((p) => p.message)).toContain(
      'transfer needs a destination account',
    )
  })

  it('rejects a transfer to the same account', () => {
    const bad = entry('transfer', '1.000,00', 1, { from: 'a', to: 'a' })
    expect(validateEntry(bad).map((p) => p.message)).toContain(
      'Source and destination accounts are the same',
    )
  })

  it('rejects a non-positive amount', () => {
    const bad = { ...entry('spending', '1.000,00'), amount: 0n }
    expect(validateEntry(bad).map((p) => p.message)).toContain('Amount must be greater than zero')
  })
})
