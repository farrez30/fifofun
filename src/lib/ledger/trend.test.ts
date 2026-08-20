import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import type { MonthlySeries, MonthlyStatement } from './monthly'
import { buildBalanceTrend } from './trend'

function month(key: string, sisaUang: bigint): MonthlySeries {
  const statement: MonthlyStatement = {
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
    sisaUang,
  }
  return { month: key, statement }
}

/** January to March 2026, as the spreadsheet closed them. */
const REAL: MonthlySeries[] = [
  month('2026-01', idr('3.398.413,00')),
  month('2026-02', idr('5.151.154,00')),
  month('2026-03', idr('2.450.825,00')),
]

describe('buildBalanceTrend', () => {
  it('needs two months before it will call a direction', () => {
    expect(buildBalanceTrend([])).toBeNull()
    expect(buildBalanceTrend([month('2026-01', idr('1.000.000,00'))])).toBeNull()
  })

  it('measures the change from the first month to the last', () => {
    const trend = buildBalanceTrend(REAL)
    expect(trend?.change).toBe(idr('2.450.825,00') - idr('3.398.413,00'))
    expect(trend?.direction).toBe('turun')
  })

  it('finds the month that came closest to empty', () => {
    const trend = buildBalanceTrend(REAL)
    expect(trend?.low.month).toBe('2026-03')
    expect(trend?.high.month).toBe('2026-02')
    expect(trend?.latest.month).toBe('2026-03')
  })

  it('takes the middle month rather than the average one', () => {
    const trend = buildBalanceTrend([
      month('2026-01', idr('1.000.000,00')),
      month('2026-02', idr('1.100.000,00')),
      month('2026-03', idr('1.200.000,00')),
      // A bonus month. The mean change would call this run a steep climb; the
      // median keeps it at the Rp100.000 a month the household actually saves.
      month('2026-04', idr('9.200.000,00')),
    ])
    expect(trend?.typicalChange).toBe(idr('100.000,00'))
  })

  it('calls a run that barely moves flat, not a rise', () => {
    const trend = buildBalanceTrend([
      month('2026-01', idr('20.000.000,00')),
      month('2026-02', idr('20.040.000,00')),
      month('2026-03', idr('20.060.000,00')),
    ])
    // Rp60.000 on Rp20 juta is three basis points a month. Reporting that as a
    // rise invites somebody to plan around when one salary happened to land.
    expect(trend?.direction).toBe('datar')
    expect(trend?.change).toBe(idr('60.000,00'))
  })

  it('calls a real rise a rise', () => {
    const trend = buildBalanceTrend([
      month('2026-01', idr('20.000.000,00')),
      month('2026-02', idr('24.000.000,00')),
    ])
    expect(trend?.direction).toBe('naik')
  })

  it('keeps its footing when the balance is negative throughout', () => {
    const trend = buildBalanceTrend([
      month('2026-01', -idr('200.000,00')),
      month('2026-02', -idr('900.000,00')),
    ])
    expect(trend?.direction).toBe('turun')
    expect(trend?.low.month).toBe('2026-02')
    expect(trend?.high.month).toBe('2026-01')
  })

  it('keeps the points in the order the months came in', () => {
    const trend = buildBalanceTrend(REAL)
    expect(trend?.points.map((point) => point.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })
})
