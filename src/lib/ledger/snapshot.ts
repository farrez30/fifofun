import type { AccountMovement, MonthlySeries } from './monthly'
import { median } from '@/lib/planning/lifestyle'
import type { FinancialSnapshot } from '@/lib/planning/ratios'

/**
 * Turns the ledger into the snapshot the health ratios need.
 *
 * Every monthly figure is a median across the imported months rather than the
 * latest one. A single month is noise: a bonus, an annual insurance premium or
 * one large purchase would move a ratio across a threshold and produce a verdict
 * about the household that is really a verdict about that month.
 *
 * What is not known is left at zero rather than guessed. A bank statement shows
 * cash moving; it says nothing about a mortgage balance or the value of a house,
 * and inventing those would produce two ratios that look precise and mean
 * nothing. The ratio module already reports an incomputable ratio as unknown, so
 * zero here surfaces honestly rather than silently.
 */

export interface SnapshotExtras {
  /** Outstanding principal on everything owed, which no statement can show. */
  totalDebt?: bigint
  /** Property, vehicles and investments held outside the tracked accounts. */
  illiquidAssets?: bigint
}

export function buildSnapshot(
  series: MonthlySeries[],
  movements: AccountMovement[],
  extras: SnapshotExtras = {},
): FinancialSnapshot {
  const monthly = <K extends keyof MonthlySeries['statement']>(key: K): bigint =>
    median(series.map((month) => month.statement[key] as bigint))

  const income = monthly('income')
  const spending = monthly('spending')
  const bills = monthly('bills')
  const debtService = monthly('debtPayment')

  // Everything deliberately set aside, whatever bucket it was earmarked into.
  const savings =
    monthly('investSavings') + monthly('sinkingFund') + monthly('financialGoals')

  // Only positive balances are liquid. A negative one is a bookkeeping error
  // rather than a debt, and counting it would net away real cash elsewhere.
  const liquidAssets = movements.reduce(
    (sum, account) => sum + (account.closing > 0n ? account.closing : 0n),
    0n,
  )

  const illiquid = extras.illiquidAssets ?? 0n

  return {
    monthlyIncome: income,
    monthlyDebtService: debtService,
    monthlySavings: savings,
    monthlyExpenses: spending + bills + debtService,
    liquidAssets,
    totalAssets: liquidAssets + illiquid,
    totalDebt: extras.totalDebt ?? 0n,
  }
}

/** The typical month's income, used to prefill the planner. */
export function typicalIncome(series: MonthlySeries[]): bigint {
  return median(series.map((month) => month.statement.income))
}
