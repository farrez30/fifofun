import { createHash } from 'node:crypto'
import type { CashflowType, LedgerEntry } from '@/lib/ledger/types'
import type { Classification, TransactionKind } from './classify'
import { classify, type ClassifyOptions } from './classify'
import type { ParsedStatement, StatementRow } from './mandiri-xlsx'

/**
 * Turns a reconciled statement into ledger entries.
 *
 * Two things happen here that no amount of per-row classification can do on its
 * own, because both need to look across neighbouring rows:
 *
 *  - Bank fees are attached to the transaction they were charged for. The bank
 *    prints them as separate rows sharing the parent's exact timestamp.
 *  - Pass-through money is detected: an amount that arrives and leaves again
 *    the same day is somebody else's money passing through the account, not
 *    income. Counting it would inflate every income figure in the app.
 */

export interface AccountMap {
  /** The account this statement belongs to. */
  bankAccountId: string
  /** Where cash withdrawn at an ATM lands. */
  cashAccountId?: string
  /** Wallet name (as classified) to ledger account id, e.g. GoPay -> "gopay". */
  wallets?: Record<string, string>
}

export interface ConversionOptions extends ClassifyOptions {
  accounts: AccountMap
  /**
   * Window for treating an arrival and a departure of the same amount as one
   * pass-through rather than as income plus spending.
   */
  passThroughWindowHours?: number
}

export interface ReviewItem {
  entryId: string
  reason: string
  confidence: Classification['confidence']
}

export interface ConversionResult {
  entries: LedgerEntry[]
  review: ReviewItem[]
  /** Rows whose money never really belonged to the user. */
  passThroughIds: string[]
}

/** Which cashflow bucket each bank-level kind lands in by default. */
const CASHFLOW_BY_KIND: Record<TransactionKind, CashflowType> = {
  salary: 'income',
  bonus: 'income',
  refund: 'income',
  'transfer-in': 'income',
  'qris-payment': 'spending',
  'ecommerce-card': 'spending',
  'biller-payment': 'spending',
  'transfer-out': 'spending',
  'bank-fee': 'spending',
  'wallet-topup': 'transfer',
  'wallet-withdrawal': 'transfer',
  'cash-withdrawal': 'transfer',
  unknown: 'spending',
}

/**
 * A stable id for a statement row. The running balance is part of the key
 * because it is unique per account and makes collisions between two identical
 * same-second transactions effectively impossible.
 */
