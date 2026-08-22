import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { computeAccountMovements, computeMonthlySeries } from './monthly'
import {
  compatibleCategories,
  editableFields,
  isBankFact,
  planSplit,
  splitBlocker,
  splitRemainder,
  SPLIT_MAX,
} from './edit'

/**
 * What a person may change about a transaction.
 *
 * The distinction under all of it is between what the bank said and what
 * somebody decided about it. Getting that wrong in either direction is bad:
 * editable bank amounts break reconciliation, and uneditable categories make
 * the review queue pointless.
 */

describe('isBankFact', () => {
  it('counts both statement and email as the bank speaking', () => {
    expect(isBankFact('xlsx')).toBe(true)
    expect(isBankFact('email')).toBe(true)
    expect(isBankFact('manual')).toBe(false)
    expect(isBankFact('telegram')).toBe(false)
  })
})

describe('editableFields', () => {
  it('lets a statement row be recategorised but never re-priced', () => {
    const fields = editableFields({ source: 'xlsx', cashflow: 'spending' })
    expect(fields.category).toBe(true)
    expect(fields.passThrough).toBe(true)
    expect(fields.split).toBe(true)
    expect(fields.amount).toBe(false)
    expect(fields.when).toBe(false)
    expect(fields.accounts).toBe(false)
    expect(fields.remove).toBe(false)
  })

  it('lets a typed row be changed in every way, including removed', () => {
    const fields = editableFields({ source: 'manual', cashflow: 'spending' })
    expect(Object.values(fields).every(Boolean)).toBe(true)
  })

  it('treats a Telegram note as typed, because it was', () => {
    expect(editableFields({ source: 'telegram', cashflow: 'income' }).remove).toBe(true)
  })

  it('leaves a transfer without a category or a split', () => {
    // Which accounts it moves money between is the entire content of the row.
    const fields = editableFields({ source: 'manual', cashflow: 'transfer' })
    expect(fields.category).toBe(false)
    expect(fields.split).toBe(false)
    expect(fields.amount).toBe(true)
  })
})

describe('compatibleCategories', () => {
  const categories = [
    { id: 'gaji', cashflow: 'income' as const },
    { id: 'belanja', cashflow: 'spending' as const },
    { id: 'wifi', cashflow: 'bills' as const },
    { id: 'pindah', cashflow: 'transfer' as const },
  ]

  it('offers only categories pointing the same way as the row', () => {
    expect(compatibleCategories(categories, 'spending').map((row) => row.id)).toEqual([
      'belanja',
      'wifi',
    ])
    expect(compatibleCategories(categories, 'income').map((row) => row.id)).toEqual(['gaji'])
  })

  it('offers a transfer nothing but another transfer', () => {
    expect(compatibleCategories(categories, 'transfer').map((row) => row.id)).toEqual(['pindah'])
  })
})

describe('planSplit', () => {
  const parent = { id: 'tx-1', description: 'ALFAMART CIPUTAT', amount: idr('150.000,00') }

  const part = (amount: bigint, categoryId = 'cat-belanja', description = '') => ({
    amount,
    categoryId,
    description,
  })

  it('divides a receipt into parts that add up to it exactly', () => {
    const plan = planSplit(parent, [
      part(idr('100.000,00'), 'cat-belanja', 'sabun'),
      part(idr('50.000,00'), 'cat-makan'),
    ])

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.children).toEqual([
      {
        amount: idr('100.000,00'),
        categoryId: 'cat-belanja',
        description: 'sabun',
        dedupeKey: 'split:tx-1:1',
      },
      {
        // A part nobody named keeps the parent's description rather than
        // landing in the ledger as an empty row.
        amount: idr('50.000,00'),
        categoryId: 'cat-makan',
        description: 'ALFAMART CIPUTAT',
        dedupeKey: 'split:tx-1:2',
      },
    ])
  })

  it('numbers the keys from one, and from the parent', () => {
    const plan = planSplit(parent, [part(idr('75.000,00')), part(idr('75.000,00'))])
    if (!plan.ok) throw new Error('expected a plan')
    expect(plan.children.map((child) => child.dedupeKey)).toEqual([
      'split:tx-1:1',
      'split:tx-1:2',
    ])
  })

  it('refuses parts that do not add up, and says by how much', () => {
    const short = planSplit(parent, [part(idr('100.000,00')), part(idr('40.000,00'))])
    expect(short).toEqual({ ok: false, problem: 'sum', difference: idr('10.000,00') })

    const over = planSplit(parent, [part(idr('100.000,00')), part(idr('60.000,00'))])
    expect(over).toEqual({ ok: false, problem: 'sum', difference: -idr('10.000,00') })
  })

  it('refuses a part worth nothing', () => {
    const plan = planSplit(parent, [part(idr('150.000,00')), part(0n)])
    expect(plan).toMatchObject({ ok: false, problem: 'zero' })
  })

  it('refuses fewer than two parts and more than six', () => {
    expect(planSplit(parent, [part(parent.amount)])).toMatchObject({ problem: 'count' })

    const seven = Array.from({ length: 7 }, () => part(idr('21.428,58')))
    expect(planSplit(parent, seven)).toMatchObject({ problem: 'count' })
  })

  it('accepts exactly six, which is the most a receipt is worth dividing into', () => {
    const six = Array.from({ length: SPLIT_MAX }, () => part(idr('25.000,00')))
    expect(planSplit(parent, six).ok).toBe(true)
  })
})

