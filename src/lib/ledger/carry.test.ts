import { describe, expect, it } from 'vitest'
import { rollUpByMonthAndCategory } from './categories'
import {
  addWeeks,
  buildCarrySeries,
  formatWeek,
  fromWire,
  isMonday,
  pickDefaultCategory,
  runCarry,
  weekStartOf,
  weeklyBudgetFor,
  type CarryPeriodInput,
  type WeeklyBudgetRow,
} from './carry'

/**
 * The three ways a leftover can be treated, and the weekly calendar under them.
 *
 * Every expected figure below was worked by hand from the rule in carry.ts,
 * not by running it: a period's effective budget is its base plus what came
 * in, and closing it moves the rest according to the policy.
 */

const closed = (base: bigint | null, used: bigint, key = 'p'): CarryPeriodInput => ({
  key,
  base,
  used,
  open: false,
})
const open = (base: bigint | null, used: bigint, key = 'p'): CarryPeriodInput => ({
  key,
  base,
  used,
  open: true,
})

// Under, then over, then the running period.
const UNDER_OVER_RUNNING = [closed(100n, 70n, 'a'), closed(100n, 150n, 'b'), open(100n, 50n, 'c')]

describe('runCarry', () => {
  it('bawa rolls the leftover and the overrun alike', () => {
    const run = runCarry(UNDER_OVER_RUNNING, 'bawa')
    expect(run.periods.map((p) => [p.carryIn, p.effective, p.left, p.status])).toEqual([
      [0n, 100n, 30n, 'aman'],
      [30n, 130n, -20n, 'lewat'],
      [-20n, 80n, 30n, 'aman'],
    ])
    expect(run.over).toBe(1)
    expect(run.budgeted).toBe(3)
    expect(run.saved).toBe(0n)
  })

  it('tabung saves the leftover and pays an overrun from savings first', () => {
    const run = runCarry(UNDER_OVER_RUNNING, 'tabung')
    // 30 saved; the 50 overrun takes all 30, the other 20 still rolls.
    expect(run.periods.map((p) => [p.carryIn, p.effective, p.savedAfter])).toEqual([
      [0n, 100n, 30n],
      [0n, 100n, 0n],
      [-20n, 80n, 0n],
    ])
    expect(run.saved).toBe(0n)
  })

  it('tabung keeps what an overrun did not need', () => {
    const run = runCarry([closed(100n, 40n), closed(100n, 110n), open(100n, 0n)], 'tabung')
    expect(run.saved).toBe(50n)
    expect(run.periods[2].carryIn).toBe(0n)
  })

  it('biarkan lets every period start from its own base', () => {
    const run = runCarry(UNDER_OVER_RUNNING, 'biarkan')
    expect(run.periods.map((p) => p.effective)).toEqual([100n, 100n, 100n])
    expect(run.periods.map((p) => p.status)).toEqual(['aman', 'lewat', 'aman'])
  })

  it('names spending past the base but inside the carry', () => {
    const run = runCarry([closed(100n, 70n), open(100n, 120n)], 'bawa')
    expect(run.periods[1].status).toBe('pakai-bawaan')
    expect(run.over).toBe(0)
  })

  it('spending exactly at the effective budget is not over', () => {
    const run = runCarry([closed(100n, 100n), open(100n, 100n)], 'bawa')
    expect(run.periods.map((p) => p.status)).toEqual(['aman', 'aman'])
  })

  it('a period without a budget breaks the chain but keeps the savings', () => {
    const periods = [closed(100n, 50n), closed(null, 10n), closed(100n, 100n), open(100n, 0n)]
    const bawa = runCarry(periods, 'bawa')
    expect(bawa.periods[1].status).toBe('tanpa-anggaran')
    expect(bawa.periods[1].effective).toBeNull()
    expect(bawa.periods[2].carryIn).toBe(0n)
    expect(bawa.budgeted).toBe(3)

    const tabung = runCarry(periods, 'tabung')
    expect(tabung.saved).toBe(50n)
  })

  it('starts fresh at the first budgeted period', () => {
    const run = runCarry([closed(null, 500n), closed(null, 0n), closed(100n, 20n), open(100n, 0n)], 'bawa')
    expect(run.periods[2].carryIn).toBe(0n)
    expect(run.periods[3].carryIn).toBe(80n)
    expect(run.over).toBe(0)
  })

  it('does not close an open period, so the ones after it start from zero', () => {
    const run = runCarry([closed(100n, 0n), open(100n, 0n), open(100n, 0n)], 'bawa')
    expect(run.periods.map((p) => p.carryIn)).toEqual([0n, 100n, 0n])
  })

  it('a deep overrun leaves the next period past its budget before anything is spent', () => {
    const run = runCarry([closed(100n, 350n), open(100n, 0n)], 'bawa')
    expect(run.periods[1].effective).toBe(-150n)
    expect(run.periods[1].status).toBe('lewat')
    expect(run.over).toBe(2)
  })
})

