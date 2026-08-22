import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { buildBudgetPlan, diffBudgets, parseMonthParam, type BudgetCategory } from './budget-plan'
import type { MonthCategoryTotals } from './categories'

/**
 * The month a household is budgeting, worked out before it is drawn.
 *
 * Three of the four figures on a row can legitimately be unknown, and the
 * difference between "nothing" and "nothing yet" is the whole point: a budget
 * screen that prints Rp0 where it means "no history" teaches a household that
 * it spends nothing on something it spends plenty on.
 */

const CATEGORIES: BudgetCategory[] = [
  { id: 'c-belanja', name: 'Belanja', cashflow: 'spending', icon: 'ShoppingBag', hue: 137 },
  { id: 'c-jajan', name: 'Jajan', cashflow: 'spending', icon: 'Cookie', hue: 40 },
  { id: 'c-baru', name: 'Kategori baru', cashflow: 'spending', icon: null, hue: null },
  { id: 'c-wifi', name: 'Wifi', cashflow: 'bills', icon: 'WifiHigh', hue: 210 },
]

const HISTORY: MonthCategoryTotals[] = [
  { month: '2026-05', byCategory: { 'c-belanja': idr('1.000.000,00'), 'c-jajan': idr('200.000,00') } },
  { month: '2026-06', byCategory: { 'c-belanja': idr('1.200.000,00'), 'c-jajan': idr('180.000,00'), 'c-wifi': idr('300.000,00') } },
  { month: '2026-07', byCategory: { 'c-belanja': idr('1.500.000,00'), 'c-wifi': idr('300.000,00') } },
]

function plan(overrides: Partial<Parameters<typeof buildBudgetPlan>[0]> = {}) {
  return buildBudgetPlan({
    period: '2026-07',
    previous: '2026-06',
    categories: CATEGORIES,
    history: HISTORY,
    saved: { 'c-belanja': idr('1.300.000,00') },
    previousSaved: { 'c-wifi': idr('300.000,00') },
    ...overrides,
  })
}

describe('parseMonthParam', () => {
  it('takes a month and refuses everything else', () => {
    expect(parseMonthParam('2026-07', '2026-08')).toBe('2026-07')
    expect(parseMonthParam(undefined, '2026-08')).toBe('2026-08')
    expect(parseMonthParam('2026-13', '2026-08')).toBe('2026-08')
    expect(parseMonthParam('bulan lalu', '2026-08')).toBe('2026-08')
    expect(parseMonthParam('1899-05', '2026-08')).toBe('2026-08')
    expect(parseMonthParam('2200-05', '2026-08')).toBe('2026-08')
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(parseMonthParam(['2026-03', '2026-04'], '2026-08')).toBe('2026-03')
  })
})

describe('diffBudgets', () => {
  it('writes only what changed', () => {
    const diff = diffBudgets(
      { a: idr('100.000,00'), b: idr('50.000,00') },
      { a: idr('100.000,00'), b: idr('75.000,00'), c: idr('20.000,00') },
    )
    expect(diff.upsert).toEqual([
      { categoryId: 'b', amount: idr('75.000,00') },
      { categoryId: 'c', amount: idr('20.000,00') },
    ])
    expect(diff.remove).toEqual([])
  })

  it('treats an emptied field and a zero as removing the budget', () => {
    const diff = diffBudgets({ a: idr('100.000,00'), b: idr('50.000,00') }, { a: null, b: 0n })
    expect(diff.upsert).toEqual([])
    expect(diff.remove.sort()).toEqual(['a', 'b'])
  })

  it('leaves alone a category the form never mentioned', () => {
    // An archived category keeps the budget the month it belongs to was judged
    // against, and the table does not list it to be re-submitted.
    const diff = diffBudgets({ arsip: idr('90.000,00') }, { a: idr('10.000,00') })
    expect(diff.remove).toEqual([])
    expect(diff.upsert).toEqual([{ categoryId: 'a', amount: idr('10.000,00') }])
  })

  it('does not remove something that was never there', () => {
    expect(diffBudgets({}, { a: null }).remove).toEqual([])
  })
})

describe('buildBudgetPlan', () => {
  it('takes the median from the months before the one being judged', () => {
    const belanja = plan().lines.find((line) => line.id === 'c-belanja')!
    /*
      May and June, not July: a budget that includes the month it judges can
      never be exceeded. Two months means the lower of the two middles, which
      is what the shared median does for an even count rather than averaging
      them: an average of two bigints is a rounding decision nobody asked for.
    */
    expect(belanja.usual).toBe('Rp1.000.000')
  })

  it('says nothing about a category that has never appeared', () => {
    const baru = plan().lines.find((line) => line.id === 'c-baru')!
    expect(baru.usual).toBeNull()
    expect(baru.lastMonth).toBeNull()
    expect(baru.actual).toBeNull()
    expect(baru.amount).toBe('')
  })

  it('prefers last month budget over last month spending, and marks the difference', () => {
    const rows = plan().lines
    expect(rows.find((line) => line.id === 'c-wifi')!.lastMonth).toEqual({
      text: 'Rp300.000',
      derived: false,
    })
    // No budget was set for Jajan last month, so what it actually cost stands
    // in, and is flagged as a different kind of figure.
    expect(rows.find((line) => line.id === 'c-jajan')!.lastMonth).toEqual({
      text: 'Rp180.000',
      derived: true,
    })
  })

  it('compares spending to the budget that was set, not to the median', () => {
    const belanja = plan().lines.find((line) => line.id === 'c-belanja')!
    // Rp1,5 juta against a budget of Rp1,3 juta.
    expect(belanja.actual).toEqual({ text: 'Rp1.500.000', pct: 115, over: true })
  })

  it('reports spending with no budget without calling it over anything', () => {
    const wifi = plan().lines.find((line) => line.id === 'c-wifi')!
    expect(wifi.actual).toEqual({ text: 'Rp300.000', pct: 0, over: false })
  })

  it('knows when a month has nothing recorded yet', () => {
    const empty = plan({ period: '2026-09', previous: '2026-08' })
    expect(empty.hasData).toBe(false)
    for (const line of empty.lines) expect(line.actual).toBeNull()
  })

  it('knows when there is no history to take a median from', () => {
    const fresh = plan({ history: [], saved: {}, previousSaved: {} })
    expect(fresh.hasHistory).toBe(false)
    for (const line of fresh.lines) expect(line.usual).toBeNull()
  })

  it('totals only the budgets that are set', () => {
    const view = plan()
    expect(view.budgeted).toBe(1)
    expect(view.total).toBe('Rp1.300.000')
  })

  it('offers to copy only when it would fill something in', () => {
    // Wifi has a budget last month and none this month.
    expect(plan().canCopy).toBe(true)
    // Everything last month had is already filled in here.
    expect(plan({ saved: { 'c-wifi': idr('300.000,00') } }).canCopy).toBe(false)
    expect(plan({ previousSaved: {} }).canCopy).toBe(false)
  })

  it('puts spending before bills', () => {
    expect(plan().lines.map((line) => line.cashflow)).toEqual([
      'spending',
      'spending',
      'spending',
      'bills',
    ])
  })

  it('carries no bigint out of the module', () => {
    const view = plan()
    const seen = JSON.stringify(view, (_key, value) =>
      typeof value === 'bigint' ? '__bigint__' : value,
    )
    expect(seen).not.toContain('__bigint__')
  })
})
