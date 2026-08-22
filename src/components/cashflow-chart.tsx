import { median } from '@/lib/planning/lifestyle'
import { buildScale } from '@/lib/ledger/scale'
import { buildMonthDetails, type DetailOptions } from '@/lib/ledger/month-detail'
import type { MonthlySeries } from '@/lib/ledger/monthly'
import type { LedgerEntry } from '@/lib/ledger/types'
import { formatIdrCompact } from '@/lib/money'
import { CashflowChartView, type MonthView, type Tick } from './cashflow-chart-view'

type Entry = LedgerEntry & { categoryName?: string | null; isPassThrough?: boolean }

/**
 * Income against spending, month by month.
 *
 * Drawn by hand rather than pulled from a chart library. The chart has one job,
 * the library default look is itself a tell, and hand drawing means the bars
 * inherit the theme tokens directly so dark mode needs no separate configuration.
 *
 * This half does every calculation, because every calculation is in `bigint` sen
 * and React cannot pass a `bigint` across the boundary into a client component.
 * What crosses is a percentage and a printed string per bar, so no amount is
 * ever added up in floating point.
 */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function shortMonth(key: string): string {
  const [, month] = key.split('-')
  return MONTH_LABELS[Number(month) - 1] ?? key
}

interface Props {
  series: MonthlySeries[]
  /** Every row of the ledger, so the month a reader pins can be broken down. */
  entries?: Entry[]
  look?: DetailOptions['look']
  /** Scoped to one account, which changes what in and out mean. */
  scope?: DetailOptions['account']
  caption?: string
}

export function CashflowChart({
  series,
  entries = [],
  look,
  scope,
  caption = 'Pemasukan dan pengeluaran',
}: Props) {
  if (series.length === 0) {
    return (
      <p className="border border-line bg-surface p-6 text-sm text-ink-muted">
        Belum ada transaksi untuk digambar.
      </p>
    )
  }

  const incomes = series.map(({ statement }) => statement.income)
  const spendings = series.map(({ statement }) => statement.spending)
  const nets = series.map(({ statement }) => statement.income - statement.spending)

  const peak = [...incomes, ...spendings].reduce((max, value) => (value > max ? value : max), 1n)
  const scale = buildScale(peak)

  const hasDeficit = nets.some((net) => net < 0n)
  // The difference view has its own magnitudes, an order smaller than the gross
  // figures, so it gets its own scale rather than a mostly empty plot.
  const netPeak = nets.reduce((max, net) => {
    const size = net < 0n ? -net : net
    return size > max ? size : max
  }, 1n)
  const netScale = buildScale(netPeak, 2)

  const medianIncome = median(incomes)
  const medianSpending = median(spendings)

  const months: MonthView[] = series.map(({ month, statement }, index) => {
    const net = statement.income - statement.spending
    const negative = net < 0n
    const size = negative ? -net : net

    return {
      month,
      label: shortMonth(month),
      year: month.slice(2, 4),
      // The year is printed only where it turns over, so twenty three columns
      // carry the information without twenty three repetitions of it.
      startsYear: index === 0 || month.slice(0, 4) !== series[index - 1].month.slice(0, 4),
      income: { pct: scale.percentOf(statement.income), text: formatIdrCompact(statement.income) },
      spending: {
        pct: scale.percentOf(statement.spending),
        text: formatIdrCompact(statement.spending),
      },
      net: { pct: netScale.percentOf(size), text: formatIdrCompact(size) },
      netNegative: negative,
      overspent: statement.spending > statement.income,
    }
  })

  const toTicks = (built: typeof scale): Tick[] =>
    built.ticks.map((value) => ({
      pct: built.percentOf(value),
      text: value === 0n ? '0' : formatIdrCompact(value),
    }))

  return (
    <CashflowChartView
      months={months}
      ticks={toTicks(scale)}
      netTicks={toTicks(netScale)}
      medianIncome={{ pct: scale.percentOf(medianIncome), text: formatIdrCompact(medianIncome) }}
      medianSpending={{
        pct: scale.percentOf(medianSpending),
        text: formatIdrCompact(medianSpending),
      }}
      hasDeficit={hasDeficit}
      caption={caption}
      details={buildMonthDetails(series, entries, { look, account: scope })}
    />
  )
}
