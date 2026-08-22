import { describe, expect, it } from 'vitest'
import { findLikelyDuplicates, planMerge, type Pairable } from './conflicts'

const DAY = 24 * 60 * 60 * 1000

function row(
  id: string,
  amount: bigint,
  when: string,
  sides: Partial<Pick<Pairable, 'fromAccountId' | 'toAccountId'>> = {},
): Pairable {
  return {
    id,
    amount,
    occurredAt: new Date(when),
    fromAccountId: sides.fromAccountId ?? null,
    toAccountId: sides.toAccountId ?? null,
    ...sides,
  }
}

const out = (id: string, amount: bigint, when: string, account = 'acc-mandiri') =>
  row(id, amount, when, { fromAccountId: account })

describe('findLikelyDuplicates', () => {
  it('pairs an exact amount on the same account within the window', () => {
    const result = findLikelyDuplicates(
      [out('m1', 150_000_00n, '2026-08-10T05:00:00.000Z')],
      [out('i1', 150_000_00n, '2026-08-11T09:00:00.000Z')],
    )
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0].manual.id).toBe('m1')
    expect(result.pairs[0].driftSeconds).toBe(Math.round((28 * 60 * 60 * 1000) / 1000))
    expect(result.unmatchedManual).toEqual([])
  })

  it('refuses a different amount however close in time', () => {
    const result = findLikelyDuplicates(
      [out('m1', 150_000_00n, '2026-08-10T05:00:00.000Z')],
      [out('i1', 150_001_00n, '2026-08-10T05:01:00.000Z')],
    )
    expect(result.pairs).toEqual([])
    expect(result.unmatchedManual.map((r) => r.id)).toEqual(['m1'])
  })

  it('refuses the same amount on a different account', () => {
    const result = findLikelyDuplicates(
      [out('m1', 150_000_00n, '2026-08-10T05:00:00.000Z', 'acc-gopay')],
      [out('i1', 150_000_00n, '2026-08-10T05:00:00.000Z', 'acc-mandiri')],
    )
    expect(result.pairs).toEqual([])
  })

  it('refuses a match beyond the tolerance, and honours a wider one', () => {
    const manual = [out('m1', 150_000_00n, '2026-08-10T05:00:00.000Z')]
    const imported = [out('i1', 150_000_00n, new Date(Date.parse('2026-08-10T05:00:00.000Z') + 5 * DAY).toISOString())]
    expect(findLikelyDuplicates(manual, imported).pairs).toEqual([])
    expect(findLikelyDuplicates(manual, imported, { toleranceDays: 7 }).pairs).toHaveLength(1)
  })

  it('gives a bank row to the nearest manual entry, not the first listed', () => {
    // Two entries bracket one bank row. A single left-to-right pass would hand
    // it to whichever was listed first.
    const far = out('m-far', 90_000_00n, '2026-08-08T05:00:00.000Z')
    const near = out('m-near', 90_000_00n, '2026-08-10T04:00:00.000Z')
    const bank = out('i1', 90_000_00n, '2026-08-10T05:00:00.000Z')

    const result = findLikelyDuplicates([far, near], [bank])
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0].manual.id).toBe('m-near')
    expect(result.unmatchedManual.map((r) => r.id)).toEqual(['m-far'])
  })

  it('never gives one bank row to two manual entries', () => {
    const result = findLikelyDuplicates(
      [out('m1', 50_000_00n, '2026-08-10T05:00:00.000Z'), out('m2', 50_000_00n, '2026-08-10T06:00:00.000Z')],
      [out('i1', 50_000_00n, '2026-08-10T05:30:00.000Z')],
    )
    expect(result.pairs).toHaveLength(1)
    expect(result.unmatchedManual).toHaveLength(1)
  })

  it('never gives one manual entry to two bank rows', () => {
    const result = findLikelyDuplicates(
      [out('m1', 50_000_00n, '2026-08-10T05:00:00.000Z')],
      [out('i1', 50_000_00n, '2026-08-10T05:30:00.000Z'), out('i2', 50_000_00n, '2026-08-10T06:00:00.000Z')],
    )
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0].imported.id).toBe('i1')
  })

  it('pairs money coming in as well as going out', () => {
    const result = findLikelyDuplicates(
      [row('m1', 2_000_000_00n, '2026-08-10T05:00:00.000Z', { toAccountId: 'acc-mandiri' })],
      [row('i1', 2_000_000_00n, '2026-08-10T07:00:00.000Z', { toAccountId: 'acc-mandiri' })],
    )
    expect(result.pairs).toHaveLength(1)
  })

  it('handles both sides being empty', () => {
    expect(findLikelyDuplicates([], [])).toEqual({ pairs: [], unmatchedManual: [] })
    expect(findLikelyDuplicates([out('m1', 1n, '2026-08-10T05:00:00.000Z')], []).unmatchedManual).toHaveLength(1)
  })
})

describe('planMerge', () => {
  const now = new Date('2026-08-22T05:00:00.000Z')
  const bank = (over: Partial<Parameters<typeof planMerge>[2]> = {}) => ({
    cashflow: 'spending' as const,
    categoryId: null,
    note: null,
    confirmedAt: null,
    ...over,
  })
  const typed = (over: Partial<Parameters<typeof planMerge>[0]> = {}) => ({
    cashflow: 'spending' as const,
    categoryId: 'cat-makan',
    note: 'makan siang',
    confirmedAt: new Date('2026-08-10T05:00:00.000Z'),
    ...over,
  })

  it('moves category and note onto an unconfirmed bank row', () => {
    const decision = planMerge(typed(), 'spending', bank(), now)
    expect(decision.adopted).toBe('category-and-note')
    expect(decision.importedPatch).toMatchObject({
      category_id: 'cat-makan',
      cashflow: 'spending',
      note: 'makan siang',
      needs_review: false,
    })
  })

  it('takes the cashflow from the category, not from the manual row', () => {
    // The manual row says spending; its category is filed under bills. What is
    // written is the category's own cashflow, because that is what the sides
    // have to satisfy.
    const decision = planMerge(typed({ cashflow: 'spending' }), 'bills', bank(), now)
    expect(decision.importedPatch?.cashflow).toBe('bills')
  })

  it('checks compatibility against the category cashflow that will be written', () => {
    // Income uses the destination side; the bank row is an outgoing payment,
    // so nothing may be written and the note is all that can move.
    const decision = planMerge(typed({ note: 'catatan' }), 'income', bank(), now)
    expect(decision.adopted).toBe('note')
    expect(decision.importedPatch).toEqual({ note: 'catatan' })
  })

  it('moves only the note when the bank row is already confirmed', () => {
    const decision = planMerge(typed(), 'spending', bank({ confirmedAt: now }), now)
    expect(decision.adopted).toBe('note')
  })

  it('keeps the bank note when the manual entry has none', () => {
    const decision = planMerge(typed({ note: null }), 'spending', bank({ note: 'dari bank' }), now)
    expect(decision.importedPatch?.note).toBe('dari bank')
  })

  it('moves nothing when there is nothing worth moving', () => {
    const decision = planMerge(
      typed({ categoryId: null, note: null }),
      null,
      bank({ note: 'ada' }),
      now,
    )
    expect(decision).toEqual({ importedPatch: null, adopted: 'nothing' })
  })
})
