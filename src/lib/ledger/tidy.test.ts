import { describe, expect, it } from 'vitest'
import type { Rule } from './rules'
import { PARKING_CATEGORIES, planTidy, type TidyRow, type TidyTarget } from './tidy'
import type { CashflowType } from './types'

/**
 * Tidying rewrites rows a person may have been looking at for a year, and
 * there is no undo. Everything worth asserting here is a refusal.
 */

const TARGETS: TidyTarget[] = [
  { id: 'bensin', name: 'Bensin', cashflow: 'spending' },
  { id: 'listrik', name: 'Listrik', cashflow: 'bills' },
  { id: 'gaji', name: 'Gaji', cashflow: 'income' },
]

function rule(pattern: string, categoryId: string, cashflow: CashflowType, priority = 20): Rule {
  return {
    id: `rule-${pattern}`,
    priority,
    matchType: 'contains',
    pattern,
    cashflow,
    categoryId,
    autoApply: true,
    hitCount: 0,
  }
}

let seq = 0
function row(
  description: string,
  categoryName: string | null,
  cashflow: CashflowType = 'spending',
  amount = 100_000_00n,
): TidyRow {
  seq++
  return { id: `row-${seq}`, description, rawDescription: description, amount, cashflow, categoryName }
}

describe('planTidy', () => {
  it('moves a row out of a category the importer only parked it in', () => {
    const plan = planTidy(
      [row('SPBU 31.11802 Kalideres', 'Makan/minum')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(1)
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0]).toMatchObject({ from: 'Makan/minum', to: 'Bensin', count: 1 })
    expect(plan.protectedCount).toBe(0)
  })

  it('leaves a category somebody chose exactly where it is', () => {
    // The same row, already filed under something nobody defaults to. A rule
    // matching it is not a reason to overrule the person who filed it.
    const plan = planTidy(
      [row('SPBU 31.11802 Kalideres', 'Kendaraan')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(1)
  })

  it('counts an uncategorised row as fair game', () => {
    const plan = planTidy(
      [row('SPBU 31.11802', null)],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(1)
    expect(plan.moves[0].from).toBe('(tanpa kategori)')
  })

  it('refuses to write a spending category onto money coming in', () => {
    /*
      A rule taught on a payment to somebody matches the refund they send back.
      Writing the outgoing category onto the incoming row is the shape the
      account-sides check refuses, and one such row fails the whole batch.
    */
    const plan = planTidy(
      [row('SPBU refund', 'Penyesuaian Income', 'income')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
  })

  it('promises nothing for a row already where the rule wants it', () => {
    const plan = planTidy(
      [row('SPBU 31.11802', 'Bensin')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
    // Bensin is not a parking category, so the row is protected as well as
    // already correct; either way nothing is promised.
    expect(plan.moves).toEqual([])
  })

  it('follows priority when two rules match, the way the importer does', () => {
    const plan = planTidy(
      [row('Aeropolis Token Listrik', 'Makan/minum', 'bills')],
      [rule('listrik', 'listrik', 'bills', 20), rule('aeropolis', 'bensin', 'spending', 30)],
      TARGETS,
    )
    expect(plan.moves[0]).toMatchObject({ to: 'Listrik' })
  })

  it('groups by the pot moved out of and the pot moved into', () => {
    const plan = planTidy(
      [
        row('SPBU A', 'Makan/minum', 'spending', 50_000_00n),
        row('SPBU B', 'Makan/minum', 'spending', 30_000_00n),
        row('SPBU C', 'Belanja', 'spending', 20_000_00n),
      ],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(3)
    expect(plan.moves).toHaveLength(2)
    // Largest first, so the row a person reads before agreeing is the one that
    // moves the most money.
    expect(plan.moves[0]).toMatchObject({ from: 'Makan/minum', count: 2, amount: 80_000_00n })
    expect(plan.moves[1]).toMatchObject({ from: 'Belanja', count: 1 })
    expect(plan.amount).toBe(100_000_00n)
  })

  it('ignores a rule pointing at a category that no longer exists', () => {
    const plan = planTidy(
      [row('SPBU A', 'Makan/minum')],
      [rule('spbu', 'deleted-category', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
  })

  it('never lists a parking category that is also a group', () => {
    // Every name on the list has to be somewhere a row can actually sit.
    expect(PARKING_CATEGORIES).toContain('Other spending')
    expect(PARKING_CATEGORIES).not.toContain('Belanja Harian')
  })
})
