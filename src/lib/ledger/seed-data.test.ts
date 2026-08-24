import { describe, expect, it } from 'vitest'
import { CASHFLOW_BY_KIND } from '@/lib/statement/to-ledger'
import { DEFAULT_CATEGORY_BY_KIND, SEED_CATEGORIES, SEED_RULES } from './seed-data'
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
    // All eleven now. `from_asset` gained the withdrawal side of every pot, and
    // `debt_payment` gained the instalments that used to hide in spending.
    expect(CASHFLOW_TYPES.filter((cashflow) => !covered.has(cashflow))).toEqual([])
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

  it('names a real group of the same cashflow for every child', () => {
    const roots = new Set(
      SEED_CATEGORIES.filter((c) => !c.parent).map((c) => `${c.cashflow} ${c.name}`),
    )
    const orphans = SEED_CATEGORIES.filter((c) => c.parent).filter(
      (c) => !roots.has(`${c.cashflow} ${c.parent}`),
    )
    // A child under a group of another cashflow would roll up into a total it
    // does not belong to, and a child under a name nobody seeds would roll up
    // into nothing at all.
    expect(orphans.map((c) => `${c.name} -> ${c.parent}`)).toEqual([])
  })

  it('keeps groups one level deep', () => {
    const children = new Set(SEED_CATEGORIES.filter((c) => c.parent).map((c) => c.name))
    const parents = new Set(SEED_CATEGORIES.map((c) => c.parent).filter(Boolean))
    // A grandparent would need a recursive rollup, and every reader of the
    // table would have to know how deep it might go.
    expect([...parents].filter((name) => children.has(name as string))).toEqual([])
  })
})

/** Names that hold nothing themselves, because something else rolls up into them. */
const GROUPS = new Set(SEED_CATEGORIES.map((category) => category.parent).filter(Boolean))

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

  it('never falls back to a group', () => {
    // A group holds nothing, so an import landing on one would either be
    // refused or split the group's own total away from its children's.
    const grouped = Object.entries(DEFAULT_CATEGORY_BY_KIND)
      .filter(([, name]) => GROUPS.has(name))
      .map(([kind, name]) => `${kind} -> ${name}`)
    expect(grouped).toEqual([])
  })
})

describe('seed rules', () => {
  it('names a category that exists under the cashflow it claims', () => {
    const known = new Set(SEED_CATEGORIES.map((c) => `${c.cashflow} ${c.name}`))
    const missing = SEED_RULES.filter((rule) => !known.has(`${rule.cashflow} ${rule.category}`))
    expect(missing.map((rule) => `${rule.pattern} -> ${rule.cashflow} ${rule.category}`)).toEqual([])
  })

  it('never points at a group', () => {
    const grouped = SEED_RULES.filter((rule) => GROUPS.has(rule.category))
    expect(grouped.map((rule) => `${rule.pattern} -> ${rule.category}`)).toEqual([])
  })

  it('puts a narrower pattern ahead of one that would swallow it', () => {
    /*
      The engine takes the first match by priority, not the most specific one,
      so `aeropolis token` has to be numbered below anything matching a shorter
      piece of the same line. Numbering these wrong is silent: the row still
      lands somewhere, just in the wrong pot, every month.
    */
    const wrong: string[] = []
    for (const rule of SEED_RULES) {
      for (const other of SEED_RULES) {
        if (other === rule) continue
        if (!rule.pattern.includes(other.pattern)) continue
        if (rule.priority < other.priority) continue
        wrong.push(`${rule.pattern} (${rule.priority}) is shadowed by ${other.pattern} (${other.priority})`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('holds no pattern twice', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const rule of SEED_RULES) {
      const key = `${rule.matchType} ${rule.pattern}`
      if (seen.has(key)) duplicates.push(key)
      seen.add(key)
    }
    expect(duplicates).toEqual([])
  })
})
