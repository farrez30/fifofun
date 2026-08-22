import { formatIdr } from '@/lib/money'
import { ACCOUNT_RULES, type CashflowType, type EntryProblem } from './types'

/**
 * The rules a hand-typed entry has to satisfy before it is written.
 *
 * Everything here is pure, because the interesting failures are all decisions
 * rather than round trips: which account sides a cashflow may carry, what a
 * balance correction actually is, and which dates are a typing accident. The
 * database enforces the same rules and answers in Latin; these answer in
 * Indonesian, before the request is made.
 */

export interface SidePicks {
  /** The single account, for everything except a transfer. */
  accountId?: string | null
  fromAccountId?: string | null
  toAccountId?: string | null
}

export interface Sides {
  fromAccountId: string | null
  toAccountId: string | null
}

/**
 * Which account fields this cashflow is allowed to fill, and nothing more.
 *
 * A side the cashflow does not use is dropped rather than passed along, so a
 * stale pick left over from a form that changed direction cannot reach the
 * `transactions_account_sides` check.
 */
export function sidesFor(cashflow: CashflowType, picks: SidePicks): Sides {
  const rule = ACCOUNT_RULES[cashflow]
  if (cashflow === 'transfer') {
    return {
      fromAccountId: picks.fromAccountId ?? null,
      toAccountId: picks.toAccountId ?? null,
    }
  }
  return {
    fromAccountId: rule.from ? (picks.accountId ?? null) : null,
    toAccountId: rule.to ? (picks.accountId ?? null) : null,
  }
}

/** `validateEntry` speaks English to developers; a person gets this instead. */
export function describeProblem(problem: EntryProblem): string {
  const message = problem.message
  if (message.includes('Amount must be greater')) return 'Nominalnya harus lebih dari nol.'
  if (message.includes('needs a source account')) return 'Jenis transaksi ini butuh akun asal.'
  if (message.includes('must not have a source account')) {
    return 'Jenis transaksi ini tidak memakai akun asal.'
  }
  if (message.includes('needs a destination account')) return 'Jenis transaksi ini butuh akun tujuan.'
  if (message.includes('must not have a destination account')) {
    return 'Jenis transaksi ini tidak memakai akun tujuan.'
  }
  if (message.includes('Source and destination accounts are the same')) {
    return 'Akun asal dan tujuan tidak boleh sama.'
  }
  return 'Akunnya belum cocok dengan jenis transaksinya.'
}

export interface Adjustment {
  /** Real balance minus the recorded one. Negative means money is missing. */
  delta: bigint
  cashflow: 'income' | 'spending'
  categoryName: 'Penyesuaian Income' | 'Penyesuaian Spending'
}

/**
 * What a corrected balance means as a transaction.
 *
 * A wallet that says it holds nine million because every top-up was imported
 * and no payment ever was is not holding nine million; the difference is
 * spending nobody recorded. Writing it as spending rather than as a change of
 * opening balance is what keeps Sisa uang, the flow diagram and the budget
 * looking at the same money, and it leaves a dated row saying when the
 * correction was made instead of quietly moving history.
 */
export function adjustmentFor(computed: bigint, actual: bigint): Adjustment | null {
  const delta = actual - computed
  if (delta === 0n) return null
  return delta < 0n
    ? { delta, cashflow: 'spending', categoryName: 'Penyesuaian Spending' }
    : { delta, cashflow: 'income', categoryName: 'Penyesuaian Income' }
}

export function adjustmentNote(accountName: string, computed: bigint, actual: bigint): string {
  return `Penyesuaian saldo ${accountName}: tercatat ${formatIdr(computed)}, sebenarnya ${formatIdr(actual)}.`
}

/** The key that makes a double-tapped save harmless. */
export function manualDedupeKey(clientId: string): string {
  return `manual:${clientId}`
}

const EARLIEST = Date.UTC(2000, 0, 1)
const CLOCK_SLACK_MS = 24 * 60 * 60 * 1000

/**
 * Not before this century, and not more than a day ahead.
 *
 * A phone whose clock is a few hours fast is ordinary; a date next month is a
 * typing accident that would sit in a future month's figures until somebody
 * noticed the total was wrong.
 */
export function withinDateBounds(instant: Date, now: Date): boolean {
  const time = instant.getTime()
  if (Number.isNaN(time)) return false
  return time >= EARLIEST && time <= now.getTime() + CLOCK_SLACK_MS
}
