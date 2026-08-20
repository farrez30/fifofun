/**
 * The ledger taxonomy, taken from the spreadsheet this app replaces
 * ("Ultimate Financial Planner"). The names are kept in the user's own terms so
 * that numbers in the app can be compared against the spreadsheet directly.
 */

export const CASHFLOW_TYPES = [
  'income',
  'spending',
  'bills',
  'invest_savings',
  'sinking_fund',
  'financial_goal',
  'transfer',
  'debt_payment',
  'receivable_new',
  'receivable_settled',
  'from_asset',
] as const

export type CashflowType = (typeof CASHFLOW_TYPES)[number]

/** How the spreadsheet labels each cashflow type, for display and for import. */
export const CASHFLOW_LABELS: Record<CashflowType, string> = {
  income: 'Income',
  spending: 'Spending',
  bills: 'Bills',
  invest_savings: 'Invest / Savings',
  sinking_fund: 'Sinking Fund',
  financial_goal: 'Financial Goals',
  transfer: 'Antar Account',
  debt_payment: 'Bayar cicilan / utang',
  receivable_new: 'Piutang Baru',
  receivable_settled: 'Piutang Cair',
  from_asset: 'Dari Asset / Saving',
}

export type AccountKind = 'bank' | 'ewallet' | 'cash' | 'emoney' | 'investment'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  openingBalance: bigint
  /** Masked account number, used to match imported statements to an account. */
  reference?: string | null
}

export interface Category {
  id: string
  name: string
  cashflow: CashflowType
}

export type EntrySource = 'xlsx' | 'email' | 'manual' | 'telegram'

export interface LedgerEntry {
  id: string
  occurredAt: Date
  description: string
  /** Always positive; direction is carried by the cashflow type and accounts. */
  amount: bigint
  cashflow: CashflowType
  categoryId: string | null
  /** Set when money leaves an account. */
  fromAccountId: string | null
  /** Set when money arrives in an account. */
  toAccountId: string | null
  source: EntrySource
  /** Bank reference, used to deduplicate and to join email against statement. */
  externalRef?: string | null
  /** Links a bank fee to the transaction it was charged for. */
  feeParentId?: string | null
  note?: string | null
  /**
   * Money that arrived and left again almost immediately: somebody else's funds
   * routed through the account. It moved the bank balance, so every balance
   * calculation must count it, and it was never income or spending, so every
   * statement figure must not.
   */
  isPassThrough?: boolean
}

/**
 * Which account fields a cashflow type is allowed to fill. The spreadsheet
 * enforces this by convention; here it is checked, because a transfer recorded
 * with only one side silently corrupts every balance downstream.
 */
export const ACCOUNT_RULES: Record<CashflowType, { from: boolean; to: boolean }> = {
  income: { from: false, to: true },
  spending: { from: true, to: false },
  bills: { from: true, to: false },
  // Saving and goal contributions earmark money rather than move it out of the
  // bank: the cash often stays put, but leaves the spendable pool. The bucket
  // it lands in is identified by the category, not by a destination account.
  invest_savings: { from: true, to: false },
  sinking_fund: { from: true, to: false },
  financial_goal: { from: true, to: false },
  transfer: { from: true, to: true },
  debt_payment: { from: true, to: false },
  receivable_new: { from: true, to: false },
  receivable_settled: { from: false, to: true },
  from_asset: { from: false, to: true },
}

export interface EntryProblem {
  entryId: string
  message: string
}

/** Validates an entry against the account rules for its cashflow type. */
export function validateEntry(entry: LedgerEntry): EntryProblem[] {
  const problems: EntryProblem[] = []
  const rule = ACCOUNT_RULES[entry.cashflow]

  if (entry.amount <= 0n) {
    problems.push({ entryId: entry.id, message: 'Amount must be greater than zero' })
  }
  if (rule.from && entry.fromAccountId === null) {
    problems.push({ entryId: entry.id, message: `${entry.cashflow} needs a source account` })
  }
  if (!rule.from && entry.fromAccountId !== null) {
    problems.push({ entryId: entry.id, message: `${entry.cashflow} must not have a source account` })
  }
  if (rule.to && entry.toAccountId === null) {
    problems.push({ entryId: entry.id, message: `${entry.cashflow} needs a destination account` })
  }
  if (!rule.to && entry.toAccountId !== null) {
    problems.push({
      entryId: entry.id,
      message: `${entry.cashflow} must not have a destination account`,
    })
  }
  if (
    entry.fromAccountId !== null &&
    entry.fromAccountId === entry.toAccountId
  ) {
    problems.push({ entryId: entry.id, message: 'Source and destination accounts are the same' })
  }

  return problems
}
