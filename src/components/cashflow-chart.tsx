import { formatIdrCompact, senToRupiahNumber } from '@/lib/money'
import type { MonthlySeries } from '@/lib/ledger/monthly'

/**
 * Income against spending, month by month.
 *
 * Drawn as inline SVG rather than pulled from a chart library. The chart has one
 * job and the library default look is itself a tell; hand-drawing also means the
 * bars inherit the theme tokens directly and dark mode needs no separate
 * configuration.
 */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function shortMonth(key: string): string {
  const [, month] = key.split('-')
  return MONTH_LABELS[Number(month) - 1] ?? key
}

interface Props {
  series: MonthlySeries[]
}

export function CashflowChart({ series }: Props) {
  if (series.length === 0) {
    return (
      <p className="border border-line bg-surface p-6 text-sm text-ink-muted">
        Belum ada transaksi untuk digambar.
      </p>
    )
  }

  const peak = series.reduce((max, { statement }) => {
    const local = statement.income > statement.spending ? statement.income : statement.spending
    return local > max ? local : max
  }, 1n)

  const peakRupiah = senToRupiahNumber(peak)
  const heightOf = (sen: bigint) => Math.max(1, (senToRupiahNumber(sen) / peakRupiah) * 100)

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-4 flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink">Pemasukan dan pengeluaran</span>
        <span className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-under" />
            Masuk
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-accent" />
            Keluar
          </span>
        </span>
      </figcaption>

      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Grafik pemasukan dan pengeluaran, bisa digeser ke samping"
      >
        <div className="flex min-w-full items-end gap-1" style={{ height: '11rem' }}>
          {series.map(({ month, statement }) => {
            const overspent = statement.spending > statement.income
            return (
              <div key={month} className="flex min-w-10 flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 bg-under"
                    style={{ height: `${heightOf(statement.income)}%` }}
                    title={`Masuk ${formatIdrCompact(statement.income)}`}
                  />
                  <div
                    className={`w-1/2 ${overspent ? 'bg-over' : 'bg-accent'}`}
                    style={{ height: `${heightOf(statement.spending)}%` }}
                    title={`Keluar ${formatIdrCompact(statement.spending)}`}
                  />
                </div>
                <span className="text-[0.625rem] tabular-nums text-ink-faint">
                  {shortMonth(month)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* The visual is decorative; the numbers themselves stay reachable. */}
      <table className="sr-only">
        <caption>Pemasukan dan pengeluaran per bulan</caption>
        <thead>
          <tr>
            <th scope="col">Bulan</th>
            <th scope="col">Masuk</th>
            <th scope="col">Keluar</th>
          </tr>
        </thead>
        <tbody>
          {series.map(({ month, statement }) => (
            <tr key={month}>
              <th scope="row">{month}</th>
              <td>{formatIdrCompact(statement.income)}</td>
              <td>{formatIdrCompact(statement.spending)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
