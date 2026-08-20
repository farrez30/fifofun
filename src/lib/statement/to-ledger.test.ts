import { describe, expect, it } from 'vitest'
import { parseIdAmount } from '@/lib/money'
import type { ParsedStatement, StatementRow } from './mandiri-xlsx'
import { entryIdFor, statementToLedger, type ConversionOptions } from './to-ledger'

/**
 * The guarantees this file exists to protect.
 *
 * Re-importing a statement, or importing two statements whose periods overlap,
 * must not duplicate a single transaction. That promise rests entirely on
 * `entryIdFor` producing the same hash for the same real movement and a
 * different one for two movements that merely look alike, so both halves are
 * tested rather than assumed.
 */

interface RowSpec {
  no?: number | null
  sheetRow?: number
  at: string
  lines: string[]
  in?: string
  out?: string
  balance: string
}

function row(spec: RowSpec): StatementRow {
  const at = new Date(spec.at)
  return {
    no: spec.no ?? 1,
    sheetRow: spec.sheetRow ?? 17,
    occurredAt: at,
    date: { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() },
    hasTime: true,
    description: spec.lines.join('\n'),
    lines: spec.lines,
    amountIn: spec.in ? parseIdAmount(spec.in) : 0n,
    amountOut: spec.out ? parseIdAmount(spec.out) : 0n,
    balanceAfter: parseIdAmount(spec.balance),
  }
}

function statement(rows: StatementRow[]): ParsedStatement {
  const totalIn = rows.reduce((sum, r) => sum + r.amountIn, 0n)
  const totalOut = rows.reduce((sum, r) => sum + r.amountOut, 0n)
  const closing = rows.at(-1)?.balanceAfter ?? 0n
  return {
    header: {
      accountHolder: 'BUDI SANTOSO',
      branch: 'KCP Jakarta Contoh',
      productName: 'Tabungan Payroll',
      accountNumber: '1230000000001',
      currency: 'IDR',
      periodStart: { year: 2026, month: 3, day: 1 },
      periodEnd: { year: 2026, month: 3, day: 31 },
      issuedOn: null,
      openingBalance: closing - totalIn + totalOut,
      totalIn,
      totalOut,
      closingBalance: closing,
    },
    rows,
    reconciliation: { ok: true, issues: [], sumIn: totalIn, sumOut: totalOut },
  }
}

const OPTIONS: ConversionOptions = {
  ownIdentifiers: ['081200000001'],
  accounts: {
    bankAccountId: 'mandiri',
    cashAccountId: 'cash',
    wallets: { GoPay: 'gopay', DANA: 'dana', ShopeePay: 'shopeepay' },
  },
}

const QRIS = {
  at: '2026-03-01T09:59:49.000Z',
  lines: ['Pembayaran QR', 'ke KOPI KENANGAN CONTOH', '600000000001'],
  out: '50.000,00',
  balance: '950.000,00',
}

describe('entryIdFor', () => {
  it('gives the same id to the same movement read twice', () => {
    expect(entryIdFor('mandiri', row(QRIS))).toBe(entryIdFor('mandiri', row(QRIS)))
  })

  it('ignores the printed sequence number and the sheet position', () => {
    // The same transaction sits at a different row and carries a different "No"
    // in a statement covering a wider period. If either entered the hash, an
    // overlapping import would write the transaction a second time.
    const march = row({ ...QRIS, no: 1, sheetRow: 17 })
    const quarter = row({ ...QRIS, no: 148, sheetRow: 312 })
    expect(entryIdFor('mandiri', quarter)).toBe(entryIdFor('mandiri', march))
  })

  it('separates two transactions that differ only in running balance', () => {
    // Same second, same amount, same wording. The balance the bank printed is
    // what tells them apart, and it is why it belongs in the key.
    const first = row({ ...QRIS, balance: '950.000,00' })
    const second = row({ ...QRIS, balance: '900.000,00' })
    expect(entryIdFor('mandiri', second)).not.toBe(entryIdFor('mandiri', first))
  })

  it('separates the same row read against a different account', () => {
    expect(entryIdFor('jago', row(QRIS))).not.toBe(entryIdFor('mandiri', row(QRIS)))
  })
})

