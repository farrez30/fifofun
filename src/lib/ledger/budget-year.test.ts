import { describe, expect, it } from 'vitest'
import { buildBudgetYear } from './budget-year'

const PERIODS = ['2026-05', '2026-06', '2026-07', '2026-08']

function build(overrides: Partial<Parameters<typeof buildBudgetYear>[0]> = {}) {
  return buildBudgetYear({
    periods: PERIODS,
    history: [
      { month: '2026-05', byCategory: { a: 400n, b: 100n } },
      { month: '2026-06', byCategory: { a: 1_000n } },
      { month: '2026-08', byCategory: { a: 250n } },
    ],
    budgets: [
      { period: '2026-06', amount: 600n },
      { period: '2026-06', amount: 200n },
      { period: '2026-08', amount: 500n },
    ],
    ...overrides,
  })
}

describe('buildBudgetYear', () => {
  it('shares one ceiling across every column', () => {
    const view = build()
    // The tallest thing anywhere is June's 1000 of spending.
    expect(view.months.find((m) => m.month === '2026-06')?.outPct).toBe(100)
    expect(view.months.find((m) => m.month === '2026-05')?.outPct).toBe(50)
    expect(view.months.find((m) => m.month === '2026-08')?.budgetPct).toBe(50)
  })

  it('sums budget rows per month and flags the month that broke its total', () => {
    const june = build().months.find((m) => m.month === '2026-06')
    expect(june?.budgetText).not.toBeNull()
    expect(june?.over).toBe(true)
    const august = build().months.find((m) => m.month === '2026-08')
    expect(august?.over).toBe(false)
  })

  it('keeps a budgetless month quiet rather than alarmed', () => {
    const may = build().months.find((m) => m.month === '2026-05')
    expect(may?.budgetText).toBeNull()
    expect(may?.budgetPct).toBeNull()
    expect(may?.over).toBe(false)
  })

  it('tells an absent month apart from a zero one', () => {
    const july = build().months.find((m) => m.month === '2026-07')
    expect(july?.hasData).toBe(false)
    expect(july?.outSen).toBe('0')
  })

  it('pads every asked-for period even before the first history month', () => {
    const view = build({ periods: ['2025-01', ...PERIODS] })
    expect(view.months).toHaveLength(5)
    expect(view.months[0]).toMatchObject({ month: '2025-01', hasData: false })
  })

  it('says when there is nothing at all to draw', () => {
    expect(build({ history: [], budgets: [] }).hasAny).toBe(false)
    expect(build().hasAny).toBe(true)
  })
})
