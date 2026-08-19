import { sumSen } from '@/lib/money'
import type { Account, CashflowType, LedgerEntry } from './types'

/**
 * The Monthly Statement panel from the spreadsheet, reproduced exactly.
 *
 * The formula below was derived from the source spreadsheet and verified
 * against three months of the user's real data (January to March 2026) before
 * any of it was written. Those figures are asserted in the tests, because this
 * app is only correct if its numbers match the spreadsheet it replaces.
 */

export interface MonthlyStatement {
  /** Spendable money carried in from the previous month. */
  saldoAwal: bigint
  income: bigint
  fromAsset: bigint
  investSavings: bigint
  bills: bigint
  sinkingFund: bigint
  financialGoals: bigint
  debtPayment: bigint
  spending: bigint
  /** New receivables minus settled ones; money lent out that is still owed. */
  piutang: bigint
  /** Spendable money carried out to the next month. */
  sisaUang: bigint
}

function totalFor(entries: LedgerEntry[], cashflow: CashflowType): bigint {
  return sumSen(entries.filter((entry) => entry.cashflow === cashflow).map((entry) => entry.amount))
}

/**
 * Computes one month's statement.
 *
 * Transfers deliberately have no term: moving money between your own accounts
 * changes neither the total nor what you can spend.
 */
export function computeMonthlyStatement(
  entries: LedgerEntry[],
  saldoAwal: bigint,
): MonthlyStatement {
  const income = totalFor(entries, 'income')
  const fromAsset = totalFor(entries, 'from_asset')
  const investSavings = totalFor(entries, 'invest_savings')
  const bills = totalFor(entries, 'bills')
  const sinkingFund = totalFor(entries, 'sinking_fund')
  const financialGoals = totalFor(entries, 'financial_goal')
  const debtPayment = totalFor(entries, 'debt_payment')
  const spending = totalFor(entries, 'spending')
  const piutang = totalFor(entries, 'receivable_new') - totalFor(entries, 'receivable_settled')

  const sisaUang =
    saldoAwal +
    income +
    fromAsset -
    investSavings -
    bills -
    sinkingFund -
    financialGoals -
    debtPayment -
    spending -
    piutang

  return {
    saldoAwal,
    income,
    fromAsset,
    investSavings,
    bills,
    sinkingFund,
    financialGoals,
    debtPayment,
    spending,
    piutang,
    sisaUang,
  }
}

export interface AccountMovement {
  accountId: string
  name: string
  opening: bigint
  credit: bigint
  debit: bigint
  closing: bigint
}

/**
 * The Transaction Methods table: opening, in, out and closing per account.
 * A closing balance below zero is impossible in reality, so callers should
 * surface it rather than display it; the source spreadsheet showed Gopay at
 * minus Rp47.200 for a whole month without anyone noticing.
 */
export function computeAccountMovements(
  entries: LedgerEntry[],
  accounts: Account[],
): AccountMovement[] {
  return accounts.map((account) => {
    const credit = sumSen(
      entries.filter((entry) => entry.toAccountId === account.id).map((entry) => entry.amount),
    )
    const debit = sumSen(
      entries.filter((entry) => entry.fromAccountId === account.id).map((entry) => entry.amount),
    )
    return {
      accountId: account.id,
      name: account.name,
      opening: account.openingBalance,
      credit,
      debit,
      closing: account.openingBalance + credit - debit,
    }
  })
}

/** Accounts whose balance went negative, which always means a recording error. */
export function findOverdrawnAccounts(movements: AccountMovement[]): AccountMovement[] {
  return movements.filter((movement) => movement.closing < 0n)
}

/**
 * The Saldo Awal Checker from the Setup sheet. Account balances include money
 * earmarked as savings, so the spendable opening balance is what remains after
 * the earmarks are taken out. Anything other than zero means the setup is wrong.
 */
export function openingBalanceCheck(
  accounts: Account[],
  earmarkedOpening: bigint,
  declaredSpendableOpening: bigint,
): { ok: boolean; difference: bigint } {
  const total = sumSen(accounts.map((account) => account.openingBalance))
  const difference = total - earmarkedOpening - declaredSpendableOpening
  return { ok: difference === 0n, difference }
}

export interface MonthKey {
  year: number
  month: number
}

export function monthKeyOf(instant: Date, offsetMinutes = 420): MonthKey {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

export function monthKeyToString({ year, month }: MonthKey): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Groups entries by their Jakarta calendar month. */
export function groupByMonth(entries: LedgerEntry[]): Map<string, LedgerEntry[]> {
  const groups = new Map<string, LedgerEntry[]>()
  for (const entry of entries) {
    const key = monthKeyToString(monthKeyOf(entry.occurredAt))
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

export interface MonthlySeries {
  month: string
  statement: MonthlyStatement
}

/**
 * Runs the months in order, carrying each month's Sisa uang into the next as
 * its Saldo awal. The spreadsheet requires this to be typed in by hand every
 * month, which is exactly the sort of step that goes wrong silently.
 */
export function computeMonthlySeries(
  entries: LedgerEntry[],
  firstSaldoAwal: bigint,
): MonthlySeries[] {
  const groups = groupByMonth(entries)
  const months = [...groups.keys()].sort()

  let carried = firstSaldoAwal
  return months.map((month) => {
    const statement = computeMonthlyStatement(groups.get(month) ?? [], carried)
    carried = statement.sisaUang
    return { month, statement }
  })
}
