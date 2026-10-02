import { describe, expect, it } from 'vitest'
import { groupOf, lastFullMonth, monthsEnding, summariseMonths, SUMMARY_CONFIG } from './summary'
import type { CashflowType } from './types'

let seq = 0
function entry(cashflow: CashflowType, categoryName: string, rupiah: number, day: string, extra: object = {}) {
  seq += 1
  return {
    id: `e${seq}`,
    occurredAt: new Date(`${day}T05:00:00Z`),
    description: categoryName,
    amount: BigInt(rupiah) * 100n,
    cashflow,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'xlsx' as const,
    categoryName,
    ...extra,
  }
}

const MONTHS = ['2026-07', '2026-08', '2026-09']
const rp = (rupiah: number) => BigInt(rupiah) * 100n

describe('monthsEnding / lastFullMonth', () => {
  it('counts back across a year boundary', () => {
    expect(monthsEnding('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('takes the month before the current one, in Jakarta time', () => {
    expect(lastFullMonth(new Date('2026-10-02T05:00:00Z'))).toBe('2026-09')
    // 1 Oct 01:00 in Jakarta is still 30 Sep in UTC; October has begun all the same.
    expect(lastFullMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-09')
  })
})

describe('groupOf', () => {
  const parentOf = (name: string) => ({ 'Jajan Baru': 'Makan & Minum' })[name] ?? null

  it('uses the category, then its parent, then the fallback', () => {
    expect(groupOf('Dating', parentOf)).toBe('Gaya hidup')
    expect(groupOf('Jajan Baru', parentOf)).toBe('Makan & harian')
    expect(groupOf('Sesuatu Baru', parentOf)).toBe(SUMMARY_CONFIG.spending.fallback)
  })

  it('puts the decisions the household confirmed where they agreed', () => {
    expect(groupOf('Barbershop & Salon', () => null)).toBe('Gaya hidup')
    expect(groupOf('Edukasi', () => null)).toBe('Langganan & alat kerja')
    expect(groupOf('Sedekah', () => null)).toBe('Keluarga')
    expect(groupOf('Pajak & STNK', () => 'Transport')).toBe('Rutin lain')
  })
})

describe('summariseMonths', () => {
  const report = summariseMonths(
    [
      entry('income', 'Gaji', 6_300_000, '2026-07-27'),
      entry('income', 'Gaji', 6_120_000, '2026-08-27'),
      entry('income', 'Freelance', 500_000, '2026-08-17'),
      entry('income', 'Bonus Naturally Plus', 555_000, '2026-09-24'),
      entry('income', 'Transfer Keluarga', 300_000, '2026-08-16'),
      entry('income', 'Jual Barang', 1_400_000, '2026-07-07'),
      entry('income', 'Penggantian Keluarga', 304_000, '2026-08-30'),
      entry('receivable_settled', 'Piutang', 500_000, '2026-08-09'),
      entry('receivable_new', 'Piutang', 500_000, '2026-08-09'),
      entry('spending', 'Kos & Sewa', 1_500_000, '2026-07-01'),
      entry('spending', 'Dating', 1_581_448, '2026-08-02'),
      entry('spending', 'Belanja Harian', 278_580, '2026-08-30'),
      entry('spending', 'Penyesuaian Spending', 7_350_547, '2026-08-23'),
      entry('spending', 'Dating', 407_242, '2026-08-02', { isPassThrough: true }),
      entry('spending', 'Pajak & STNK', 727_500, '2026-07-14'),
      entry('invest_savings', 'Dana Darurat', 950_000, '2026-09-28'),
      entry('spending', 'Kos & Sewa', 1_500_000, '2026-06-01'),
    ],
    MONTHS,
  )

  it('counts only earned income, and names the rest', () => {
    const gaji = report.income.find((row) => row.label === 'Gaji')!
    expect(gaji.values).toEqual([rp(6_300_000), rp(6_120_000), 0n])
    expect(report.income.find((row) => row.label === 'Lain-lain')!.values[2]).toBe(rp(555_000))
    expect(report.incomeTotal.values).toEqual([rp(6_300_000), rp(6_620_000), rp(555_000)])
    const excluded = Object.fromEntries(report.excluded.map((row) => [row.label, row.total]))
    expect(excluded['Kiriman keluarga']).toBe(rp(300_000))
    expect(excluded['Penjualan barang sekali']).toBe(rp(1_400_000))
    expect(excluded['Piutang yang kembali']).toBe(rp(500_000))
    expect(excluded['Uang yang dipinjamkan']).toBe(rp(500_000))
    expect(excluded['Koreksi saldo']).toBe(rp(7_350_547))
    const side = Object.fromEntries(report.excluded.map((row) => [row.label, row.side]))
    expect(side['Kiriman keluarga']).toBe('income')
    expect(side['Piutang yang kembali']).toBe('income')
    expect(side['Uang yang dipinjamkan']).toBe('spending')
  })

  it('takes reimbursements off spending instead of adding them to income', () => {
    expect(report.netted.values).toEqual([0n, rp(304_000), 0n])
    const august = report.spending.reduce((total, row) => total + row.values[1], 0n)
    expect(report.spendingTotal.values[1]).toBe(august - rp(304_000))
  })

  it('leaves pass-through money and savings out of spending', () => {
    const lifestyle = report.spending.find((row) => row.label === 'Gaya hidup')!
    expect(lifestyle.values[1]).toBe(rp(1_581_448))
    expect(report.excluded.some((row) => row.label.startsWith('Titipan'))).toBe(true)
  })

  it('spreads a yearly tax over twelve months instead of one', () => {
    const routine = report.spending.find((row) => row.label === 'Rutin lain')!
    expect(routine.values).toEqual([rp(727_500) / 12n, rp(727_500) / 12n, rp(727_500) / 12n])
  })

  it('ignores months outside the window and sorts groups by their average', () => {
    expect(report.spending.find((row) => row.label === 'Tempat tinggal')!.values).toEqual([rp(1_500_000), 0n, 0n])
    const averages = report.spending.map((row) => row.average)
    expect([...averages].sort((a, b) => (b > a ? 1 : -1))).toEqual(averages)
  })

  it('keeps every group, even an empty one, so the table never changes shape', () => {
    expect(report.spending.map((row) => row.label).sort()).toEqual(
      SUMMARY_CONFIG.spending.groups.map((group) => group.label).sort(),
    )
  })

  it('works out what is left each month and on average', () => {
    expect(report.remainder.values).toEqual(
      report.incomeTotal.values.map((value, index) => value - report.spendingTotal.values[index]),
    )
    const sum = report.remainder.values.reduce((total, value) => total + value, 0n)
    expect(report.remainder.average).toBe((sum + 1n) / 3n)
  })
})
