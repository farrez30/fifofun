import { median } from '@/lib/planning/lifestyle'
import { monthKeyOf, monthKeyToString } from './monthly'
import type { CashflowType, LedgerEntry } from './types'

/**
 * How full each savings pot, sinking fund and goal is.
 *
 * The spreadsheet keeps a Progress and an Amount Left beside every goal, both
 * typed in by hand. Nothing here is typed in except the target itself: what has
 * gone in is read from the ledger, and so is what has come back out, so a pot
 * cannot show a balance that no transaction ever put there.
 *
 * Money leaving a pot is a `from_asset` entry filed under the pot's own name,
 * which is the same trick the receivables pairing uses. Both sides of an
 * arrangement have to be nameable, or the app can only ever count one of them.
 */

export const FUND_CASHFLOWS = ['invest_savings', 'sinking_fund', 'financial_goal'] as const
export type FundCashflow = (typeof FUND_CASHFLOWS)[number]

export interface FundCategory {
  name: string
  cashflow: FundCashflow
  /** What was already in the pot before the ledger starts. */
  openingBalance: bigint
  target: bigint | null
  /** `YYYY-MM` the target is wanted by, or null for a pot with no deadline. */
  targetMonth: string | null
  /** What the household means to put in each month, if it said so. */
  plannedMonthly?: bigint | null
  /** The same intention as a share of income, in basis points. */
  plannedShareBp?: number | null
}

export interface FundProgress extends FundCategory {
  /** Opening balance, plus everything put in, less everything taken back out. */
  saved: bigint
  contributed: bigint
  withdrawn: bigint
  /** Target less what is saved, floored at nothing. Null without a target. */
  remaining: bigint | null
  /** How far along, as a percentage. Null without a target. */
  share: number | null
  /** The usual monthly contribution, over the months anything went in. */
  monthlyRate: bigint
  /** Months to the target at that usual rate. Null if it will never arrive. */
  monthsAtThisRate: number | null
  /**
   * The monthly contribution the household planned, in sen.
   *
   * Either typed as an amount or derived from a share of income, which is why
   * a share is useless without an income to take it from and answers null.
   */
  plannedMonthly: bigint | null
  /** Months to the target at the planned rate. Null if it will never arrive. */
  monthsAtPlannedRate: number | null
  /** `YYYY-MM` the planned rate arrives in, measured from `asOf`. */
  etaMonth: string | null
  /** Months left until the deadline. Null without one; zero once it has passed. */
  monthsLeft: number | null
  /** What has to go in each month from here to make the deadline. */
  neededPerMonth: bigint | null
  /** Whether the usual rate makes the deadline. Null when there is no deadline. */
  onTrack: boolean | null
  /** The last month anything went in, or null if nothing ever has. */
  lastFed: string | null
}

export interface FundsReview {
  funds: FundProgress[]
  totalSaved: bigint
  /** Only the pots that have a target, since the rest have nothing to total. */
  totalTarget: bigint
  /** Pots with a deadline the usual rate will not make. */
  behind: FundProgress[]
}

type Entry = LedgerEntry & { categoryName?: string | null }

export interface ReviewFundsOptions {
  /** The month to measure deadlines from. Defaults to the last month in the ledger. */
  asOf?: string
  /** Typical monthly income, so a pot planned as a share of it can be priced. */
  income?: bigint
}

/** Whole months from one `YYYY-MM` to another, never below zero. */
export function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  const gap = (toYear - fromYear) * 12 + (toMonth - fromMonth)
  return gap > 0 ? gap : 0
}

/** A `YYYY-MM` moved by whole months, forward or back. */
export function addMonths(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number)
  const zeroBased = year * 12 + (index - 1) + delta
  const nextYear = Math.floor(zeroBased / 12)
  const nextMonth = zeroBased - nextYear * 12 + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

/** Ceiling division that stays in bigint, so no amount rounds through a float. */
export function perMonth(amount: bigint, months: number): bigint {
  if (months <= 0) return amount
  const divisor = BigInt(months)
  return (amount + divisor - 1n) / divisor
}

export function reviewFunds(
  entries: Entry[],
  categories: FundCategory[],
  options: ReviewFundsOptions = {},
): FundsReview {
  const byMonth = new Map<string, Entry[]>()
  let lastMonth = ''
  for (const entry of entries) {
    const month = monthKeyToString(monthKeyOf(entry.occurredAt))
    if (month > lastMonth) lastMonth = month
    const bucket = byMonth.get(month) ?? []
    bucket.push(entry)
    byMonth.set(month, bucket)
  }

  const asOf = options.asOf ?? lastMonth

  const funds = categories
    .map<FundProgress>((fund) => progressFor(fund, entries, byMonth, asOf, options.income))
    .sort(rank)

  return {
    funds,
    totalSaved: funds.reduce((total, fund) => total + fund.saved, 0n),
    totalTarget: funds.reduce((total, fund) => total + (fund.target ?? 0n), 0n),
    behind: funds.filter((fund) => fund.onTrack === false),
  }
}

