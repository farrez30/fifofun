import type { MonthlySeries } from './monthly'
import { monthKeyOf, monthKeyToString } from './monthly'
import type { LedgerEntry } from './types'

/**
 * The balance line as it would have looked if the wallets had been honest all
 * along — presentation only, never the ledger.
 *
 * A balance adjustment is a correcting entry: it books, on the day somebody
 * noticed, money that actually left over months or years. A statement that
 * only sees top-ups into an e-wallet and never the payments out of it will
 * carry that float for as long as it goes unchecked, and the correction then
 * lands as a single cliff in a month where nothing unusual happened.
 *
 * Accounting has a name for both halves of the answer. The journal keeps the
 * correcting entry where it was made — prospective treatment, immutable, the
 * audit trail intact. The presentation may restate the comparative periods,
 * with a note saying so, which is what this builds. What is never allowed is
 * backdating the entry itself: that would erase when the household actually
 * knew, and here it would also break the one external check the app has, the
 * printed bank balance the Mandiri account reconciles against.
 *
 * Where to put the money is a model, and the model is stated rather than
 * hidden: an adjustment on a wallet is spread over the months in proportion
 * to what was topped up into that wallet, because money that went into a
 * prepaid wallet is money that eventually left it. The exact days are gone —
 * no statement ever saw them — so the honest claim is a shape, not a date.
 */

/** Names the balance-adjustment action writes; see catat/actions.ts. */
const ADJUSTMENT_CATEGORIES = new Set(['Penyesuaian Spending', 'Penyesuaian Income'])

type Entry = LedgerEntry & { categoryName?: string | null }

export interface Restatement {
  /** The series with every month before the correction carrying its share. */
  series: MonthlySeries[]
  /** What was moved, in total. Zero when there is nothing to restate. */
  total: bigint
  /** The months the corrections were booked in, newest last. */
  bookedIn: string[]
}

function monthOf(date: Date): string {
  return monthKeyToString(monthKeyOf(date))
}

/**
 * Every balance adjustment, as the account it corrected and the direction it
 * moved. Only outgoing ones are spread: an adjustment that ADDS money found
 * money the ledger never saw arrive, which is a different story and one this
 * view has no business rewriting.
 */
function adjustmentsIn(entries: Entry[], accountId: string | null) {
  return entries
    .filter((entry) => {
      if (!entry.categoryName || !ADJUSTMENT_CATEGORIES.has(entry.categoryName)) return false
      // Money leaving: the wallet held less than the ledger thought.
      if (!entry.fromAccountId) return false
      return accountId === null || entry.fromAccountId === accountId
    })
    .map((entry) => ({
      accountId: entry.fromAccountId as string,
      month: monthOf(entry.occurredAt),
      amount: entry.amount,
    }))
}

/** What went INTO an account each month, which is what it later spent. */
function topUpsByMonth(entries: Entry[], accountId: string, before: string): Map<string, bigint> {
  const byMonth = new Map<string, bigint>()

  for (const entry of entries) {
    if (entry.toAccountId !== accountId) continue
    const month = monthOf(entry.occurredAt)
    if (month >= before) continue
    byMonth.set(month, (byMonth.get(month) ?? 0n) + entry.amount)
  }

  return byMonth
}

/**
 * Spreads one amount over the given months by weight, in sen, without losing
 * a rupiah: the remainder of the integer division lands on the last month, so
 * the parts always add back up to the whole.
 */
function spread(amount: bigint, weights: Map<string, bigint>, months: string[]): Map<string, bigint> {
  const parts = new Map<string, bigint>()
  const total = months.reduce((sum, month) => sum + (weights.get(month) ?? 0n), 0n)
  if (total <= 0n || months.length === 0) return parts

  let handed = 0n
  months.forEach((month, index) => {
    const weight = weights.get(month) ?? 0n
    if (weight <= 0n) return
    const last = index === months.length - 1
    const part = last ? amount - handed : (amount * weight) / total
    handed += part
    if (part > 0n) parts.set(month, (parts.get(month) ?? 0n) + part)
  })

  // The last month may carry no weight at all, in which case the remainder is
  // still owed; give it to the heaviest month rather than dropping it.
  if (handed !== amount) {
    let heaviest = months[0]
    for (const month of months) {
      if ((weights.get(month) ?? 0n) > (weights.get(heaviest) ?? 0n)) heaviest = month
    }
    parts.set(heaviest, (parts.get(heaviest) ?? 0n) + (amount - handed))
  }

  return parts
}

/**
 * The restated series, or the series untouched when there is nothing to move.
 *
 * `accountId` scopes it to one account, matching whichever series is on
 * screen; null restates the household as a whole.
 */
export function restateBalances(
  series: MonthlySeries[],
  entries: Entry[],
  accountId: string | null = null,
): Restatement {
  const adjustments = adjustmentsIn(entries, accountId)
  if (adjustments.length === 0 || series.length === 0) {
    return { series, total: 0n, bookedIn: [] }
  }

  const months = series.map((month) => month.month)
  const moved = new Map<string, bigint>()
  const booked = new Map<string, bigint>()
  let total = 0n

  for (const adjustment of adjustments) {
    const earlier = months.filter((month) => month < adjustment.month)
    if (earlier.length === 0) continue

    const weights = topUpsByMonth(entries, adjustment.accountId, adjustment.month)
    const hasWeight = earlier.some((month) => (weights.get(month) ?? 0n) > 0n)
    /*
      Cash has no top-ups to weigh — nothing transfers into it, it just gets
      spent — so an even spread is the only claim available, and it is still
      a truer shape than a cliff.
    */
    const basis = hasWeight
      ? weights
      : new Map(earlier.map((month) => [month, 1n] as const))

    for (const [month, part] of spread(adjustment.amount, basis, earlier)) {
      moved.set(month, (moved.get(month) ?? 0n) + part)
    }
    booked.set(adjustment.month, (booked.get(adjustment.month) ?? 0n) + adjustment.amount)
    total += adjustment.amount
  }

  if (total === 0n) return { series, total: 0n, bookedIn: [] }

  /*
    Cumulative, and only backwards. Every month before the correction is
    lowered by everything spread up to and including it; at the correction
    month the offset is handed back, because the recorded line takes the same
    money out there and counting it twice would sink the rest of the chart.
    From that month onwards the two lines meet again: a restatement changes
    the path, never the destination.
  */
  let carried = 0n
  const restated = series.map((month) => {
    carried += (moved.get(month.month) ?? 0n) - (booked.get(month.month) ?? 0n)
    if (carried === 0n) return month
    return {
      ...month,
      statement: { ...month.statement, sisaUang: month.statement.sisaUang - carried },
    }
  })

  return {
    series: restated,
    total,
    bookedIn: [...new Set(adjustments.map((adjustment) => adjustment.month))].sort(),
  }
}
