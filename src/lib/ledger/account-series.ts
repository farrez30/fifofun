import type { Account, LedgerEntry } from './types'
import { groupByMonth, type MonthlySeries } from './monthly'

/**
 * One account's own month by month, the way a bank statement reads.
 *
 * The household's Sisa uang answers what is left to spend, which is the right
 * question for the whole ledger and the wrong one for a single wallet: a
 * top-up moves money out of nothing and into GoPay, and a figure that ignores
 * transfers would show a wallet that never fills. So this counts everything
 * that touched the account, transfers and pass-through money included, for the
 * same reason `computeAccountMovements` does: the printed balance is the only
 * external check this app has, and a figure that leaves rows out cannot be
 * compared with it.
 */

export interface AccountMonth {
  month: string
  opening: bigint
  credit: bigint
  debit: bigint
  closing: bigint
}

export function computeAccountSeries(entries: LedgerEntry[], account: Account): AccountMonth[] {
  // The months come from the whole ledger, not from this account's own rows, so
  // a quiet month still gets a point and the line does not skip it.
  const groups = groupByMonth(entries)
  const months = [...groups.keys()].sort()

  let opening = account.openingBalance
  return months.map((month) => {
    const rows = groups.get(month) ?? []
    let credit = 0n
    let debit = 0n
    for (const row of rows) {
      if (row.toAccountId === account.id) credit += row.amount
      if (row.fromAccountId === account.id) debit += row.amount
    }
    const closing = opening + credit - debit
    const point = { month, opening, credit, debit, closing }
    opening = closing
    return point
  })
}

/**
 * The same points in the shape the charts already draw.
 *
 * `CashflowChart` and `BalanceTrend` both take a `MonthlySeries`, and both ask
 * only for income, spending and the closing figure. Money in and out of one
 * account are exactly that, so scoping the dashboard to an account needs no
 * change to either chart.
 */
export function asMonthlySeries(points: AccountMonth[]): MonthlySeries[] {
  return points.map((point) => ({
    month: point.month,
    statement: {
      saldoAwal: point.opening,
      income: point.credit,
      fromAsset: 0n,
      investSavings: 0n,
      bills: 0n,
      sinkingFund: 0n,
      financialGoals: 0n,
      debtPayment: 0n,
      spending: point.debit,
      piutang: 0n,
      sisaUang: point.closing,
    },
  }))
}
