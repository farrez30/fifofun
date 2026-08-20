import { describe, expect, it } from 'vitest'
import type { StatementRow } from '@/lib/statement/mandiri-xlsx'
import type { LivinTransaction } from './livin'
import { enrichFromEmails, reconcileEmails } from './reconcile'

function email(overrides: Partial<LivinTransaction> = {}): LivinTransaction {
  return {
    kind: 'payment',
    recipient: 'Alfagift',
    destination: '88300000000000000',
    destinationBank: null,
    occurredAt: new Date('2026-08-19T13:58:37Z'),
    amount: 55_432_00n,
    fee: 1_000_00n,
    total: 56_432_00n,
    reference: '702608192058371938',
    note: null,
    sourceAccountMask: '****4257',
    raw: '',
    ...overrides,
  }
}

let sheetRow = 0

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  sheetRow += 1
  return {
    no: sheetRow,
    sheetRow,
    occurredAt: new Date('2026-08-19T13:58:37Z'),
    date: { year: 2026, month: 8, day: 19 },
    hasTime: true,
    description: 'Pembayaran QR ke ALFAGIFT 702608192058371938',
    lines: ['Pembayaran QR ke ALFAGIFT 702608192058371938'],
    amountIn: 0n,
    amountOut: 56_432_00n,
    balanceAfter: 1_000_000_00n,
    ...overrides,
  }
}

describe('reconcileEmails', () => {
  it('matches on the reference number when the statement carries it', () => {
    const result = reconcileEmails([email()], [row()])
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].by).toBe('reference')
    expect(result.matched[0].drift).toBe(0)
  })

  it('matches on amount and time when there is no reference to go on', () => {
    const result = reconcileEmails([email()], [row({ description: 'Pembayaran QR ke ALFAGIFT' })])
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].by).toBe('amount-and-time')
  })

  it('compares the amount including the fee, since that is what left the account', () => {
    // The email says 55.432 plus 1.000 of fee; the statement shows one 56.432.
    const result = reconcileEmails([email()], [row({ description: 'Pembayaran QR ke ALFAGIFT' })])
    expect(result.matched).toHaveLength(1)
  })

  it('allows minutes of drift but never a different amount', () => {
    const late = row({
      description: 'Pembayaran QR ke ALFAGIFT',
      occurredAt: new Date('2026-08-19T14:02:00Z'),
    })
    expect(reconcileEmails([email()], [late]).matched).toHaveLength(1)

    const wrongAmount = row({
      description: 'Pembayaran QR ke ALFAGIFT',
      amountOut: 56_433_00n,
    })
    expect(reconcileEmails([email()], [wrongAmount]).matched).toHaveLength(0)
  })

  it('refuses a match beyond the tolerance', () => {
    const hoursLater = row({
      description: 'Pembayaran QR ke ALFAGIFT',
      occurredAt: new Date('2026-08-19T18:00:00Z'),
    })
    expect(reconcileEmails([email()], [hoursLater]).matched).toHaveLength(0)
  })

  it('honours a wider tolerance when asked', () => {
    const hoursLater = row({
      description: 'Pembayaran QR ke ALFAGIFT',
      occurredAt: new Date('2026-08-19T18:00:00Z'),
    })
    const result = reconcileEmails([email()], [hoursLater], { toleranceSeconds: 6 * 60 * 60 })
    expect(result.matched).toHaveLength(1)
  })

  it('lets an exact reference match win a row a near match also wanted', () => {
    /*
      Two identical amounts seconds apart. Without doing references first, the
      closer-in-time email would take the row belonging to the one whose
      reference the statement actually prints.
    */
    const withReference = email({ reference: 'REF-A' })
    const withoutReference = email({
      reference: 'REF-B',
      occurredAt: new Date('2026-08-19T13:58:38Z'),
    })
    const only = row({ description: 'Pembayaran ke MERCHANT REF-A' })

    const result = reconcileEmails([withoutReference, withReference], [only])
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].email.reference).toBe('REF-A')
    expect(result.matched[0].by).toBe('reference')
    expect(result.emailOnly.map((e) => e.reference)).toEqual(['REF-B'])
  })

  it('never gives one statement row to two emails', () => {
    const first = email({ reference: 'REF-A' })
    const second = email({ reference: 'REF-B' })
    const result = reconcileEmails([first, second], [row({ description: 'Pembayaran' })])
    expect(result.matched).toHaveLength(1)
    expect(result.emailOnly).toHaveLength(1)
  })

  it('reports an email with no statement row as email only', () => {
    // A notified transaction that never settled: a reversal, or a failure.
    const result = reconcileEmails([email()], [])
    expect(result.emailOnly).toHaveLength(1)
    expect(result.matched).toEqual([])
  })

  it('reports a statement row with no email as a gap in the real-time channel', () => {
    const result = reconcileEmails([], [row(), row()])
    expect(result.statementOnly).toHaveLength(2)
    expect(result.coverage).toBe(0)
  })

  it('states coverage as the share of statement rows that also arrived by email', () => {
    const rows = [row({ description: 'a REF-1' }), row({ description: 'b' }), row({ description: 'c' })]
    const result = reconcileEmails([email({ reference: 'REF-1' })], rows)
    expect(result.coverage).toBeCloseTo(33.3, 1)
  })

  it('matches money coming in as well as going out', () => {
    const incoming = row({
      description: 'Transfer masuk',
      amountIn: 56_432_00n,
      amountOut: 0n,
    })
    expect(reconcileEmails([email()], [incoming]).matched).toHaveLength(1)
  })

  it('handles both sides being empty', () => {
    const result = reconcileEmails([], [])
    expect(result).toMatchObject({ matched: [], emailOnly: [], statementOnly: [], coverage: 0 })
  })
})

describe('enrichFromEmails', () => {
  it('carries over what the email knows better than the statement', () => {
    const withNote = email({
      recipient: 'FLIPTECH LENTERA INS',
      note: 'piutang',
      reference: 'REF-9',
    })
    const result = reconcileEmails([withNote], [row({ description: 'Transfer REF-9' })])
    const [enrichment] = enrichFromEmails(result)

    expect(enrichment.recipient).toBe('FLIPTECH LENTERA INS')
    expect(enrichment.note).toBe('piutang')
    expect(enrichment.reference).toBe('REF-9')
    expect(enrichment.fee).toBe(1_000_00n)
  })

  it('produces nothing where nothing matched', () => {
    expect(enrichFromEmails(reconcileEmails([email()], []))).toEqual([])
  })
})
