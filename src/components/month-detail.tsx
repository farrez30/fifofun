import { CashflowChip, CategoryMark } from '@/components/marks'
import type { MonthDetail } from '@/lib/ledger/month-detail'

/**
 * What one month was made of, under the chart that made you ask.
 *
 * The chart says a month lost money; this says which categories it went to and
 * which transactions were the largest. Both tables are plain markup rather
 * than a picture, because the answer here is a list of names and figures and a
 * second chart would only make it prettier.
 *
 * Every figure arrives already formatted. The month is chosen in the browser
 * and money is bigint on the server, so the arithmetic stays where the exact
 * type is.
 */

export function MonthDetailPanel({ detail }: { detail: MonthDetail }) {
  const headingId = `rincian-${detail.month}`

  return (
    <section
      aria-labelledby={headingId}
      data-month-detail={detail.month}
      className="mt-4 border-t border-line pt-4"
    >
      <h3 id={headingId} className="text-sm font-medium text-ink">
        Rincian {detail.label}
        <span className="ml-2 font-normal text-ink-muted">{detail.count} transaksi</span>
      </h3>
      <p className="mt-1 text-sm text-ink">{detail.verdict}</p>

      {detail.byCategory.length === 0 ? null : (
        <>
          <div
            role="region"
            tabIndex={0}
            aria-label={`Tabel per kategori ${detail.label}, bisa digeser ke samping`}
            className="relative mt-3 overflow-x-auto border border-line bg-surface"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Per kategori, {detail.label}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Kategori
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Cashflow
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Transaksi
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Porsi
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.byCategory.map((line) => (
                  <tr key={`${line.cashflow} ${line.name}`} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <CategoryMark
                        name={line.name}
                        cashflow={line.cashflow}
                        icon={line.icon}
                        hue={line.hue}
                      />
                    </th>
                    <td className="px-4 py-2">
                      <CashflowChip cashflow={line.cashflow} />
                    </td>
                    <td className="tnum px-4 py-2 text-right font-mono text-ink-muted">
                      {line.count}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="tnum font-mono text-ink-muted">
                        {line.share.toFixed(1).replace('.', ',')}%
                      </span>
                      <span className="ml-auto mt-1 block h-1.5 w-16 bg-sunken">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `max(2px, ${Math.min(100, line.share)}%)` }}
                        />
                      </span>
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-2 text-right font-mono text-ink">
                      {line.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {detail.count > detail.top.length
              ? `${detail.top.length} transaksi terbesar dari ${detail.count}`
              : `Semua ${detail.count} transaksi`}
          </h4>

          <div
            role="region"
            tabIndex={0}
            aria-label={`Tabel transaksi terbesar ${detail.label}, bisa digeser ke samping`}
            className="relative mt-2 overflow-x-auto border border-line bg-surface"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Transaksi terbesar, {detail.label}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Tanggal
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Keterangan
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Kategori
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Nominal
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.top.map((row, index) => (
                  <tr key={`${row.date}-${index}`} className="border-b border-line last:border-0">
                    <td className="tnum whitespace-nowrap px-4 py-2 text-ink-muted">{row.date}</td>
                    <th scope="row" className="px-4 py-2 text-left font-normal text-ink">
                      {row.description}
                    </th>
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{row.category}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {/* The same shape SignedMoney draws, in strings: a glyph,
                          a word nobody sees, and the figure. */}
                      <span
                        className={`tnum font-mono ${
                          row.direction === 'in'
                            ? 'text-under'
                            : row.direction === 'out'
                              ? 'text-ink'
                              : 'text-ink-muted'
                        }`}
                      >
                        <span aria-hidden="true">
                          {row.direction === 'in' ? '+' : row.direction === 'out' ? '−' : ''}
                        </span>
                        <span className="sr-only">
                          {row.direction === 'in' ? 'masuk ' : row.direction === 'out' ? 'keluar ' : ''}
                        </span>
                        {row.amount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-ink-muted">
            Porsi dihitung terhadap arah kategorinya sendiri: kategori pengeluaran dibandingkan
            dengan total keluar, kategori pemasukan dengan total masuk.
          </p>
        </>
      )}

      <p className="mt-1 text-xs text-ink-faint">
        Perpindahan antar akun dan uang titipan tidak ikut dihitung.{' '}
        <a href={detail.href} className="text-accent underline underline-offset-2">
          Semua transaksi {detail.label} di Laporan
        </a>
        .
      </p>
    </section>
  )
}
