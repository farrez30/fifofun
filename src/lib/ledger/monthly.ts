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

/**
 * Pass-through money is excluded from every statement figure.
 *
 * A sum that arrives from someone else and leaves the same day was never income
 * and its departure was never spending. Counting both sides looks harmless
 * because they cancel in Sisa uang, but they do not always: where the money
 * leaves as a transfer to a wallet, only the arrival is counted and the month
 * gains income out of nowhere. Even when they do cancel, the income figure is
 * inflated, and every health ratio is measured against income.
 */
function totalFor(entries: LedgerEntry[], cashflow: CashflowType): bigint {
  return sumSen(
    entries
      .filter((entry) => entry.cashflow === cashflow && !entry.isPassThrough)
      .map((entry) => entry.amount),
  )
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
 *
 * Unlike the statement figures, this counts pass-through money. The bank moved
 * it, so leaving it out would put every balance here out of step with the one
 * the bank printed, and that printed balance is the only external check this
 * app has on its own arithmetic.
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

export interface BankReconciliation {
  /** The account the statements belong to, so callers can set it apart. */
  accountId: string
  ok: boolean
  /** What this app computed for the account the statements belong to. */
  computed: bigint
  /** What the bank printed as the closing balance of the last statement. */
  printed: bigint
  difference: bigint
}

/**
 * Checks the app's arithmetic against the bank's own figure.
 *
 * This is the strongest claim the app can make about itself. Every other number
 * on the dashboard is derived from rows this app parsed and classified; only
 * this one is checked against a figure nobody here computed. A difference of
 * zero means the ledger for that account is exact, to the sen.
 */
export function reconcileBank(
  movements: AccountMovement[],
  accountId: string,
  printedClosing: bigint,
): BankReconciliation | null {
  const account = movements.find((movement) => movement.accountId === accountId)
  if (!account) return null

  const difference = account.closing - printedClosing
  return {
    accountId,
    ok: difference === 0n,
    computed: account.closing,
    printed: printedClosing,
    difference,
  }
}

export interface StalledAccount extends AccountMovement {
  /** Money that went in and, as far as this app knows, never came out. */
  stranded: bigint
}

/**
 * Accounts that only ever receive money.
 *
 * A wallet topped up nine million Rupiah and never once spent from is not a
 * wallet with nine million in it; it is a wallet whose spending nobody imported.
 * The balance is arithmetically correct and factually wrong, and because it is
 * summed into Sisa uang it makes the headline figure wrong too. Bank statements
 * can only ever show one side of this, so the app has to say so rather than
 * present the total as if it were money on hand.
 */
export function findStalledAccounts(
  movements: AccountMovement[],
  minimum = 100_000_00n,
): StalledAccount[] {
  return movements
    .filter((movement) => movement.credit >= minimum && movement.debit * 10n < movement.credit)
    .map((movement) => ({ ...movement, stranded: movement.closing }))
    .sort((a, b) => (b.stranded > a.stranded ? 1 : b.stranded < a.stranded ? -1 : 0))
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
