import { describe, expect, it } from 'vitest'
import { describeBackfill, planWalletBackfill, type BackfillRow } from './wallet-backfill'

const OWN = ['085800000001']
const GOPAY_ACCOUNT = 'acc-gopay'
const WALLETS = new Map([['gopay', GOPAY_ACCOUNT]])

function row(id: string, description: string, overrides: Partial<BackfillRow> = {}): BackfillRow {
  return {
    id,
    rawDescription: description,
    categoryName: 'Other spending',
    categoryLockedAt: null,
    splitOf: null,
    ...overrides,
  }
}

const GOPAY_OWN = 'Pembayaran GoPay Customer\n085800000001'

describe('planWalletBackfill', () => {
  it('moves an own top-up filed under an import default', () => {
    const plan = planWalletBackfill(
      [row('t1', GOPAY_OWN), row('t2', GOPAY_OWN, { categoryName: null })],
      OWN,
      WALLETS,
    )

    expect(plan.moves).toEqual([{ wallet: 'GoPay', accountId: GOPAY_ACCOUNT, ids: ['t1', 't2'] }])
    expect(plan.count).toBe(2)
  })

  it('ignores payments to other people, and rows with no description', () => {
    const plan = planWalletBackfill(
      [row('t1', 'Pembayaran GoPay Customer\n08567800000'), row('t2', '', { rawDescription: null })],
      OWN,
      WALLETS,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(0)
  })

  it('leaves alone what a person already decided, and counts it', () => {
    const plan = planWalletBackfill(
      [
        row('chosen', GOPAY_OWN, { categoryName: 'Transportasi' }),
        row('held', GOPAY_OWN, { categoryLockedAt: '2026-09-01T00:00:00Z' }),
        row('split', GOPAY_OWN, { splitOf: 't0' }),
      ],
      OWN,
      WALLETS,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(3)
  })

  it('reports a wallet with no account instead of guessing where the money went', () => {
    const plan = planWalletBackfill(
      [row('t1', 'Pembayaran Danatopup\n89508085800000001'), row('t2', GOPAY_OWN)],
      OWN,
      WALLETS,
    )

    expect(plan.moves.map((move) => move.ids)).toEqual([['t2']])
    expect(plan.missing).toEqual([{ wallet: 'DANA', count: 1 }])
  })
})

describe('describeBackfill', () => {
  it('says nothing when there was nothing to move', () => {
    expect(describeBackfill({ moves: [], count: 0, missing: [], protectedCount: 0 })).toBeUndefined()
  })

  it('names what moved, what waits for an account, and what was left alone', () => {
    const text = describeBackfill({
      moves: [{ wallet: 'GoPay', accountId: GOPAY_ACCOUNT, ids: ['t1', 't2'] }],
      count: 2,
      missing: [{ wallet: 'DANA', count: 1 }],
      protectedCount: 1,
    })

    expect(text).toContain('2 transaksi lama ke GoPay')
    expect(text).toContain('belum ada akun DANA dengan kunci impor dana')
    expect(text).toContain('1 top-up lain dibiarkan')
  })
})
