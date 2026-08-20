import type { StatementRow } from '@/lib/statement/mandiri-xlsx'
import type { LivinTransaction } from './livin'

/**
 * Matching real-time emails against the monthly statement.
 *
 * The two sources see different things and neither is complete on its own. The
 * email arrives in seconds and carries the merchant name in full, the fee
 * already separated, a reference number, and the note the user typed. The
 * statement arrives monthly and carries the running balance, which is the only
 * thing that proves nothing was missed.
 *
 * Matching them turns two partial records into one that is both timely and
 * provable, and each disagreement means something specific:
 *
 *   in both              the transaction is confirmed, and the email's richer
 *                        detail can be attached to the statement row
 *   email only           the transaction was notified but never settled: a
 *                        reversal, a failure, or a duplicate notification
 *   statement only       no email arrived, so the real-time channel has a gap
 *                        and the statement is the only reason it is known at all
 */

export interface Match {
  email: LivinTransaction
  row: StatementRow
  /** How the two were tied together, strongest first. */
  by: 'reference' | 'amount-and-time'
  /** Seconds between the two timestamps. Zero for a reference match. */
  drift: number
}

export interface ReconciliationResult {
  matched: Match[]
  /** Notified but absent from the statement. Worth a look, never auto-posted. */
  emailOnly: LivinTransaction[]
  /** In the statement with no email. The gap in the real-time channel. */
  statementOnly: StatementRow[]
  /** Share of statement rows that arrived by email too, as a percentage. */
  coverage: number
}

export interface ReconcileOptions {
  /**
   * How far apart two timestamps may be and still be the same transaction.
   *
   * The email is stamped when the bank sends it and the statement when the
   * transaction posts, and those are minutes apart for card and QRIS payments
   * that settle in a batch. Five minutes is wide enough for that and far too
   * narrow to collide with a genuinely separate transaction of the same amount.
   */
  toleranceSeconds?: number
}

const DEFAULT_TOLERANCE_SECONDS = 300

/** Total the email moved out of the account: the amount plus any fee. */
function emailTotal(email: LivinTransaction): bigint {
  return email.total ?? email.amount + email.fee
}

function rowAmount(row: StatementRow): bigint {
  return row.amountOut > 0n ? row.amountOut : row.amountIn
}

export function reconcileEmails(
  emails: LivinTransaction[],
  rows: StatementRow[],
  options: ReconcileOptions = {},
): ReconciliationResult {
  const tolerance = (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000

  const matched: Match[] = []
  const takenRows = new Set<StatementRow>()
  const takenEmails = new Set<LivinTransaction>()

  /*
    Reference numbers first, across the whole set, before any timing heuristic
    runs. A reference is exact; matching on amount and time is a guess that
    happens to be very good. Doing the guessing first would let a near-miss claim
    a row that an exact match was entitled to.
  */
  for (const email of emails) {
    const row = rows.find(
      (candidate) => !takenRows.has(candidate) && candidate.description.includes(email.reference),
    )
    if (!row) continue

    matched.push({ email, row, by: 'reference', drift: 0 })
    takenRows.add(row)
    takenEmails.add(email)
  }

  for (const email of emails) {
    if (takenEmails.has(email)) continue

    const total = emailTotal(email)
    const candidates = rows
      .filter((row) => !takenRows.has(row))
      .map((row) => ({
        row,
        drift: Math.abs(row.occurredAt.getTime() - email.occurredAt.getTime()),
      }))
      // The amount has to be exact. Only the timing is allowed to be fuzzy,
      // because only the timing has a legitimate reason to differ.
      .filter(({ row, drift }) => drift <= tolerance && rowAmount(row) === total)
      .sort((a, b) => a.drift - b.drift)

    const best = candidates[0]
    if (!best) continue

    matched.push({
      email,
      row: best.row,
      by: 'amount-and-time',
      drift: Math.round(best.drift / 1000),
    })
    takenRows.add(best.row)
    takenEmails.add(email)
  }

  const statementOnly = rows.filter((row) => !takenRows.has(row))

  return {
    matched,
    emailOnly: emails.filter((email) => !takenEmails.has(email)),
    statementOnly,
    coverage: rows.length === 0 ? 0 : Math.round((matched.length / rows.length) * 1000) / 10,
  }
}

export interface Enrichment {
  /** The statement row this applies to. */
  row: StatementRow
  /** Merchant name in full, where the statement truncated it. */
  recipient: string | null
  /** What the user typed when sending. */
  note: string | null
  /** Bank reference, which makes the row joinable to anything else later. */
  reference: string
  /** Fee stated separately by the email rather than inferred. */
  fee: bigint
}

/**
 * What each match adds to the statement row.
 *
 * The statement stays the source of truth for the amount and the balance,
 * because it is the only side that can prove nothing was missed. Everything the
 * email knows better is layered on top.
 */
export function enrichFromEmails(result: ReconciliationResult): Enrichment[] {
  return result.matched.map(({ email, row }) => ({
    row,
    recipient: email.recipient,
    note: email.note,
    reference: email.reference,
    fee: email.fee,
  }))
}