describe('splitRemainder', () => {
  it('counts what is left to divide, and what has been over-divided', () => {
    expect(splitRemainder(idr('150.000,00'), [{ amount: idr('100.000,00') }])).toBe(
      idr('50.000,00'),
    )
    expect(splitRemainder(idr('150.000,00'), [{ amount: idr('200.000,00') }])).toBe(
      -idr('50.000,00'),
    )
    expect(splitRemainder(idr('150.000,00'), [])).toBe(idr('150.000,00'))
  })
})

describe('memisah transaksi tidak menggeser angka apa pun', () => {
  const parent = {
    id: 'tx-parent',
    occurredAt: new Date('2026-07-15T05:00:00.000Z'),
    description: 'ALFAMART CIPUTAT',
    amount: idr('150.000,00'),
    cashflow: 'spending' as const,
    categoryId: 'cat-belanja',
    fromAccountId: 'acc-mandiri',
    toAccountId: null,
    source: 'xlsx' as const,
  }

  const other = {
    ...parent,
    id: 'tx-gaji',
    description: 'GAJI',
    amount: idr('8.000.000,00'),
    cashflow: 'income' as const,
    fromAccountId: null,
    toAccountId: 'acc-mandiri',
  }

  /*
    The claim the split feature is built on: the parts replace the original
    exactly, so the running balance the import reconciles against does not
    move. Asserted against the real monthly engine rather than against the
    planner, because that engine is what the reconciliation reads.
  */
  it('leaves the monthly statement and the account balance identical', () => {
    const plan = planSplit(parent, [
      { amount: idr('100.000,00'), categoryId: 'cat-belanja', description: 'sabun' },
      { amount: idr('50.000,00'), categoryId: 'cat-makan', description: '' },
    ])
    if (!plan.ok) throw new Error('expected a plan')

    const children = plan.children.map((child, index) => ({
      ...parent,
      id: `tx-child-${index}`,
      description: child.description,
      amount: child.amount,
      categoryId: child.categoryId,
    }))

    const before = computeMonthlySeries([other, parent], idr('1.000.000,00'))
    const after = computeMonthlySeries([other, ...children], idr('1.000.000,00'))

    expect(after).toEqual(before)

    const account = {
      id: 'acc-mandiri',
      name: 'Bank Mandiri',
      kind: 'bank' as const,
      openingBalance: 0n,
    }
    expect(computeAccountMovements([other, ...children], [account])).toEqual(
      computeAccountMovements([other, parent], [account]),
    )
  })

  it('would move them if the parts did not add up, which is why they must', () => {
    const short = [
      { ...parent, id: 'tx-child-0', amount: idr('100.000,00') },
      { ...parent, id: 'tx-child-1', amount: idr('40.000,00') },
    ]
    const before = computeMonthlySeries([other, parent], idr('1.000.000,00'))
    const after = computeMonthlySeries([other, ...short], idr('1.000.000,00'))

    // Rp10.000 of spending that never happened, which is exactly what
    // `planSplit` refuses to produce.
    expect(after[0].statement.sisaUang - before[0].statement.sisaUang).toBe(idr('10.000,00'))
  })
})

describe('splitBlocker', () => {
  const total = idr('150.000,00')
  const part = (amount: bigint, categoryId = 'cat-belanja') => ({ amount, categoryId })

  it('reports the arithmetic first, in both directions', () => {
    expect(splitBlocker(total, [part(idr('100.000,00')), part(idr('40.000,00'))])).toEqual({
      kind: 'remainder',
      amount: idr('10.000,00'),
    })
    expect(splitBlocker(total, [part(idr('100.000,00')), part(idr('60.000,00'))])).toEqual({
      kind: 'excess',
      amount: idr('10.000,00'),
    })
  })

  it('names the part that is still empty once the sum is right', () => {
    // The failure this exists for: the two parts sum to the original exactly,
    // so the old status read "Pas" while the button stayed disabled and said
    // nothing at all about the part still worth nothing.
    expect(splitBlocker(total, [part(idr('150.000,00')), part(0n)])).toEqual({
      kind: 'zero',
      part: 2,
    })
  })

  it('names the part with no category, numbered the way a person counts', () => {
    expect(splitBlocker(total, [part(idr('100.000,00')), part(idr('50.000,00'), '')])).toEqual({
      kind: 'category',
      part: 2,
    })
  })

  it('says nothing is in the way when nothing is', () => {
    expect(splitBlocker(total, [part(idr('100.000,00')), part(idr('50.000,00'))])).toBeNull()
  })
})
