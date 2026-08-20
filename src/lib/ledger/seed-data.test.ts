import { describe, expect, it } from 'vitest'
import { CASHFLOW_BY_KIND } from '@/lib/statement/to-ledger'
import { DEFAULT_CATEGORY_BY_KIND, SEED_CATEGORIES } from './seed-data'
import { CASHFLOW_TYPES } from './types'

/**
 * The seed is data, and data of this shape goes wrong quietly.
 *
 * An import reads two independent tables for every row: one decides the cashflow
 * and lives in the statement layer, the other decides the category and lives
 * here. Nothing made them agree, and the first disagreement shipped: every
 * cashflow of `bills` pointed at a category list that contained no bills at all,
 * so eleven subscriptions from the spreadsheet had nowhere to land and the app
 * reported Rp0 of bills against a spreadsheet showing Rp532.883 in March alone.
 */

const byName = new Map(SEED_CATEGORIES.map((category) => [category.name, category]))

describe('seed categories', () => {
  it('covers every cashflow type', () => {
    const covered = new Set(SEED_CATEGORIES.map((category) => category.cashflow))
    // `from_asset` and `debt_payment` describe a movement rather than a
    // category of it, and the spreadsheet names no categories for either.
    const expected = CASHFLOW_TYPES.filter(
      (cashflow) => cashflow !== 'from_asset' && cashflow !== 'debt_payment',
    )
    expect([...expected].filter((cashflow) => !covered.has(cashflow))).toEqual([])
  })

  it('has no duplicate name within one cashflow', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const category of SEED_CATEGORIES) {
      const key = `${category.cashflow} ${category.name}`
      if (seen.has(key)) duplicates.push(key)
      seen.add(key)
    }
    // The unique index is on the pair, so the same name in two cashflows is
    // fine and the same name twice in one is a failed insert at seed time.
    expect(duplicates).toEqual([])
  })
})

describe('import defaults', () => {
  it('names a category that actually exists for every kind', () => {
    const missing = Object.entries(DEFAULT_CATEGORY_BY_KIND)
      .filter(([, name]) => !byName.has(name))
      .map(([kind, name]) => `${kind} -> ${name}`)
    expect(missing).toEqual([])
  })

  it('agrees with the cashflow the same kind is given', () => {
    const disagreements = Object.entries(DEFAULT_CATEGORY_BY_KIND)
      .map(([kind, name]) => ({
        kind,
        name,
        category: byName.get(name)?.cashflow,
        entry: CASHFLOW_BY_KIND[kind as keyof typeof CASHFLOW_BY_KIND],
      }))
      .filter(({ category, entry }) => category !== entry)
      .map(({ kind, name, category, entry }) => `${kind}: row is ${entry}, ${name} is ${category}`)

    expect(disagreements).toEqual([])
  })
})
