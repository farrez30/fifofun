import { describe, expect, it } from 'vitest'
import { asMonthlySeries, computeAccountSeries } from './account-series'
import { buildBalanceTrend } from './trend'
import { parseIdAmount as idr } from '@/lib/money'
import type { Account, CashflowType, LedgerEntry } from './types'

const GOPAY: Account = { id: 'gopay', name: 'GoPay', kind: 'ewallet', openingBalance: 0n }
const MANDIRI: Account = {
  id: 'mandiri',
  name: 'Bank Mandiri',
  kind: 'bank',
  openingBalance: idr('1.000.000,00'),
}

let seq = 0
function entry(
  when: string,
  amount: bigint,
  cashflow: CashflowType,
  sides: { from?: string; to?: string },
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  seq += 1
  return {
    id: `e${seq}`,
    occurredAt: new Date(when),
    description: 'uji',
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: sides.from ?? null,
    toAccountId: sides.to ?? null,
    source: 'xlsx',
    ...extra,
  }
}

describe('computeAccountSeries', () => {
  it('carries the closing balance into the next month opening', () => {
    const points = computeAccountSeries(
      [
        entry('2026-01-05T05:00:00.000Z', idr('500.000,00'), 'transfer', {
          from: 'mandiri',
          to: 'gopay',
        }),
        entry('2026-02-05T05:00:00.000Z', idr('120.000,00'), 'spending', { from: 'gopay' }),
      ],
      GOPAY,
    )

    expect(points.map((point) => point.month)).toEqual(['2026-01', '2026-02'])
    expect(points[0]).toMatchObject({ opening: 0n, credit: idr('500.000,00'), debit: 0n })
    expect(points[0].closing).toBe(idr('500.000,00'))
    expect(points[1].opening).toBe(idr('500.000,00'))
    expect(points[1].closing).toBe(idr('380.000,00'))
  })

  it('counts a transfer on both accounts it touches', () => {
    const rows = [
      entry('2026-01-05T05:00:00.000Z', idr('500.000,00'), 'transfer', {
        from: 'mandiri',
        to: 'gopay',
      }),
    ]
    expect(computeAccountSeries(rows, GOPAY)[0].credit).toBe(idr('500.000,00'))
    expect(computeAccountSeries(rows, MANDIRI)[0].debit).toBe(idr('500.000,00'))
  })

  it('counts pass-through money, because the bank did', () => {
    const points = computeAccountSeries(
      [
        entry('2026-01-05T05:00:00.000Z', idr('400.000,00'), 'income', { to: 'mandiri' }, {
          isPassThrough: true,
        }),
      ],
      MANDIRI,
    )
    expect(points[0].credit).toBe(idr('400.000,00'))
  })

  it('gives a quiet month a point with no movement', () => {
    const points = computeAccountSeries(
      [
        entry('2026-01-05T05:00:00.000Z', idr('500.000,00'), 'transfer', {
          from: 'mandiri',
          to: 'gopay',
        }),
        // February belongs to another account entirely; GoPay still gets a point.
        entry('2026-02-05T05:00:00.000Z', idr('90.000,00'), 'spending', { from: 'mandiri' }),
      ],
      GOPAY,
    )
    expect(points).toHaveLength(2)
    expect(points[1]).toMatchObject({ credit: 0n, debit: 0n, closing: idr('500.000,00') })
  })

  it('starts from the account opening balance', () => {
    const points = computeAccountSeries(
      [entry('2026-01-05T05:00:00.000Z', idr('90.000,00'), 'spending', { from: 'mandiri' })],
      MANDIRI,
    )
    expect(points[0].opening).toBe(idr('1.000.000,00'))
    expect(points[0].closing).toBe(idr('910.000,00'))
  })
})

describe('asMonthlySeries', () => {
  it('adapts to the statement shape so the charts draw it unchanged', () => {
    const points = computeAccountSeries(
      [
        entry('2026-01-05T05:00:00.000Z', idr('500.000,00'), 'transfer', {
          from: 'mandiri',
          to: 'gopay',
        }),
        entry('2026-02-05T05:00:00.000Z', idr('120.000,00'), 'spending', { from: 'gopay' }),
      ],
      GOPAY,
    )
    const series = asMonthlySeries(points)

    expect(series[0].statement.income).toBe(idr('500.000,00'))
    expect(series[1].statement.spending).toBe(idr('120.000,00'))

    // The balance trend reads sisaUang, so it draws this account's own closings.
    const trend = buildBalanceTrend(series)
    expect(trend?.points.map((point) => point.balance)).toEqual([
      idr('500.000,00'),
      idr('380.000,00'),
    ])
  })
})
