import { describe, expect, it } from 'vitest'
import { monthPace, projectMonthEnd } from './pace'

describe('monthPace', () => {
  it('reads the day and length of the month in Jakarta', () => {
    const pace = monthPace('2026-08', new Date('2026-08-15T05:00:00Z'))
    expect(pace).toEqual({ day: 15, days: 31, elapsedPct: (15 / 31) * 100 })
  })

  it('crosses the month boundary on WIB time, not UTC', () => {
    // 17:30Z on 31 Aug is already 00:30 WIB on 1 Sep.
    expect(monthPace('2026-08', new Date('2026-08-31T17:30:00Z'))).toBeNull()
    expect(monthPace('2026-09', new Date('2026-08-31T17:30:00Z'))).toEqual({
      day: 1,
      days: 30,
      elapsedPct: (1 / 30) * 100,
    })
  })

  it('answers null for a past or future month', () => {
    expect(monthPace('2026-07', new Date('2026-08-15T05:00:00Z'))).toBeNull()
    expect(monthPace('2026-09', new Date('2026-08-15T05:00:00Z'))).toBeNull()
  })

  it('knows a leap February', () => {
    expect(monthPace('2028-02', new Date('2028-02-10T05:00:00Z'))?.days).toBe(29)
  })
})

describe('projectMonthEnd', () => {
  it('is plain linear from day five onward', () => {
    expect(projectMonthEnd(300_000_00n, 15, 30)).toBe(600_000_00n)
    expect(projectMonthEnd(100_000_00n, 6, 30)).toBe(500_000_00n)
  })

  it('floors the divisor at five so day one cannot forecast a fortune', () => {
    // Linear would say 31x; the floor caps it at 31/5.
    expect(projectMonthEnd(100_000_00n, 1, 31)).toBe(620_000_00n)
    expect(projectMonthEnd(100_000_00n, 4, 31)).toBe(620_000_00n)
    expect(projectMonthEnd(100_000_00n, 5, 31)).toBe(620_000_00n)
  })

  it('projects the actual itself on the last day', () => {
    expect(projectMonthEnd(1_234_567_89n, 31, 31)).toBe(1_234_567_89n)
  })

  it('answers degenerate inputs with the actual, never a throw', () => {
    expect(projectMonthEnd(0n, 15, 30)).toBe(0n)
    expect(projectMonthEnd(100n, 0, 30)).toBe(100n)
    expect(projectMonthEnd(100n, 15, 0)).toBe(100n)
  })

  it('floors like bigint division, without a float in the path', () => {
    expect(projectMonthEnd(100n, 7, 30)).toBe((100n * 30n) / 7n)
  })
})
