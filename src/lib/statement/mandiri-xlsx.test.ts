import { describe, expect, it } from 'vitest'
import { type Cell, EMPTY_CELL, type Sheet } from '@/lib/xlsx'
import { parseIdAmount } from '@/lib/money'
import { StatementParseError, parseMandiriStatement } from './mandiri-xlsx'

/**
 * These fixtures mirror the real Livin' export exactly in shape: scattered
 * columns from merged cells, a "No" header that does not sit above its own
 * data, two rows per transaction, and newline-separated description lines.
 * Real statements are never committed, so the layout is reproduced here.
 */

type RowSpec = Record<number, string | number>

function sheetFrom(spec: RowSpec[]): Sheet {
  const width = Math.max(...spec.flatMap((row) => Object.keys(row).map((k) => Number(k) + 1)), 1)
  const rows: Cell[][] = spec.map((row) => {
    const cells: Cell[] = Array.from({ length: width }, () => EMPTY_CELL)
    for (const [key, value] of Object.entries(row)) {
      cells[Number(key)] =
        typeof value === 'number'
          ? { text: String(value), kind: 'number', number: value }
          : { text: value, kind: 'text' }
    }
    return cells
  })
  return { name: 'Sheet1', rows, merges: [] }
}

/** Header block and table header, matching the column positions of a real file. */
function headerRows(overrides: Partial<Record<string, string>> = {}): RowSpec[] {
  return [
    { 0: 'e-Statement' },
    {},
    { 0: 'Nama/Name', 5: ':', 6: 'BUDI SANTOSO ', 11: 'Periode/Period', 12: ':    ', 13: overrides.period ?? '01 Mar 2026 - 31 Mar 2026' },
    { 0: 'Cabang/Branch', 5: ':', 6: 'KCP Jakarta Contoh', 11: 'Dicetak pada/Issued on', 12: ':', 13: '19 Aug 2026' },
    { 0: 'Tabungan Payroll', 16: 'Saldo Awal/Initial Balance', 21: overrides.opening ?? '1.000.000,00' },
    { 16: 'Dana Masuk/Incoming Transactions', 21: overrides.totalIn ?? '200.000,00' },
    { 0: 'Nomor Rekening/Account Number', 8: ':', 9: '1230000000001', 16: 'Dana Keluar/Outgoing Transactions', 21: overrides.totalOut ?? '51.000,00' },
    { 0: 'Mata Uang/Currency', 8: ':', 9: 'IDR', 16: 'Saldo Akhir/Closing Balance', 21: overrides.closing ?? '1.149.000,00' },
    { 1: 'No', 4: 'Tanggal', 7: 'Keterangan', 15: 'Dana Masuk (IDR)', 18: 'Dana Keluar (IDR)', 21: 'Saldo (IDR)' },
    { 1: 'No', 4: 'Date', 7: 'Remarks', 15: 'Incoming Transactions (IDR)', 18: 'Outgoing Transactions (IDR)', 21: 'Balance (IDR)' },
  ]
}

const FOOTER: RowSpec = {
  7: 'PT Bank Mandiri (Persero) Tbk. berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK)',
  19: 'Mandiri Call 14000',
}

function defaultBody(): RowSpec[] {
  return [
    { 0: 1, 4: '01 Mar 2026', 7: 'Pembayaran QR\nke KOPI KENANGAN CONTOH\n600000000001', 18: '50.000,00', 21: '950.000,00' },
    { 4: '16:59:49 WIB' },
    { 0: 2, 4: '02 Mar 2026', 7: 'Transfer dari BANK MANDIRI\nSITI RAHAYU 1230000000002\npatungan makan', 15: '200.000,00', 21: '1.150.000,00' },
    { 4: '18:50:42 WIB' },
    { 0: 3, 4: '31 Mar 2026', 7: 'Biaya administrasi rekening', 18: '1.000,00', 21: '1.149.000,00' },
    { 4: '23:59:00 WIB' },
    FOOTER,
  ]
}

function statement(body = defaultBody(), overrides = {}) {
  return parseMandiriStatement(sheetFrom([...headerRows(overrides), ...body]))
}

describe('parseMandiriStatement header', () => {
  it('reads the header block by label, not by cell position', () => {
    const { header } = statement()
    expect(header.accountHolder).toBe('BUDI SANTOSO')
    expect(header.branch).toBe('KCP Jakarta Contoh')
    expect(header.productName).toBe('Tabungan Payroll')
    expect(header.accountNumber).toBe('1230000000001')
    expect(header.currency).toBe('IDR')
    expect(header.periodStart).toEqual({ year: 2026, month: 3, day: 1 })
    expect(header.periodEnd).toEqual({ year: 2026, month: 3, day: 31 })
    expect(header.issuedOn).toEqual({ year: 2026, month: 8, day: 19 })
  })

  it('reads the money block as exact sen', () => {
    const { header } = statement()
    expect(header.openingBalance).toBe(parseIdAmount('1.000.000,00'))
    expect(header.totalIn).toBe(parseIdAmount('200.000,00'))
    expect(header.totalOut).toBe(parseIdAmount('51.000,00'))
    expect(header.closingBalance).toBe(parseIdAmount('1.149.000,00'))
  })

  it('fails loudly when the table header is absent', () => {
    expect(() => parseMandiriStatement(sheetFrom([{ 0: 'not a statement' }]))).toThrow(
      StatementParseError,
    )
  })
})

