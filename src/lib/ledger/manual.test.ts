import { describe, expect, it } from 'vitest'
import {
  adjustmentFor,
  adjustmentNote,
  describeProblem,
  manualDedupeKey,
  sidesFor,
  withinDateBounds,
} from './manual'
import { validateEntry, type LedgerEntry } from './types'

describe('sidesFor', () => {
  it('puts spending on the source side only', () => {
    expect(sidesFor('spending', { accountId: 'a1' })).toEqual({
      fromAccountId: 'a1',
      toAccountId: null,
    })
  })

  it('puts income on the destination side only', () => {
    expect(sidesFor('income', { accountId: 'a1' })).toEqual({
      fromAccountId: null,
      toAccountId: 'a1',
    })
  })

  it('needs both picks for a transfer', () => {
    expect(sidesFor('transfer', { fromAccountId: 'a1', toAccountId: 'a2' })).toEqual({
      fromAccountId: 'a1',
      toAccountId: 'a2',
    })
  })

  it('drops a side the cashflow does not use', () => {
    // A stale pick from a form that has since changed direction never reaches
    // the account-sides check.
    expect(sidesFor('income', { accountId: 'a1', fromAccountId: 'a9' })).toEqual({
      fromAccountId: null,
      toAccountId: 'a1',
    })
  })

  it('agrees with validateEntry for every cashflow it fills', () => {
    const base: Omit<LedgerEntry, 'cashflow' | 'fromAccountId' | 'toAccountId'> = {
      id: 'e1',
      occurredAt: new Date('2026-08-01T05:00:00.000Z'),
      description: 'Uji',
      amount: 10_000_00n,
      categoryId: null,
      source: 'manual',
    }
    for (const cashflow of ['spending', 'income', 'bills', 'invest_savings', 'from_asset'] as const) {
      const sides = sidesFor(cashflow, { accountId: 'a1' })
      expect(validateEntry({ ...base, cashflow, ...sides })).toEqual([])
    }
    expect(
      validateEntry({
        ...base,
        cashflow: 'transfer',
        ...sidesFor('transfer', { fromAccountId: 'a1', toAccountId: 'a2' }),
      }),
    ).toEqual([])
  })
})

describe('describeProblem', () => {
  it('translates every message validateEntry can raise', () => {
    const messages = [
      'Amount must be greater than zero',
      'spending needs a source account',
      'income must not have a source account',
      'income needs a destination account',
      'spending must not have a destination account',
      'Source and destination accounts are the same',
    ]
    const said = messages.map((message) => describeProblem({ entryId: 'e', message }))
    for (const sentence of said) {
      expect(sentence).toMatch(/\.$/)
      expect(sentence).not.toMatch(/[a-z] account/)
    }
    expect(new Set(said).size).toBe(messages.length)
  })

  it('still says something useful about a message it does not know', () => {
    expect(describeProblem({ entryId: 'e', message: 'something new' })).toBe(
      'Akunnya belum cocok dengan jenis transaksinya.',
    )
  })
})

describe('adjustmentFor', () => {
  it('records a shortfall as Penyesuaian Spending', () => {
    expect(adjustmentFor(900_000_00n, 200_000_00n)).toEqual({
      delta: -700_000_00n,
      cashflow: 'spending',
      categoryName: 'Penyesuaian Spending',
    })
  })

  it('records a surplus as Penyesuaian Income', () => {
    expect(adjustmentFor(200_000_00n, 250_000_00n)).toEqual({
      delta: 50_000_00n,
      cashflow: 'income',
      categoryName: 'Penyesuaian Income',
    })
  })

  it('does nothing when the figures agree', () => {
    expect(adjustmentFor(500n, 500n)).toBeNull()
  })
})

describe('adjustmentNote', () => {
  it('names the account and both figures', () => {
    expect(adjustmentNote('GoPay', 903_679_500n, 120_000_00n)).toBe(
      'Penyesuaian saldo GoPay: tercatat Rp9.036.795, sebenarnya Rp120.000.',
    )
  })
})

describe('manualDedupeKey', () => {
  it('prefixes the client id, so a double tap writes one row', () => {
    expect(manualDedupeKey('abc')).toBe('manual:abc')
  })
})

describe('withinDateBounds', () => {
  const now = new Date('2026-08-22T05:00:00.000Z')

  it('allows today and a day of clock drift', () => {
    expect(withinDateBounds(new Date('2026-08-22T04:00:00.000Z'), now)).toBe(true)
    expect(withinDateBounds(new Date('2026-08-22T20:00:00.000Z'), now)).toBe(true)
  })

  it('refuses a date next month', () => {
    expect(withinDateBounds(new Date('2026-09-22T05:00:00.000Z'), now)).toBe(false)
  })

  it('refuses a date before the century', () => {
    expect(withinDateBounds(new Date('1999-12-31T23:00:00.000Z'), now)).toBe(false)
  })

  it('refuses a date that is not a date', () => {
    expect(withinDateBounds(new Date('nonsense'), now)).toBe(false)
  })
})
