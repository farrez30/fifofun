import { describe, expect, it } from 'vitest'
import { describeBackfill, planOwnMoneyBackfill, type BackfillRow, type OwnMoney } from './own-money-backfill'

const OWN: OwnMoney = {
  walletNumbers: ['085800000001'],
  walletAccounts: new Map([['gopay', 'acc-gopay']]),
  accountsByNumber: new Map([
    ['103000000001', { id: 'acc-jago', name: 'Bank Jago' }],
    ['6285800000001', { id: 'acc-dana', name: 'DANA' }],
  ]),
}

function row(id: string, direction: 'in' | 'out', description: string, overrides: Partial<BackfillRow> = {}): BackfillRow {
  return {
    id,
    direction,
    rawDescription: description,
    categoryName: direction === 'in' ? 'Penyesuaian Income' : 'Other spending',
    categoryLockedAt: null,
    splitOf: null,
    ...overrides,
  }
}

const GOPAY_OWN = 'Pembayaran GoPay Customer\n085800000001'
const FROM_JAGO = 'Transfer BI Fast\nDari BANK JAGO\nFARREZ AL HAKIM 103000000001\ntransfer back'
const TO_JAGO = 'Transfer BI Fast\nKe BANK JAGO\nFARREZ AL HAKIM 103000000001'

describe('planOwnMoneyBackfill', () => {
  it('turns an own wallet top-up into money sent to the wallet account', () => {
    const plan = planOwnMoneyBackfill([row('t1', 'out', GOPAY_OWN)], OWN)

    expect(plan.moves).toEqual([{ label: 'GoPay', accountId: 'acc-gopay', side: 'to', ids: ['t1'] }])
  })

  it('gives money in from an own account its source, and money out its destination', () => {
    const plan = planOwnMoneyBackfill([row('in1', 'in', FROM_JAGO), row('out1', 'out', TO_JAGO)], OWN)

    expect(plan.moves).toEqual([
      { label: 'Bank Jago', accountId: 'acc-jago', side: 'from', ids: ['in1'] },
      { label: 'Bank Jago', accountId: 'acc-jago', side: 'to', ids: ['out1'] },
    ])
    expect(plan.count).toBe(2)
  })

  it('recognises an e-wallet paying out over BI Fast by the number it prints', () => {
    const plan = planOwnMoneyBackfill(
      [row('t1', 'in', 'Transfer BI Fast\nDari \nFARREZ AL HAKIM 6285800000001\nDANA20250611')],
      OWN,
    )

    expect(plan.moves).toEqual([{ label: 'DANA', accountId: 'acc-dana', side: 'from', ids: ['t1'] }])
  })

  it('leaves a transfer from somebody else, and a row with no description, alone', () => {
    const plan = planOwnMoneyBackfill(
      [
        row('t1', 'in', 'Transfer dari BANK MANDIRI\nANIS RENGGANIS 1160000000001\nhadiah'),
        row('t2', 'out', 'Pembayaran GoPay Customer\n08567800000'),
        row('t3', 'in', '', { rawDescription: null }),
      ],
      OWN,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(0)
  })

  it('leaves alone what a person already decided, and counts it', () => {
    const plan = planOwnMoneyBackfill(
      [
        row('chosen', 'in', FROM_JAGO, { categoryName: 'Freelance' }),
        row('held', 'out', GOPAY_OWN, { categoryLockedAt: '2026-09-01T00:00:00Z' }),
        row('split', 'in', FROM_JAGO, { splitOf: 't0' }),
      ],
      OWN,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(3)
  })

  it('reports a wallet with no account instead of guessing where the money went', () => {
    const plan = planOwnMoneyBackfill([row('t1', 'out', 'Pembayaran Danatopup\n89508085800000001')], OWN)

    expect(plan.count).toBe(0)
    expect(plan.missing).toEqual([{ wallet: 'DANA', count: 1 }])
  })
})

describe('describeBackfill', () => {
  it('says nothing when there was nothing to move', () => {
    expect(describeBackfill({ moves: [], count: 0, missing: [], protectedCount: 0 })).toBeUndefined()
  })

  it('names each other account once, what waits for an account, and what was left alone', () => {
    const text = describeBackfill({
      moves: [
        { label: 'Bank Jago', accountId: 'acc-jago', side: 'from', ids: ['t1'] },
        { label: 'Bank Jago', accountId: 'acc-jago', side: 'to', ids: ['t2'] },
        { label: 'GoPay', accountId: 'acc-gopay', side: 'to', ids: ['t3'] },
      ],
      count: 3,
      missing: [{ wallet: 'DANA', count: 1 }],
      protectedCount: 1,
    })

    expect(text).toContain('3 transaksi lama dengan Bank Jago, GoPay ternyata pindah dana antar akunmu sendiri')
    expect(text).toContain('belum ada akun DANA dengan kunci impor dana')
    expect(text).toContain('1 lainnya dibiarkan')
  })
})