describe('re-importing a statement', () => {
  it('produces an identical set of ids, so every row collides on the dedupe key', () => {
    const rows = [
      row(QRIS),
      row({
        at: '2026-03-02T11:50:42.000Z',
        lines: ['Transfer dari BANK MANDIRI', 'SITI RAHAYU 1230000000002', 'patungan makan'],
        in: '200.000,00',
        balance: '1.150.000,00',
      }),
    ]

    const first = statementToLedger(statement(rows), OPTIONS)
    const second = statementToLedger(statement(rows.map((r) => ({ ...r }))), OPTIONS)

    expect(second.entries.map((e) => e.id)).toEqual(first.entries.map((e) => e.id))
    expect(new Set(first.entries.map((e) => e.id)).size).toBe(first.entries.length)
  })

  it('matches the ids of a wider statement that covers the same days', () => {
    const march = statementToLedger(statement([row(QRIS)]), OPTIONS)
    const quarter = statementToLedger(
      statement([
        row({
          at: '2026-01-05T03:00:00.000Z',
          lines: ['Biaya administrasi rekening'],
          out: '1.000,00',
          balance: '999.000,00',
        }),
        row({ ...QRIS, no: 148, sheetRow: 312 }),
      ]),
      OPTIONS,
    )

    expect(quarter.entries.map((e) => e.id)).toContain(march.entries[0].id)
  })
})

describe('fee linking', () => {
  it('attaches a fee to the transaction charged in the same second', () => {
    const parent = row({
      at: '2026-03-03T02:15:00.000Z',
      lines: ['Pembayaran Danatopup', '89508081200000001'],
      out: '100.000,00',
      balance: '900.000,00',
    })
    const fee = row({
      at: '2026-03-03T02:15:00.000Z',
      lines: ['Biaya transaksi bank', 'Pembayaran Danatopup', '89508081200000001'],
      out: '1.000,00',
      balance: '899.000,00',
    })

    const { entries } = statementToLedger(statement([parent, fee]), OPTIONS)
    expect(entries[1].feeParentId).toBe(entries[0].id)
    expect(entries[0].feeParentId).toBeUndefined()
  })

  it('leaves a fee unlinked when no neighbour shares its timestamp', () => {
    const fee = row({
      at: '2026-03-31T16:59:00.000Z',
      lines: ['Biaya administrasi rekening'],
      out: '1.000,00',
      balance: '899.000,00',
    })
    const { entries } = statementToLedger(statement([fee]), OPTIONS)
    expect(entries[0].feeParentId).toBeUndefined()
  })
})

describe('pass-through money', () => {
  const ARRIVAL: RowSpec = {
    at: '2026-03-10T02:00:00.000Z',
    lines: ['Transfer dari BANK MANDIRI', 'IBU CONTOH 1230000000009', 'passpor'],
    in: '1.950.000,00',
    balance: '2.950.000,00',
  }
  const DEPARTURE: RowSpec = {
    at: '2026-03-10T02:01:00.000Z',
    lines: ['Pembayaran Danatopup', '89508081200000001'],
    out: '1.950.000,00',
    balance: '1.000.000,00',
  }
  const arrival = row(ARRIVAL)
  const departure = row(DEPARTURE)

  it('flags both sides of money that arrived and left again the same day', () => {
    const { entries, passThroughIds } = statementToLedger(
      statement([arrival, departure]),
      OPTIONS,
    )
    expect(passThroughIds).toHaveLength(2)
    expect(passThroughIds).toContain(entries[0].id)
    expect(passThroughIds).toContain(entries[1].id)
  })

  it('surfaces the arrival for review rather than silently counting it as income', () => {
    const { entries, review } = statementToLedger(statement([arrival, departure]), OPTIONS)
    expect(review.some((item) => item.entryId === entries[0].id)).toBe(true)
  })

  it('leaves an equal amount outside the window alone', () => {
    const later = row({ ...DEPARTURE, at: '2026-03-13T02:00:00.000Z' })
    const { passThroughIds } = statementToLedger(statement([arrival, later]), OPTIONS)
    expect(passThroughIds).toHaveLength(0)
  })
})

describe('wallet coverage', () => {
  const topUp = (identifier: string) =>
    row({
      at: '2026-03-04T02:00:00.000Z',
      lines: ['Pembayaran Danatopup', identifier],
      out: '100.000,00',
      balance: '900.000,00',
    })

  it('counts a top-up to the household own number as covered', () => {
    const { walletCoverage } = statementToLedger(statement([topUp('89508081200000001')]), OPTIONS)
    expect(walletCoverage).toEqual({ seen: 1, matchedOwn: 1 })
  })

  it('reports zero matches when the configured number is wrong', () => {
    // This is the case that silently inflates spending: every top-up looks like
    // a payment to a stranger, and nothing about a single row gives it away.
    const { walletCoverage } = statementToLedger(statement([topUp('89508089999999999')]), OPTIONS)
    expect(walletCoverage.seen).toBe(1)
    expect(walletCoverage.matchedOwn).toBe(0)
  })
})
