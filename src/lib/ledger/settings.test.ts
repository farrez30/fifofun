import { describe, expect, it } from 'vitest'
import { ACCOUNT_KEYS, ACCOUNT_KEY_LABELS, isLookedUpByName, parseIdentifiers, planReorder, twinsOf } from './settings'
import { SEED_ACCOUNTS } from './seed-data'
import { ACCOUNT_KINDS, CASHFLOW_HELP, CASHFLOW_TYPES } from './types'

/**
 * The parts of settings that other features depend on without knowing it.
 *
 * Renaming an account is a label change; moving its import key is not, and the
 * difference is invisible from the form. These lock the invariants that make
 * the difference safe.
 */

describe('ACCOUNT_KEYS', () => {
  it('is exactly the set of keys the seed hands out', () => {
    expect([...ACCOUNT_KEYS].sort()).toEqual(SEED_ACCOUNTS.map((account) => account.key).sort())
  })

  it('says what every key is actually used for', () => {
    for (const key of ACCOUNT_KEYS) {
      expect(ACCOUNT_KEY_LABELS[key]).toBeTruthy()
    }
  })

  it('matches the account kinds the database enum allows', () => {
    // The tuple exists so a picker can be built from it. If it drifts from the
    // enum, the picker offers a kind the insert will refuse.
    expect([...ACCOUNT_KINDS].sort()).toEqual(
      ['bank', 'cash', 'emoney', 'ewallet', 'investment'].sort(),
    )
  })
})

describe('parseIdentifiers', () => {
  it('reads a list separated by commas, semicolons or lines', () => {
    expect(parseIdentifiers('081234567890, 6285\n+62811111111;08999').ok).toBe(false)
    expect(parseIdentifiers('081234567890, +6281122334455\n08999888777')).toEqual({
      ok: true,
      values: ['081234567890', '+6281122334455', '08999888777'],
    })
  })

  it('drops a repeat rather than storing it twice', () => {
    expect(parseIdentifiers('081234567890, 081234567890').values).toEqual(['081234567890'])
  })

  it('accepts an empty list, because most accounts have none', () => {
    expect(parseIdentifiers('   ')).toEqual({ ok: true, values: [] })
  })

  it('refuses a number that is not one, and says which', () => {
    const parsed = parseIdentifiers('081234567890, gopay saya')
    expect(parsed.ok).toBe(false)
    expect(parsed.reason).toContain('gopay saya')
  })

  it('refuses a list longer than anybody has wallets', () => {
    const many = Array.from({ length: 11 }, (_, index) => `0812345678${index}0`).join(',')
    expect(parseIdentifiers(many).ok).toBe(false)
  })
})

describe('twinsOf', () => {
  it('pairs every savings pot with the cashflow money leaves it by', () => {
    expect(twinsOf('invest_savings')).toEqual(['from_asset'])
    expect(twinsOf('sinking_fund')).toEqual(['from_asset'])
    expect(twinsOf('financial_goal')).toEqual(['from_asset'])
  })

  it('pairs the way back with all three, since one name can be any of them', () => {
    expect(twinsOf('from_asset')).toEqual(['invest_savings', 'sinking_fund', 'financial_goal'])
  })

  it('pairs a debt lent with the same debt settled', () => {
    expect(twinsOf('receivable_new')).toEqual(['receivable_settled'])
    expect(twinsOf('receivable_settled')).toEqual(['receivable_new'])
  })

  it('leaves ordinary spending alone', () => {
    expect(twinsOf('spending')).toEqual([])
    expect(twinsOf('transfer')).toEqual([])
  })
})

describe('isLookedUpByName', () => {
  it('knows the names the importer files rows under', () => {
    expect(isLookedUpByName('Antar Account')).toBe(true)
    expect(isLookedUpByName('Biaya Bank')).toBe(true)
    // Written by the balance adjustment rather than by the importer, and just
    // as literal.
    expect(isLookedUpByName('Penyesuaian Spending')).toBe(true)
  })

  it('leaves a household own categories out of it', () => {
    expect(isLookedUpByName('Kopi')).toBe(false)
  })
})

describe('planReorder', () => {
  const rows = [
    { id: 'a', sortOrder: 1 },
    { id: 'b', sortOrder: 2 },
    { id: 'c', sortOrder: 3 },
  ]

  it('moves only the two neighbours that actually swap', () => {
    expect(planReorder(rows, 'b', 'up')).toEqual([
      { id: 'b', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
    ])
  })

  it('moves down as the mirror of moving up', () => {
    expect(planReorder(rows, 'b', 'down')).toEqual([
      { id: 'b', sortOrder: 3 },
      { id: 'c', sortOrder: 2 },
    ])
  })

  it('does nothing at either end of the list', () => {
    expect(planReorder(rows, 'a', 'up')).toEqual([])
    expect(planReorder(rows, 'c', 'down')).toEqual([])
  })

  it('does nothing for a row that is not in the list', () => {
    expect(planReorder(rows, 'z', 'up')).toEqual([])
  })

  it('numbers from the list order, not from whatever is stored', () => {
    // Every row at zero is what a household migrated from before sort_order
    // existed looks like. Swapping two zeroes has to still change the order.
    const flat = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 0 },
    ]
    expect(planReorder(flat, 'b', 'up')).toEqual([
      { id: 'b', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
    ])
  })
})

describe('CASHFLOW_HELP', () => {
  it('explains every cashflow the picker offers', () => {
    // The field is permanent once a transaction uses it, so a cashflow with a
    // label and no explanation is the worst kind of gap on that form.
    for (const cashflow of CASHFLOW_TYPES) {
      expect(CASHFLOW_HELP[cashflow]?.length ?? 0).toBeGreaterThan(20)
    }
  })

  it('says something different about each one', () => {
    const sentences = CASHFLOW_TYPES.map((cashflow) => CASHFLOW_HELP[cashflow])
    expect(new Set(sentences).size).toBe(sentences.length)
  })
})
