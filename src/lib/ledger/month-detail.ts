import { formatJakarta, formatMonthKey } from '@/lib/datetime'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { directionOf, signedDirection } from './direction'
import { groupByMonth, type MonthlySeries } from './monthly'
import { hueFor } from './palette'
import { summarisePeriod } from './period'
import { CASHFLOW_LABELS, type CashflowType, type LedgerEntry } from './types'

/**
 * What happened in one month, ready to render.
 *
 * The trend chart could always tell you which month lost money and never what
 * happened in it, so reading it meant leaving for the report page and building
 * a filter by hand. This is that answer, computed here rather than there.
 *
 * Everything crossing into the chart is a string or a number. Money is bigint
 * sen throughout this app and React cannot send a bigint to a client
 * component, so every figure is formatted on this side of the line and no
 * arithmetic happens on the other.
 */

type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

export interface MonthCategory {
  name: string
  cashflow: CashflowType
  cashflowLabel: string
  icon: string | null
  hue: number
  count: number
  /** Share of its own direction's total, to one decimal. */
  share: number
  total: string
}

export interface MonthCashflow {
  cashflow: CashflowType
  label: string
  count: number
  total: string
}

export interface MonthTransaction {
  date: string
  description: string
  category: string
  direction: 'in' | 'out' | 'neutral'
  amount: string
}

export interface MonthDetail {
  month: string
  label: string
  count: number
  inflow: string
  outflow: string
  net: string
  netNegative: boolean
  /** One line carrying the figure that decides whether to read on. */
  verdict: string
  byCategory: MonthCategory[]
  byCashflow: MonthCashflow[]
  /** The largest few, because a month has more rows than anybody reads. */
  top: MonthTransaction[]
  /** Where the whole month lives, with the filters already applied. */
  href: string
}

export interface DetailOptions {
  /** The icon and hue a category is known by everywhere else. */
  look?: (name: string) => { hue: number; icon: string | null }
  /** Scoped to one account: direction is which side of the row it sits on. */
  account?: { id: string; name: string }
  topLimit?: number
}

const DEFAULT_TOP = 8

function lastDayOf(month: string): string {
  const [year, index] = month.split('-').map(Number)
  // Day zero of the next month is the last day of this one, leap years and all.
  return String(new Date(Date.UTC(year, index, 0)).getUTCDate()).padStart(2, '0')
}

export function buildMonthDetails(
  series: MonthlySeries[],
  entries: Entry[],
  options: DetailOptions = {},
): MonthDetail[] {
  const groups = groupByMonth(entries)
  const look = options.look ?? ((name: string) => ({ hue: hueFor(name), icon: null }))
  const topLimit = options.topLimit ?? DEFAULT_TOP

  return series.map(({ month, statement }) => {
    // `groupByMonth` is typed to the narrow ledger entry; the rows going in
    // carry the resolved category name, and they come back out unchanged.
    const rows = (groups.get(month) ?? []) as Entry[]
    const scoped = options.account
      ? // Inside one account, a transfer is a real movement and pass-through
        // money still moved the balance, so nothing is filtered out.
        summarisePeriod(rows, { includePassThrough: true })
      : summarisePeriod(rows)

    const inflow = options.account ? statement.income : scoped.inflow
    const outflow = options.account ? statement.spending : scoped.outflow
    const net = inflow - outflow

    const byCategory: MonthCategory[] = scoped.byCategory.map((line) => {
      const seen = look(line.category)
      return {
        name: line.category,
        cashflow: line.cashflow,
        cashflowLabel: CASHFLOW_LABELS[line.cashflow],
        icon: seen.icon,
        hue: seen.hue,
        count: line.count,
        share: line.share,
        total: formatIdr(line.total),
      }
    })

    const listed = rows
      .filter((row) => !row.isPassThrough)
      .filter((row) => (options.account ? true : row.cashflow !== 'transfer'))
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))

    const top: MonthTransaction[] = listed.slice(0, topLimit).map((row) => ({
      date: formatJakarta(row.occurredAt, 'date'),
      description: row.description,
      category: row.categoryName ?? 'Belum berkategori',
      direction: options.account
        ? row.toAccountId === options.account.id
          ? 'in'
          : 'out'
        : signedDirection(row.cashflow),
      amount: formatIdr(row.amount),
    }))

    const largestOut = byCategory.find((line) => directionOf(line.cashflow) === 'out')
    const verdict =
      listed.length === 0 && scoped.matched === 0
        ? 'Tidak ada transaksi tercatat di bulan ini.'
        : outflow <= 0n
          ? `Masuk ${formatIdrCompact(inflow)}, tidak ada pengeluaran tercatat.`
          : largestOut
            ? `Keluar ${formatIdrCompact(outflow)}, paling besar ${largestOut.name} ${largestOut.total} (${largestOut.share.toFixed(1).replace('.', ',')}%).`
            : `Keluar ${formatIdrCompact(outflow)}.`

    return {
      month,
      label: formatMonthKey(month),
      count: listed.length,
      inflow: formatIdrCompact(inflow),
      outflow: formatIdrCompact(outflow),
      net: formatIdrCompact(net < 0n ? -net : net),
      netNegative: net < 0n,
      verdict,
      byCategory,
      byCashflow: scoped.byCashflow.map((line) => ({
        cashflow: line.cashflow,
        label: line.label,
        count: line.count,
        total: formatIdr(line.total),
      })),
      top,
      href: `/laporan?dari=${month}-01&sampai=${month}-${lastDayOf(month)}`,
    }
  })
}