function progressFor(
  fund: FundCategory,
  entries: Entry[],
  byMonth: Map<string, Entry[]>,
  asOf: string,
  income: bigint | undefined,
): FundProgress {
  const isContribution = (entry: Entry) =>
    entry.cashflow === fund.cashflow && entry.categoryName === fund.name
  // Taking money back out is filed against the pot it came from, so the pot's
  // own name is what links the two directions together.
  const isWithdrawal = (entry: Entry) =>
    (entry.cashflow as CashflowType) === 'from_asset' && entry.categoryName === fund.name

  const sum = (rows: Entry[], keep: (entry: Entry) => boolean) =>
    rows.filter(keep).reduce((total, entry) => total + entry.amount, 0n)

  const contributed = sum(entries, isContribution)
  const withdrawn = sum(entries, isWithdrawal)
  const saved = fund.openingBalance + contributed - withdrawn

  /*
    The usual rate comes from the months something went in, not from every month
    in the ledger. A pot fed every other month has a rate of what goes in when it
    is fed; averaging the empty months into it would halve the figure and then
    promise a deadline twice as far away as the truth.
  */
  const fedMonths = [...byMonth.entries()]
    .map(([month, rows]) => ({ month, amount: sum(rows, isContribution) }))
    .filter(({ amount }) => amount > 0n)
    .sort((a, b) => a.month.localeCompare(b.month))

  const monthlyRate = median(fedMonths.map(({ amount }) => amount))
  const lastFed = fedMonths.length > 0 ? fedMonths[fedMonths.length - 1].month : null

  const target = fund.target
  const remaining = target === null ? null : saved >= target ? 0n : target - saved
  const share =
    target === null || target <= 0n
      ? null
      : Number((saved > 0n ? saved : 0n) * 10_000n / target) / 100

  const monthsAtThisRate =
    remaining === null || remaining === 0n
      ? remaining === 0n
        ? 0
        : null
      : monthlyRate > 0n
        ? Number((remaining + monthlyRate - 1n) / monthlyRate)
        : null

  const monthsLeft = fund.targetMonth === null ? null : monthsBetween(asOf, fund.targetMonth)
  const neededPerMonth =
    remaining === null || monthsLeft === null ? null : perMonth(remaining, monthsLeft)

  /*
    A pot can be planned from either end, and both ends are the same figure.
    Saying "Rp2 juta a month" and asking when it lands, or saying "by March"
    and asking what that costs, are one question read in two directions, so
    the planned rate sits beside the needed rate rather than replacing it.

    A share is stored instead of an amount by households that think in
    percentages of a salary. It only becomes an amount once there is an income
    to take it from, and answering with nothing is better than answering with
    a percentage of zero.
  */
  const plannedMonthly =
    fund.plannedMonthly && fund.plannedMonthly > 0n
      ? fund.plannedMonthly
      : fund.plannedShareBp && income && income > 0n
        ? (income * BigInt(fund.plannedShareBp)) / 10_000n
        : null

  const monthsAtPlannedRate =
    remaining === null
      ? null
      : remaining === 0n
        ? 0
        : plannedMonthly !== null && plannedMonthly > 0n
          ? Number((remaining + plannedMonthly - 1n) / plannedMonthly)
          : null

  const etaMonth =
    monthsAtPlannedRate === null || asOf === '' ? null : addMonths(asOf, monthsAtPlannedRate)

  return {
    ...fund,
    saved,
    contributed,
    withdrawn,
    remaining,
    share,
    monthlyRate,
    monthsAtThisRate,
    plannedMonthly,
    monthsAtPlannedRate,
    etaMonth,
    monthsLeft,
    neededPerMonth,
    /*
      Measured against the planned rate where there is one, and against the
      observed rate otherwise. A household that has just decided to put twice
      as much in every month should not be told it is behind on the strength of
      the six months before it decided.
    */
    onTrack: neededPerMonth === null ? null : (plannedMonthly ?? monthlyRate) >= neededPerMonth,
    lastFed,
  }
}

/**
 * Deadlines that will be missed first, then the biggest gap left to close.
 *
 * A pot with no target sorts last on purpose: nothing about it can be behind,
 * and putting it above a goal that is short would bury the one thing on the
 * panel that needs a decision.
 */
function rank(a: FundProgress, b: FundProgress): number {
  const risk = (fund: FundProgress) => (fund.onTrack === false ? 0 : fund.target === null ? 2 : 1)
  if (risk(a) !== risk(b)) return risk(a) - risk(b)

  const left = (fund: FundProgress) => fund.remaining ?? 0n
  if (left(a) !== left(b)) return left(b) > left(a) ? 1 : -1
  return a.name.localeCompare(b.name, 'id')
}
