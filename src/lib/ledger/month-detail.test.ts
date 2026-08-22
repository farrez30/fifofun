import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { buildMonthDetails } from './month-detail'
import { computeMonthlySeries } from './monthly'
import type { CashflowType, LedgerEntry } from './types'

let seq = 0
function entry(
  when: string,
  amount: string,
  cashflow: CashflowType,
  categoryName: string | null,
  extra: Partial<LedgerEntry> = {},
) {
  seq += 1
  return {
    id: `e${seq}`,
    occurredAt: new Date(when),
    description: categoryName ?? 'tanpa kategori',
    amount: idr(amount),
    cashflow,
    categoryId: null,
    categoryName,
    fromAccountId: cashflow === 'income' ? null : 'acc-mandiri',
    toAccountId: cashflow === 'income' ? 'acc-mandiri' : null,
    source: 'xlsx' as const,
    ...extra,
  }
}

const ROWS = [
  entry('2026-07-02T05:00:00.000Z', '9.912.000,00', 'income', 'Gaji'),
  entry('2026-07-05T05:00:00.000Z', '4.138.307,00', 'spending', 'Other spending'),
  entry('2026-07-08T05:00:00.000Z', '2.225.031,00', 'spending', 'Belanja'),
  entry('2026-07-12T05:00:00.000Z', '1.593.177,00', 'spending', 'Makan/minum'),
  entry('2026-07-15T05:00:00.000Z', '45.700,00', 'spending', 'Biaya Bank'),
  // Neither of these belongs in a list of what the month spent.
  entry('2026-07-18T05:00:00.000Z', '500.000,00', 'transfer', 'Antar Account', {
    fromAccountId: 'acc-mandiri',
    toAccountId: 'acc-gopay',
  }),
  entry('2026-07-20T05:00:00.000Z', '400.000,00', 'income', 'Other Income', {
    isPassThrough: true,
  }),
]

const SERIES = computeMonthlySeries(ROWS, 0n)

describe('buildMonthDetails', () => {
  it('builds one detail per month, in series order', () => {
    const details = buildMonthDetails(SERIES, ROWS)
    expect(details.map((detail) => detail.month)).toEqual(SERIES.map((month) => month.month))
    expect(details[0].label).toBe('Jul 2026')
  })

  it('names the largest outgoing category in the verdict', () => {
    const [detail] = buildMonthDetails(SERIES, ROWS)
    expect(detail.verdict).toContain('Other spending')
    expect(detail.verdict).toMatch(/^Keluar Rp/)
  })

  it('leaves transfers and pass-through money out of the transaction list', () => {
    const [detail] = buildMonthDetails(SERIES, ROWS)
    const listed = detail.top.map((row) => row.description)
    expect(listed).not.toContain('Antar Account')
    expect(listed).not.toContain('Other Income')
    expect(detail.count).toBe(5)
  })

  it('caps the list and keeps the count', () => {
    const [detail] = buildMonthDetails(SERIES, ROWS, { topLimit: 2 })
    expect(detail.top).toHaveLength(2)
    expect(detail.top[0].description).toBe('Gaji')
    expect(detail.count).toBe(5)
  })

  it('says so when a month has nothing', () => {
    const details = buildMonthDetails(
      [{ month: '2026-01', statement: { ...SERIES[0].statement, income: 0n, spending: 0n } }],
      [],
    )
    expect(details[0].verdict).toBe('Tidak ada transaksi tercatat di bulan ini.')
    expect(details[0].byCategory).toEqual([])
  })

  it('links to the exact month in the report, leap day and all', () => {
    const february = [entry('2028-02-10T05:00:00.000Z', '100.000,00', 'spending', 'Belanja')]
    const [detail] = buildMonthDetails(computeMonthlySeries(february, 0n), february)
    expect(detail.href).toBe('/laporan?dari=2028-02-01&sampai=2028-02-29')
  })

  it('takes the hue and icon a category is known by', () => {
    const [detail] = buildMonthDetails(SERIES, ROWS, {
      look: (name) => ({ hue: name === 'Belanja' ? 158 : 12, icon: 'ShoppingBag' }),
    })
    const belanja = detail.byCategory.find((line) => line.name === 'Belanja')
    expect(belanja).toMatchObject({ hue: 158, icon: 'ShoppingBag', cashflowLabel: 'Spending' })
  })

  it('reads direction by account side when scoped to one account', () => {
    const [detail] = buildMonthDetails(SERIES, ROWS, {
      account: { id: 'acc-gopay', name: 'GoPay' },
    })
    // The transfer arrives in GoPay, so inside that account it is money in.
    const transfer = detail.top.find((row) => row.description === 'Antar Account')
    expect(transfer?.direction).toBe('in')
  })

  it('carries no bigint across the boundary', () => {
    const details = buildMonthDetails(SERIES, ROWS, { account: { id: 'acc-gopay', name: 'GoPay' } })
    const walk = (value: unknown): void => {
      expect(typeof value).not.toBe('bigint')
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(details)
  })
})