describe('parseMandiriStatement rows', () => {
  it('merges the time-only continuation row into its transaction', () => {
    const { rows } = statement()
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.hasTime)).toBe(true)
    // 01 Mar 2026 16:59:49 WIB is 09:59:49 UTC.
    expect(rows[0].occurredAt.toISOString()).toBe('2026-03-01T09:59:49.000Z')
    expect(rows[2].occurredAt.toISOString()).toBe('2026-03-31T16:59:00.000Z')
  })

  it('keeps the description line breaks, which carry meaning', () => {
    const { rows } = statement()
    expect(rows[0].lines).toEqual([
      'Pembayaran QR',
      'ke KOPI KENANGAN CONTOH',
      '600000000001',
    ])
    expect(rows[2].lines).toEqual(['Biaya administrasi rekening'])
  })

  it('separates incoming from outgoing using the two amount columns', () => {
    const { rows } = statement()
    expect(rows[0].amountOut).toBe(parseIdAmount('50.000,00'))
    expect(rows[0].amountIn).toBe(0n)
    expect(rows[1].amountIn).toBe(parseIdAmount('200.000,00'))
    expect(rows[1].amountOut).toBe(0n)
  })

  it('reads the sequence number even though its header column is misaligned', () => {
    expect(statement().rows.map((row) => row.no)).toEqual([1, 2, 3])
  })

  it('stops at the footer instead of treating it as a transaction', () => {
    expect(statement().rows).toHaveLength(3)
  })

  it('still parses a transaction that has no continuation time row', () => {
    const body = defaultBody().filter((row) => row[4] !== '16:59:49 WIB')
    const { rows } = statement(body)
    expect(rows).toHaveLength(3)
    expect(rows[0].hasTime).toBe(false)
    // Falls back to Jakarta midnight, which is 17:00 UTC the day before.
    expect(rows[0].occurredAt.toISOString()).toBe('2026-02-28T17:00:00.000Z')
  })
})

describe('reconciliation', () => {
  it('passes when every layer agrees', () => {
    const { reconciliation } = statement()
    expect(reconciliation.ok).toBe(true)
    expect(reconciliation.issues).toEqual([])
    expect(reconciliation.sumIn).toBe(parseIdAmount('200.000,00'))
    expect(reconciliation.sumOut).toBe(parseIdAmount('51.000,00'))
  })

  it('points at the exact row when the running balance breaks', () => {
    const body = defaultBody()
    // Corrupt one balance cell, as a mis-parsed digit would.
    body[2] = { ...body[2], 21: '1.155.000,00' }
    const { reconciliation } = statement(body)

    const chain = reconciliation.issues.filter((issue) => issue.kind === 'balance-chain')
    // A single wrong balance is locally inconsistent both with the row before
    // it and with the row after it, so it surfaces as two adjacent breaks.
    expect(chain).toHaveLength(2)
    expect(chain[0].sheetRow).toBe(12)
    expect(chain[0].expected).toBe(parseIdAmount('1.155.000,00'))
    expect(chain[0].actual).toBe(parseIdAmount('1.150.000,00'))
    expect(chain[1].sheetRow).toBe(14)
  })

  it('does not cascade a dropped row into every row after it', () => {
    // Dropping a transaction is the failure mode that could cascade: every
    // later balance would disagree if the check were not row-local.
    const body = defaultBody().slice(2)
    const { reconciliation } = statement(body)

    const chain = reconciliation.issues.filter((issue) => issue.kind === 'balance-chain')
    expect(chain).toHaveLength(1)
    expect(chain[0].sheetRow).toBe(10)
  })

  it('catches a dropped row through the header totals', () => {
    const body = defaultBody().slice(2) // drop the first transaction and its time row
    const { reconciliation } = statement(body)

    const kinds = reconciliation.issues.map((issue) => issue.kind)
    expect(kinds).toContain('total-out')
    expect(reconciliation.ok).toBe(false)
  })

  it('catches a header whose own arithmetic is inconsistent', () => {
    const { reconciliation } = statement(defaultBody(), { closing: '1.148.000,00' })
    expect(reconciliation.issues.map((i) => i.kind)).toContain('closing-balance')
  })
})
