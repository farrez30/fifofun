import { parseIdAmount, sumSen } from '@/lib/money'
import { type CalendarDate, parseShortDate, parseWibTime, toJakartaInstant } from '@/lib/datetime'
import { type Cell, type Sheet, cellAt } from '@/lib/xlsx'

/**
 * Parser for the Bank Mandiri e-Statement exported as .xlsx from Livin'.
 *
 * Two properties of the file drive the whole design:
 *
 *  - A transaction occupies two rows. The first carries date, description and
 *    amounts; the second carries only the time ("02:51:00 WIB") in the date
 *    column. Rows are therefore classified by what the date column parses as,
 *    not by row offset.
 *  - Columns are scattered by merged cells, so positions are read from the
 *    header row's labels rather than hard-coded. The "No" header is itself
 *    misaligned with its own data, which is why row detection never uses it.
 */

export interface StatementHeader {
  accountHolder: string
  branch: string
  productName: string
  accountNumber: string
  currency: string
  periodStart: CalendarDate
  periodEnd: CalendarDate
  issuedOn: CalendarDate | null
  openingBalance: bigint
  totalIn: bigint
  totalOut: bigint
  closingBalance: bigint
}

export interface StatementRow {
  /** Sequence number printed by the bank, when present. */
  no: number | null
  /** Row index in the sheet, kept so problems can point at the source. */
  sheetRow: number
  occurredAt: Date
  date: CalendarDate
  hasTime: boolean
  /** Description with its original line breaks preserved. */
  description: string
  /** The description split on its line breaks; each line is meaningful. */
  lines: string[]
  amountIn: bigint
  amountOut: bigint
  balanceAfter: bigint
}

export type ReconciliationKind = 'total-in' | 'total-out' | 'closing-balance' | 'balance-chain'

export interface ReconciliationIssue {
  kind: ReconciliationKind
  message: string
  sheetRow?: number
  expected: bigint
  actual: bigint
}

export interface Reconciliation {
  ok: boolean
  issues: ReconciliationIssue[]
  sumIn: bigint
  sumOut: bigint
}

export interface ParsedStatement {
  header: StatementHeader
  rows: StatementRow[]
  reconciliation: Reconciliation
}

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementParseError'
  }
}

/** True for cells holding only a separator such as ":" or whitespace. */
function isFiller(cell: Cell): boolean {
  return cell.kind === 'empty' || /^[:\s\u00a0]*$/.test(cell.text)
}

function normalise(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Finds a labelled value: the first meaningful cell to the right of the label. */
function findLabeled(sheet: Sheet, label: RegExp): string | null {
  for (const row of sheet.rows) {
    for (let c = 0; c < row.length; c++) {
      if (row[c].kind === 'empty' || !label.test(normalise(row[c].text))) continue
      for (let k = c + 1; k < row.length; k++) {
        if (!isFiller(row[k])) return normalise(row[k].text)
      }
    }
  }
  return null
}

function requireLabeled(sheet: Sheet, label: RegExp, what: string): string {
  const value = findLabeled(sheet, label)
  if (value === null) throw new StatementParseError(`Statement is missing ${what}`)
  return value
}

const PERIOD = /^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*-\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$/

function parsePeriod(raw: string): { start: CalendarDate; end: CalendarDate } {
  const m = PERIOD.exec(normalise(raw))
  if (!m) throw new StatementParseError(`Unrecognised statement period: ${JSON.stringify(raw)}`)
  return { start: parseShortDate(m[1]), end: parseShortDate(m[2]) }
}

interface Columns {
  headerRow: number
  date: number
  description: number
  amountIn: number
  amountOut: number
  balance: number
}

type ColumnKey = Exclude<keyof Columns, 'headerRow'>

const COLUMN_LABELS: Array<[ColumnKey, RegExp]> = [
  ['date', /^Tanggal$/i],
  ['description', /^Keterangan$/i],
  ['amountIn', /^Dana Masuk/i],
  ['amountOut', /^Dana Keluar/i],
  ['balance', /^Saldo \(IDR\)$/i],
]

/** Locates the transaction table and maps its columns by their header text. */
function findColumns(sheet: Sheet): Columns {
  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]
    const found: Partial<Record<ColumnKey, number>> = {}

    for (let c = 0; c < row.length; c++) {
      if (row[c].kind === 'empty') continue
      const text = normalise(row[c].text)
      for (const [key, pattern] of COLUMN_LABELS) {
        if (found[key] === undefined && pattern.test(text)) found[key] = c
      }
    }

    const complete = COLUMN_LABELS.every(([key]) => found[key] !== undefined)
    if (complete) {
      return {
        headerRow: r,
        date: found.date!,
        description: found.description!,
        amountIn: found.amountIn!,
        amountOut: found.amountOut!,
        balance: found.balance!,
      }
    }
  }
  throw new StatementParseError('Could not find the transaction table header')
}

const PRODUCT_NAME = /^(Tabungan|Giro|Deposito|Rekening)\b/i

