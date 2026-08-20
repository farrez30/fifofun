import { median } from '@/lib/planning/lifestyle'
import { monthKeyOf, monthKeyToString } from './monthly'
import type { LedgerEntry } from './types'

/**
 * Which recurring bills have been paid this month, and which have not.
 *
 * The spreadsheet keeps bills in a block of their own on each month sheet, with
 * a status typed in by hand next to each one. That is why Bills Paid appears as
 * a separate line from Total Spending: a bill payment there is not a row in the
 * transaction log at all.
 *
 * Here everything is a transaction, so nothing is typed in twice and nothing can
 * disagree with itself. A bill is paid when a transaction of cashflow `bills`
 * landed in its category during the month. The status is read, never stored,
 * which removes the failure the spreadsheet allows: a bill marked Paid in a
 * month where no money left, or money leaving with the status still Unpaid.
 *
 * Being derived also means an unpaid bill can say something useful about itself.
 * The usual amount comes from the same history, so "Wifi belum dibayar" arrives
 * with the roughly Rp272 ribu it is going to cost.
 */

export type BillState = 'paid' | 'due' | 'dormant'

export interface BillStatus {
  category: string
  state: BillState
  /** What was actually paid this month, or zero where nothing was. */
  paid: bigint
  /** The median of the months this bill was paid in, or zero with no history. */
  usual: bigint
  /** How many of the months looked at carried a payment. */
  paidMonths: number
  monthsSeen: number
  /** Months since the last payment, or null if it has never been paid. */
  monthsSinceLast: number | null
  /** Where the money went out from, when the month has a payment. */
  account: string | null
}

export interface BillsReview {
  period: string
  bills: BillStatus[]
  /** Paid this month. */
  total: bigint
  /** What the outstanding bills are likely to cost, from their usual amounts. */
  outstanding: bigint
  due: BillStatus[]
}

type Entry = LedgerEntry & {
  categoryName?: string | null
  accountName?: string | null
  isPassThrough?: boolean
}

/**
 * A bill nobody has paid in this many months is treated as finished rather than
 * overdue. Subscriptions get cancelled, and a cancelled one that keeps
 * announcing itself as unpaid every month teaches people to ignore the panel.
 */
const DORMANT_AFTER = 3

function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toMonth - fromMonth)
}

/** Every month key from the earliest entry to the period, inclusive. */
function monthsUpTo(earliest: string, period: string): string[] {
  const span = monthsBetween(earliest, period)
  if (span < 0) return [period]

  const [year, month] = earliest.split('-').map(Number)
  const keys: string[] = []
  for (let step = 0; step <= span; step++) {
    const index = month - 1 + step
    keys.push(`${year + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`)
  }
  return keys
}

export interface BillsOptions {
  /**
   * Categories to report even when they have never been paid, so a bill set up
   * and not yet used still appears. Anything found in the ledger is added.
   */
  known?: string[]
}

export function reviewBills(
  entries: Entry[],
  period: string,
  options: BillsOptions = {},
): BillsReview {
  const paidByCategoryMonth = new Map<string, Map<string, bigint>>()
  const accountThisMonth = new Map<string, string>()
  let earliest = period

  for (const entry of entries) {
    if (entry.cashflow !== 'bills' || entry.isPassThrough) continue

    const month = monthKeyToString(monthKeyOf(entry.occurredAt))
    // A statement imported after the period being looked at says nothing about
    // whether this month's bill was paid.
    if (month > period) continue
    if (month < earliest) earliest = month

    const category = entry.categoryName ?? 'Tanpa kategori'
    const byMonth = paidByCategoryMonth.get(category) ?? new Map<string, bigint>()
    byMonth.set(month, (byMonth.get(month) ?? 0n) + entry.amount)
    paidByCategoryMonth.set(category, byMonth)

    if (month === period && entry.accountName) accountThisMonth.set(category, entry.accountName)
  }

  const months = monthsUpTo(earliest, period)
  const categories = [...new Set([...(options.known ?? []), ...paidByCategoryMonth.keys()])]

  const bills = categories
    .map<BillStatus>((category) => {
      const byMonth = paidByCategoryMonth.get(category) ?? new Map<string, bigint>()
      const paid = byMonth.get(period) ?? 0n

      // Only the months it was actually paid in. A bill paid every month and a
      // bill paid once a quarter both cost what they cost when they arrive, and
      // averaging in the empty months would understate the one to expect.
      const amounts = months
        .map((month) => byMonth.get(month) ?? 0n)
        .filter((amount) => amount > 0n)

      const lastPaid = [...byMonth.entries()]
        .filter(([, amount]) => amount > 0n)
        .map(([month]) => month)
        .sort()
        .pop()

      const monthsSinceLast = lastPaid ? monthsBetween(lastPaid, period) : null
      const state: BillState =
        paid > 0n
          ? 'paid'
          : monthsSinceLast === null || monthsSinceLast > DORMANT_AFTER
            ? 'dormant'
            : 'due'

      return {
        category,
        state,
        paid,
        usual: amounts.length > 0 ? median(amounts) : 0n,
        paidMonths: amounts.length,
        monthsSeen: months.length,
        monthsSinceLast,
        account: accountThisMonth.get(category) ?? null,
      }
    })
    .sort(byUrgency)

  const due = bills.filter((bill) => bill.state === 'due')

  return {
    period,
    bills,
    total: bills.reduce((sum, bill) => sum + bill.paid, 0n),
    outstanding: due.reduce((sum, bill) => sum + bill.usual, 0n),
    due,
  }
}

/**
 * Unpaid first, and within that the expensive ones, because that is the order
 * somebody with a finite balance needs to decide in. Dormant bills sink to the
 * bottom rather than disappearing, so cancelling one stays visible.
 */
const RANK: Record<BillState, number> = { due: 0, paid: 1, dormant: 2 }

function byUrgency(a: BillStatus, b: BillStatus): number {
  if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state]
  const left = a.state === 'paid' ? a.paid : a.usual
  const right = b.state === 'paid' ? b.paid : b.usual
  if (left !== right) return right > left ? 1 : -1
  return a.category.localeCompare(b.category, 'id')
}
