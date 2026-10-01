import { readAdjustmentNote } from './manual'

/**
 * Balance corrections that have gone stale.
 *
 * A correction says "on this day the wallet really held X". It is stored as a
 * spending or income row of a fixed size, the difference between X and what
 * the ledger read at that moment. The size is frozen; the ledger is not. When
 * a later import adds rows dated before the correction (the August statement
 * arriving a month after the wallets were counted on 23 Aug 2026), or a row is
 * reclassified onto the wallet, the balance under the correction moves and the
 * frozen difference no longer lands on X. That is how GoPay and DANA went
 * negative with nobody touching them.
 *
 * So the note's X is treated as the claim and the size as derived. Each
 * correction is checked against the balance just before it, taking every
 * earlier correction on the same account as already right: what a correction
 * should be is X minus (the previous X plus what moved since).
 */

export interface AdjustmentRow {
  id: string
  accountId: string
  occurredAt: Date
  /** Orders corrections booked at the same instant: the last one written stands. */
  createdAt: Date
  amount: bigint
  cashflow: 'income' | 'spending'
  note: string | null
}

export interface MovementRow {
  id: string
  occurredAt: Date
  amount: bigint
  fromAccountId: string | null
  toAccountId: string | null
}

export interface StaleAdjustment {
  id: string
  accountId: string
  occurredAt: Date
  /** What the household said the balance was. */
  actual: bigint
  /** Where the balance lands with the correction as it is stored now. */
  landsAt: bigint
  /** The row it should become; zero means the correction is no longer needed. */
  amount: bigint
  cashflow: 'income' | 'spending'
}

function effect(row: MovementRow, accountId: string): bigint {
  if (row.toAccountId === accountId) return row.amount
  if (row.fromAccountId === accountId) return -row.amount
  return 0n
}

/** A note written before sen were kept is good to the rupiah, so only a rupiah or more counts. */
function differs(a: bigint, b: bigint, exact: boolean): boolean {
  const gap = a > b ? a - b : b - a
  return exact ? gap !== 0n : gap >= 100n
}

export function findStaleAdjustments(
  movements: readonly MovementRow[],
  adjustments: readonly AdjustmentRow[],
  openingBalances: ReadonlyMap<string, bigint>,
): StaleAdjustment[] {
  const corrections = new Set(adjustments.map((row) => row.id))
  const stale: StaleAdjustment[] = []

  const byAccount = new Map<string, AdjustmentRow[]>()
  for (const row of adjustments) byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row])

  for (const [accountId, rows] of byAccount) {
    const ordered = [...rows].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    const others = movements
      .filter((row) => !corrections.has(row.id) && effect(row, accountId) !== 0n)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

    // The balance as it should read, carried from one correction to the next.
    let balance = openingBalances.get(accountId) ?? 0n
    let next = 0

    for (const row of ordered) {
      while (next < others.length && others[next].occurredAt.getTime() <= row.occurredAt.getTime()) {
        balance += effect(others[next], accountId)
        next += 1
      }

      const stored = row.cashflow === 'income' ? row.amount : -row.amount
      const claim = readAdjustmentNote(row.note)
      // A note edited past reading has no claim to restore, so it stands as written.
      if (!claim) {
        balance += stored
        continue
      }

      if (differs(balance + stored, claim.actual, claim.exact)) {
        const delta = claim.actual - balance
        stale.push({
          id: row.id,
          accountId,
          occurredAt: row.occurredAt,
          actual: claim.actual,
          landsAt: balance + stored,
          amount: delta < 0n ? -delta : delta,
          cashflow: delta < 0n ? 'spending' : 'income',
        })
        balance = claim.actual
      } else {
        balance += stored
      }
    }
  }

  return stale.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
}