export function entryIdFor(accountId: string, row: StatementRow): string {
  const material = [
    accountId,
    row.occurredAt.toISOString(),
    row.amountIn.toString(),
    row.amountOut.toString(),
    row.balanceAfter.toString(),
    row.description,
  ].join('|')
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

function walletAccountFor(
  classification: Classification,
  accounts: AccountMap,
): string | undefined {
  const name = classification.counterparty.name
  if (!name) return undefined
  return accounts.wallets?.[name] ?? accounts.wallets?.[name.toLowerCase()]
}

function describe(row: StatementRow, classification: Classification): string {
  const who = classification.counterparty.name
  const note = classification.note
  if (who && note && note !== who) return `${who} - ${note}`
  if (who) return who
  return row.lines[0] ?? row.description
}

function toEntry(
  row: StatementRow,
  classification: Classification,
  options: ConversionOptions,
): LedgerEntry {
  const { accounts } = options
  const bank = accounts.bankAccountId
  const amount = row.amountIn > 0n ? row.amountIn : row.amountOut
  const cashflow = CASHFLOW_BY_KIND[classification.kind]

  let fromAccountId: string | null = null
  let toAccountId: string | null = null

  if (cashflow === 'transfer') {
    const other =
      classification.kind === 'cash-withdrawal'
        ? accounts.cashAccountId
        : walletAccountFor(classification, accounts)

    if (classification.direction === 'out') {
      fromAccountId = bank
      toAccountId = other ?? null
    } else {
      fromAccountId = other ?? null
      toAccountId = bank
    }
  } else if (classification.direction === 'in') {
    toAccountId = bank
  } else {
    fromAccountId = bank
  }

  return {
    id: entryIdFor(bank, row),
    occurredAt: row.occurredAt,
    description: describe(row, classification),
    amount,
    cashflow,
    categoryId: null,
    fromAccountId,
    toAccountId,
    source: 'xlsx',
    externalRef: classification.reference ?? null,
    note: classification.note,
  }
}

/**
 * Attaches each child fee to the transaction it was charged for. The bank gives
 * both rows the same timestamp, and the fee's second description line repeats
 * the parent's kind, so the two together identify the pair unambiguously.
 */
function linkFees(rows: StatementRow[], entries: LedgerEntry[], classes: Classification[]): void {
  for (let i = 0; i < entries.length; i++) {
    if (!classes[i].isChildFee) continue

    const feeTime = rows[i].occurredAt.getTime()
    const parentKind = classes[i].note
    const candidates = [i + 1, i - 1].filter((j) => j >= 0 && j < entries.length)

    for (const j of candidates) {
      if (classes[j].isChildFee) continue
      if (rows[j].occurredAt.getTime() !== feeTime) continue
      // The fee names its parent's kind on its second line.
      if (parentKind && rows[j].lines[0] && !parentKind.startsWith(rows[j].lines[0])) continue
      entries[i].feeParentId = entries[j].id
      break
    }
  }
}

/**
 * Finds money that arrived and left again almost immediately: a reimbursement
 * or a payment routed through the account on somebody else's behalf.
 *
 * Observed in real data: a sum arrived from a family member and left for a
 * wallet top-up one minute later. Treating that as income would overstate the
 * month by the full amount.
 */
function findPassThrough(
  rows: StatementRow[],
  entries: LedgerEntry[],
  windowHours: number,
): Set<string> {
  const flagged = new Set<string>()
  const windowMs = windowHours * 3_600_000

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].amountIn === 0n) continue

    for (let j = 0; j < rows.length; j++) {
      if (i === j || rows[j].amountOut !== rows[i].amountIn) continue
      const gap = rows[j].occurredAt.getTime() - rows[i].occurredAt.getTime()
      if (gap < 0 || gap > windowMs) continue

      flagged.add(entries[i].id)
      flagged.add(entries[j].id)
      break
    }
  }

  return flagged
}

export function statementToLedger(
  statement: ParsedStatement,
  options: ConversionOptions,
): ConversionResult {
  const rows = statement.rows
  const classes = rows.map((row) => classify(row, options))
  const entries = rows.map((row, i) => toEntry(row, classes[i], options))

  linkFees(rows, entries, classes)
  const passThrough = findPassThrough(rows, entries, options.passThroughWindowHours ?? 24)

  const review: ReviewItem[] = []
  for (let i = 0; i < entries.length; i++) {
    const classification = classes[i]

    if (classification.confidence !== 'high') {
      review.push({
        entryId: entries[i].id,
        reason: `${classification.ruleId}: ${classification.kind} needs confirming`,
        confidence: classification.confidence,
      })
    }
    // A transfer with only one side would corrupt the balances, so surface it
    // rather than writing a half-recorded movement.
    if (entries[i].cashflow === 'transfer' && (!entries[i].fromAccountId || !entries[i].toAccountId)) {
      review.push({
        entryId: entries[i].id,
        reason: `No account mapped for ${classification.counterparty.name ?? 'the other side'}`,
        confidence: 'low',
      })
    }
    if (passThrough.has(entries[i].id) && entries[i].cashflow === 'income') {
      review.push({
        entryId: entries[i].id,
        reason: 'Arrived and left again the same day; likely not income',
        confidence: 'medium',
      })
    }
  }

  return { entries, review, passThroughIds: [...passThrough] }
}
