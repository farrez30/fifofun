import { FUND_CASHFLOWS, reviewFunds, type FundCashflow } from '@/lib/ledger/funds'
import { monthKeyOf, monthKeyToString } from '@/lib/ledger/monthly'
import { lastFullMonth, monthsEnding, SUMMARY_CONFIG, summariseMonths, type SummaryReport } from '@/lib/ledger/summary'
import { getAccounts, getAllTransactions, getCategories, getSummaryNote } from '@/lib/queries/household'

/**
 * Everything the summary shows, read once and shared by the page and the PDF,
 * so the file a partner is sent can never say something the screen did not.
 */

export interface SummaryData {
  report: SummaryReport
  /** Every savings pot, empty ones included: a zero is an answer too. */
  pots: { name: string; saved: bigint }[]
  potsTotal: bigint
  note: string
  /** The month the three end with, `YYYY-MM`. */
  end: string
  /** Months the period can end on, newest first. */
  choices: string[]
}

/** A `YYYY-MM` the household asked for, if it is one of the offered months. */
export function readEnd(param: string | undefined, choices: readonly string[], fallback: string): string {
  return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) && choices.includes(param) ? param : fallback
}

export async function loadSummary(householdId: string, endParam: string | undefined, today = new Date()): Promise<SummaryData> {
  const [transactions, categories, note, accounts] = await Promise.all([
    getAllTransactions(householdId),
    getCategories(householdId, { includeArchived: true }),
    getSummaryNote(householdId),
    getAccounts(householdId, { includeArchived: true }),
  ])

  // Only months that have finished: a month still running would look like a
  // month with half the spending, which is exactly the wrong thing to show.
  const latest = lastFullMonth(today)
  const choices = [...new Set(transactions.map((entry) => monthKeyToString(monthKeyOf(entry.occurredAt))))]
    .filter((month) => month <= latest)
    .sort((a, b) => b.localeCompare(a))
  const end = readEnd(endParam, choices, choices[0] ?? latest)

  const nameById = new Map(categories.map((category) => [category.id, category.name]))
  const parentByName = new Map(
    categories.map((category) => [category.name, category.parentId ? (nameById.get(category.parentId) ?? null) : null]),
  )
  const { accountKinds } = SUMMARY_CONFIG.spending.unitemised
  const wallets = new Set(accounts.filter((account) => accountKinds.includes(account.kind)).map((account) => account.id))
  const report = summariseMonths(
    transactions,
    monthsEnding(end, 3),
    (name) => parentByName.get(name) ?? null,
    SUMMARY_CONFIG,
    wallets,
  )

  // The same reckoning /dana makes, so the two pages can never disagree about a pot.
  const pots = categories.filter(
    (category) => category.archivedAt === null && (FUND_CASHFLOWS as readonly string[]).includes(category.cashflow),
  )
  const review = reviewFunds(
    transactions,
    pots.map((category) => ({
      name: category.name,
      cashflow: category.cashflow as FundCashflow,
      openingBalance: category.openingBalance,
      target: category.target,
      targetMonth: category.targetMonth,
    })),
    { asOf: end },
  )
  const savedByName = new Map(review.funds.map((fund) => [fund.name, fund.saved]))
  const potRows = pots.map((category) => ({ name: category.name, saved: savedByName.get(category.name) ?? 0n }))

  return {
    report,
    pots: potRows,
    potsTotal: potRows.reduce((total, pot) => total + pot.saved, 0n),
    note,
    end,
    choices,
  }
}