function readHeader(sheet: Sheet, columns: Columns): StatementHeader {
  const period = parsePeriod(requireLabeled(sheet, /^Periode\/Period$/i, 'a statement period'))
  const issuedRaw = findLabeled(sheet, /^Dicetak pada\/Issued on$/i)

  const amount = (label: RegExp, what: string) => parseIdAmount(requireLabeled(sheet, label, what))

  // The product name ("Tabungan Payroll") sits unlabelled in the first column
  // above the table, so take the last such cell before the header row.
  let productName = ''
  for (let r = 0; r < columns.headerRow; r++) {
    const cell = cellAt(sheet, r, 0)
    if (cell.kind === 'text' && PRODUCT_NAME.test(normalise(cell.text))) {
      productName = normalise(cell.text)
    }
  }

  return {
    accountHolder: requireLabeled(sheet, /^Nama\/Name$/i, 'an account holder'),
    branch: findLabeled(sheet, /^Cabang\/Branch$/i) ?? '',
    productName,
    accountNumber: requireLabeled(sheet, /^Nomor Rekening\/Account Number$/i, 'an account number'),
    currency: findLabeled(sheet, /^Mata Uang\/Currency$/i) ?? 'IDR',
    periodStart: period.start,
    periodEnd: period.end,
    issuedOn: issuedRaw ? parseShortDate(issuedRaw) : null,
    openingBalance: amount(/^Saldo Awal\/Initial Balance$/i, 'an opening balance'),
    totalIn: amount(/^Dana Masuk\/Incoming Transactions$/i, 'an incoming total'),
    totalOut: amount(/^Dana Keluar\/Outgoing Transactions$/i, 'an outgoing total'),
    closingBalance: amount(/^Saldo Akhir\/Closing Balance$/i, 'a closing balance'),
  }
}

function amountOrZero(cell: Cell): bigint {
  return isFiller(cell) ? 0n : parseIdAmount(cell.text)
}

/** Reads the sequence number, which sits somewhere left of the date column. */
function readNo(sheet: Sheet, row: number, dateCol: number): number | null {
  for (let c = 0; c < dateCol; c++) {
    const cell = cellAt(sheet, row, c)
    if (cell.kind === 'number' && cell.number !== undefined) return Math.round(cell.number)
    if (cell.kind === 'text' && /^\d+$/.test(cell.text.trim())) return Number(cell.text.trim())
  }
  return null
}

function splitLines(description: string): string[] {
  return description
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(normalise)
    .filter((line) => line !== '')
}

function readRows(sheet: Sheet, columns: Columns): StatementRow[] {
  const rows: StatementRow[] = []

  for (let r = columns.headerRow + 1; r < sheet.rows.length; r++) {
    const dateCell = cellAt(sheet, r, columns.date)
    if (isFiller(dateCell)) continue

    const dateText = normalise(dateCell.text)

    // A time-only cell continues the transaction above it.
    const time = tryParse(() => parseWibTime(dateText))
    if (time) {
      const previous = rows[rows.length - 1]
      if (previous && !previous.hasTime) {
        previous.occurredAt = toJakartaInstant(previous.date, time)
        previous.hasTime = true
      }
      continue
    }

    // Neither a date nor a time means the table has ended (footer, disclaimer).
    const date = tryParse(() => parseShortDate(dateText))
    if (!date) continue

    const description = cellAt(sheet, r, columns.description).text
    rows.push({
      no: readNo(sheet, r, columns.date),
      sheetRow: r,
      date,
      hasTime: false,
      occurredAt: toJakartaInstant(date),
      description: description.replace(/\r\n/g, '\n').trim(),
      lines: splitLines(description),
      amountIn: amountOrZero(cellAt(sheet, r, columns.amountIn)),
      amountOut: amountOrZero(cellAt(sheet, r, columns.amountOut)),
      balanceAfter: parseIdAmount(cellAt(sheet, r, columns.balance).text),
    })
  }

  return rows
}

function tryParse<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

/**
 * Four independent checks. The per-row balance chain is the strongest: it points
 * at the exact row where parsing went wrong, rather than only reporting that a
 * total fails to add up.
 *
 * The chain check is deliberately row-local: each row is verified against the
 * balance the bank printed on the row before it, not against a running total we
 * accumulated ourselves. A dropped row therefore reports one break instead of
 * making every later row look wrong. A single mis-parsed balance reports two,
 * because it genuinely disagrees with its neighbours on both sides.
 */
export function reconcile(header: StatementHeader, rows: StatementRow[]): Reconciliation {
  const issues: ReconciliationIssue[] = []
  const sumIn = sumSen(rows.map((row) => row.amountIn))
  const sumOut = sumSen(rows.map((row) => row.amountOut))

  if (sumIn !== header.totalIn) {
    issues.push({
      kind: 'total-in',
      message: 'Sum of incoming rows does not match the header total',
      expected: header.totalIn,
      actual: sumIn,
    })
  }
  if (sumOut !== header.totalOut) {
    issues.push({
      kind: 'total-out',
      message: 'Sum of outgoing rows does not match the header total',
      expected: header.totalOut,
      actual: sumOut,
    })
  }

  const derivedClosing = header.openingBalance + header.totalIn - header.totalOut
  if (derivedClosing !== header.closingBalance) {
    issues.push({
      kind: 'closing-balance',
      message: 'Opening balance plus movements does not match the closing balance',
      expected: header.closingBalance,
      actual: derivedClosing,
    })
  }

  let running = header.openingBalance
  for (const row of rows) {
    running = running + row.amountIn - row.amountOut
    if (running !== row.balanceAfter) {
      issues.push({
        kind: 'balance-chain',
        message: `Running balance breaks at row ${row.no ?? '?'}`,
        sheetRow: row.sheetRow,
        expected: row.balanceAfter,
        actual: running,
      })
      // Continue from what the bank printed, not from our own total, so one
      // bad row does not make every row after it look wrong too.
      running = row.balanceAfter
    }
  }

  return { ok: issues.length === 0, issues, sumIn, sumOut }
}

/** Parses an already-loaded worksheet into a reconciled statement. */
export function parseMandiriStatement(sheet: Sheet): ParsedStatement {
  const columns = findColumns(sheet)
  const header = readHeader(sheet, columns)
  const rows = readRows(sheet, columns)
  return { header, rows, reconciliation: reconcile(header, rows) }
}
