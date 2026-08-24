import type { FlowTone } from '@/components/chart/sankey'
import type { AccountKind, CashflowType } from './types'

/**
 * Which way each cashflow type moves money, and what colour family it belongs
 * to, in one place.
 *
 * The direction table used to be a private constant inside the period summary,
 * and the dashboard kept its own three-line copy that forgot about settled
 * receivables, so a loan coming back rendered as money going out. Two copies
 * of a fact is one too many when the fact decides which sign an amount gets.
 *
 * The tone table mirrors what the Sankey and the waterfall already colour by
 * hand, so a chip beside a row and a ribbon in a diagram agree about whether
 * something is income, spending, saving or debt.
 */

export type Direction = 'in' | 'out' | 'neither'

const DIRECTION: Record<CashflowType, Direction> = {
  income: 'in',
  from_asset: 'in',
  receivable_settled: 'in',
  spending: 'out',
  bills: 'out',
  invest_savings: 'out',
  sinking_fund: 'out',
  financial_goal: 'out',
  debt_payment: 'out',
  receivable_new: 'out',
  // Money moving between the household's own accounts is not a flow at all.
  // Counting it would double every top-up as both spending and income.
  transfer: 'neither',
}

const TONE: Record<CashflowType, FlowTone> = {
  income: 'income',
  from_asset: 'income',
  receivable_settled: 'income',
  spending: 'spend',
  bills: 'spend',
  invest_savings: 'save',
  sinking_fund: 'save',
  financial_goal: 'save',
  debt_payment: 'warn',
  // Lending money out is neither spending nor saving; it is a promise.
  receivable_new: 'neutral',
  transfer: 'neutral',
}

export function directionOf(cashflow: CashflowType): Direction {
  return DIRECTION[cashflow]
}

/** The same fact in SignedMoney's vocabulary, where a transfer is `neutral`. */
export function signedDirection(cashflow: CashflowType): 'in' | 'out' | 'neutral' {
  const direction = DIRECTION[cashflow]
  return direction === 'neither' ? 'neutral' : direction
}

export function toneOf(cashflow: CashflowType): FlowTone {
  return TONE[cashflow]
}

/**
 * Whether a rule may be applied to a row at all.
 *
 * A rule that files an incoming row under a spending category would set a
 * cashflow whose account sides the database refuses, and an import that trips
 * that check loses the whole statement. A rule with no cashflow opinion is
 * always fine; otherwise the directions have to agree.
 */
export function ruleAgreesWithDirection(
  ruleCashflow: CashflowType | null,
  entryCashflow: CashflowType,
): boolean {
  return ruleCashflow === null || DIRECTION[ruleCashflow] === DIRECTION[entryCashflow]
}

export const DIRECTION_LABELS: Record<Direction, string> = {
  in: 'masuk',
  out: 'keluar',
  neither: 'antar akun',
}

/**
 * Why a category cannot be written onto a row.
 *
 * A category carries a cashflow, and a cashflow decides which account sides a
 * row must have. Filing an outgoing payment under an income category would
 * produce exactly the shape `transactions_account_sides` refuses, and because
 * the updates run in batches of a hundred, one such row used to take ninety
 * nine correct ones down with it and report a raw Postgres message.
 */
export function directionRefusal(
  categoryName: string,
  category: CashflowType,
  row: CashflowType,
): string {
  return `${categoryName} untuk uang ${DIRECTION_LABELS[directionOf(category)]}, transaksi ini uang ${DIRECTION_LABELS[directionOf(row)]}. Pilih kategori dengan arah yang sama.`
}

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Bank',
  ewallet: 'Dompet digital',
  cash: 'Tunai',
  emoney: 'Uang elektronik',
  investment: 'Investasi',
}