describe('weeks', () => {
  // 1 Nov 2026 is a Sunday, so 16 Nov is a Monday.
  it('finds the Jakarta Monday', () => {
    expect(weekStartOf(new Date('2026-11-16T17:30:00Z'))).toBe('2026-11-16') // Tue 00:30 WIB
    expect(weekStartOf(new Date('2026-11-15T16:59:00Z'))).toBe('2026-11-09') // Sun 23:59 WIB
    expect(weekStartOf(new Date('2026-11-15T17:00:00Z'))).toBe('2026-11-16') // Mon 00:00 WIB
    expect(weekStartOf(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12-28') // Friday
  })

  it('steps across a year', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
    expect(addWeeks('2026-11-16', -2)).toBe('2026-11-02')
  })

  it('knows a Monday from anything else', () => {
    expect(isMonday('2026-11-16')).toBe(true)
    expect(isMonday('2026-11-17')).toBe(false)
    expect(isMonday('2026-02-30')).toBe(false)
    expect(isMonday('16-11-2026')).toBe(false)
    expect(isMonday('')).toBe(false)
  })

  it('says a week the way a person would', () => {
    expect(formatWeek('2026-11-16')).toBe('16 sampai 22 Nov 2026')
    expect(formatWeek('2026-11-30')).toBe('30 Nov sampai 6 Des 2026')
    expect(formatWeek('2026-12-28')).toBe('28 Des 2026 sampai 3 Jan 2027')
  })

  it('buckets spending by Monday through the shared rollup', () => {
    const entries = [
      { occurredAt: new Date('2026-11-15T16:00:00Z'), amount: 100n, cashflow: 'spending' as const, categoryName: 'c1' },
      { occurredAt: new Date('2026-11-16T03:00:00Z'), amount: 200n, cashflow: 'spending' as const, categoryName: 'c1' },
      { occurredAt: new Date('2026-11-17T03:00:00Z'), amount: 50n, cashflow: 'income' as const, categoryName: 'c1' },
    ]
    const weeks = rollUpByMonthAndCategory(entries as never, { periodOf: weekStartOf })
    expect(weeks).toEqual([
      { month: '2026-11-09', byCategory: { c1: 100n } },
      { month: '2026-11-16', byCategory: { c1: 200n } },
    ])
  })
})

describe('weeklyBudgetFor', () => {
  const rows: WeeklyBudgetRow[] = [
    { categoryId: 'c', weekStart: '2026-11-02', amount: 35_000_000n, ongoing: true },
    { categoryId: 'c', weekStart: '2026-11-30', amount: 40_000_000n, ongoing: true },
    { categoryId: 'c', weekStart: '2026-11-16', amount: 0n, ongoing: false },
    { categoryId: 'c', weekStart: '2026-11-23', amount: 50_000_000n, ongoing: false },
    { categoryId: 'c', weekStart: '2026-12-14', amount: 0n, ongoing: true },
  ]

  it('is unbudgeted before the first standing figure', () => {
    expect(weeklyBudgetFor(rows, '2026-10-26')).toBeNull()
  })

  it('holds a standing figure until the next one', () => {
    expect(weeklyBudgetFor(rows, '2026-11-02')).toBe(35_000_000n)
    expect(weeklyBudgetFor(rows, '2026-11-09')).toBe(35_000_000n)
    expect(weeklyBudgetFor(rows, '2026-11-30')).toBe(40_000_000n)
    expect(weeklyBudgetFor(rows, '2026-12-07')).toBe(40_000_000n)
  })

  it('lets an exception change one week only', () => {
    expect(weeklyBudgetFor(rows, '2026-11-23')).toBe(50_000_000n)
    // An exception of zero is a budget of nothing, not the absence of one.
    expect(weeklyBudgetFor(rows, '2026-11-16')).toBe(0n)
  })

  it('stops at a standing zero', () => {
    expect(weeklyBudgetFor(rows, '2026-12-14')).toBeNull()
    expect(weeklyBudgetFor(rows, '2027-01-04')).toBeNull()
  })
})

describe('buildCarrySeries', () => {
  const series = buildCarrySeries({
    categoryIds: ['dating', 'jajan'],
    months: ['2026-10', '2026-11'],
    weeks: ['2026-11-09', '2026-11-16'],
    thisMonth: '2026-11',
    thisWeek: '2026-11-16',
    monthlyUsed: [{ month: '2026-10', byCategory: { dating: 120n, jajan: 5n } }],
    weeklyUsed: [{ month: '2026-11-16', byCategory: { dating: 30n } }],
    monthlyBudgets: [
      { period: '2026-10', categoryId: 'dating', amount: 100n },
      { period: '2026-11', categoryId: 'dating', amount: 100n },
    ],
    weeklyBudgets: [{ categoryId: 'dating', weekStart: '2026-11-16', amount: 25n, ongoing: true }],
  })

  it('sends strings, null where nothing was budgeted, and marks the running period open', () => {
    expect(series[0].monthly).toEqual([
      { key: '2026-10', tick: 'Okt', label: 'Okt 2026', base: '100', used: '120', open: false },
      { key: '2026-11', tick: 'Nov', label: 'Nov 2026', base: '100', used: '0', open: true },
    ])
    expect(series[0].weekly).toEqual([
      { key: '2026-11-09', tick: '9', label: '9 sampai 15 Nov 2026', base: null, used: '0', open: false },
      { key: '2026-11-16', tick: '16', label: '16 sampai 22 Nov 2026', base: '25', used: '30', open: true },
    ])
    expect(series[1].monthly.map((p) => p.base)).toEqual([null, null])
    expect(series[1].weeklyRows).toEqual([])
  })

  it('round-trips through the wire', () => {
    expect(fromWire(series[0].monthly)[0]).toEqual({ key: '2026-10', base: 100n, used: 120n, open: false })
  })

  it('opens on the category that overran most', () => {
    expect(pickDefaultCategory(series)).toBe('dating')
  })
})

describe('pickDefaultCategory', () => {
  const month = (base: string | null, used: string) => ({
    key: 'k',
    tick: 't',
    label: 'l',
    base,
    used,
    open: false,
  })
  const one = (categoryId: string, monthly: ReturnType<typeof month>[]) => ({
    categoryId,
    monthly,
    weekly: [],
    weeklyRows: [],
  })

  it('breaks a tie in overruns by spending', () => {
    const picked = pickDefaultCategory([
      one('a', [month('100', '150')]),
      one('b', [month('100', '900')]),
    ])
    expect(picked).toBe('b')
  })

  it('skips categories that were never budgeted', () => {
    expect(pickDefaultCategory([one('a', [month(null, '999')]), one('b', [month('1', '0')])])).toBe('b')
  })

  it('falls back to the first when none is budgeted', () => {
    expect(pickDefaultCategory([one('a', [month(null, '9')])])).toBe('a')
  })
})
