import type { SummaryLine } from '@/lib/ledger/summary'
import type { SummaryData } from './data'
import { cell, money, monthShort, period } from './format'
import { InfoTip } from '@/components/info-tip'

/**
 * The summary itself: aggregates only, numbers and labels only.
 *
 * Built to be read off a phone across a table, so nothing here is smaller
 * than 15px, there are no charts, tabs or arrows, and no sentence tells the
 * reader what to think. Every table is the same four columns (three months
 * and their average) so the eye learns the grid once.
 *
 * The tables are ARIA tables on a CSS grid rather than <table>: at 390px a
 * row's label cannot share a line with four figures, so it takes its own line
 * above them, which a real table row cannot do without losing its semantics.
 */

const SECTION = 'space-y-3'
const HEADING = 'text-sm font-medium text-ink'
const NOTE = 'text-sm text-ink-muted'

function Figures({ label, months, rows, total }: { label: string; months: string[]; rows: SummaryLine[]; total: SummaryLine }) {
  const columns = [...months.map(monthShort), 'Rata-rata']
  return (
    <div role="table" aria-label={label} className="squircle rounded-md border border-line bg-surface px-4 py-2">
      <div role="row" className="grid grid-cols-4 gap-x-2 border-b border-line py-2 text-sm text-ink-muted">
        {columns.map((column) => (
          <span key={column} role="columnheader" className="text-right">
            {column}
          </span>
        ))}
      </div>
      {[...rows, total].map((row, index) => {
        const isTotal = index === rows.length
        return (
          <div
            key={row.label}
            role="row"
            className={`grid grid-cols-4 gap-x-2 py-2 text-sm tnum ${isTotal ? 'border-t border-line-strong font-semibold text-ink' : 'border-t border-line text-ink first-of-type:border-t-0'}`}
          >
            <span role="rowheader" className={`col-span-4 ${isTotal ? '' : 'font-medium'}`}>
              {row.label}
            </span>
            {row.values.map((value, position) => (
              <span key={months[position]} role="cell" className="text-right">
                {cell(value)}
              </span>
            ))}
            <span role="cell" className="text-right font-semibold">
              {cell(row.average)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/*
  Muted, as asked: the system red and mint mixed a third of the way toward the
  muted ink, so a bad month reads as a fact rather than an alarm. The figure
  carries its own sign too, so the colour is never the only signal.
*/
function tone(sen: bigint): string {
  if (sen < 0n) return 'text-[color-mix(in_oklch,var(--color-over)_68%,var(--color-ink-muted))]'
  return sen > 0n ? 'text-[color-mix(in_oklch,var(--color-under)_68%,var(--color-ink-muted))]' : 'text-ink'
}

export function SummaryView({ data }: { data: SummaryData }) {
  const { report, pots, potsTotal, note } = data
  const incomeExcluded = report.excluded.filter((row) => row.side === 'income')
  const spendingExcluded = report.excluded.filter((row) => row.side === 'spending')
  // Shown as a minus row above the total, so the total visibly adds up.
  const spendingRows =
    report.netted.average > 0n
      ? [
          ...report.spending,
          {
            label: `Dikurangi ${report.netted.label.toLowerCase()}`,
            values: report.netted.values.map((value) => -value),
            average: -report.netted.average,
          },
        ]
      : report.spending

  return (
    <div className="space-y-10 text-sm">
      <p className={NOTE}>
        {period(report.months)}. Semua angka dalam rupiah (Rp), rata-rata dari tiga bulan itu.
      </p>

      <section aria-labelledby="pemasukan" className={SECTION}>
        <div className="flex items-center gap-1">
          <h2 id="pemasukan" className={HEADING}>
            Pemasukan
          </h2>
          <InfoTip label="Yang tidak dihitung sebagai pemasukan">
            <p>Uang yang bukan hasil kerja dan tidak bisa diandalkan tiap bulan.</p>
          </InfoTip>
        </div>
        <Figures label="Pemasukan per bulan" months={report.months} rows={report.income} total={report.incomeTotal} />
        <p className={NOTE}>
          Tidak dihitung sebagai pemasukan:{' '}
          {incomeExcluded.length > 0
            ? incomeExcluded.map((row) => `${row.label.toLowerCase()} (${money(row.total)})`).join(', ')
            : 'tidak ada'}
          .
        </p>
      </section>

      <section aria-labelledby="pengeluaran" className={SECTION}>
        <div className="flex items-center gap-1">
          <h2 id="pengeluaran" className={HEADING}>
            Pengeluaran
          </h2>
          <InfoTip label="Cara pengeluaran dihitung">
            <p>
              Uang yang mengganti belanja mengurangi pengeluaran, karena belanjanya sudah tercatat:
              uang itu mengganti, bukan penghasilan.
            </p>
            <p className="mt-2">
              Isi ulang dompet digital dan uang tunai dihitung keluar di bulan diisi, karena belanja
              di dalamnya tidak dicatat satu per satu. Pos tahunan dibagi rata per 12 bulan.
            </p>
          </InfoTip>
        </div>
        <Figures label="Pengeluaran per kelompok" months={report.months} rows={spendingRows} total={report.spendingTotal} />
        <p className={NOTE}>
          {report.unitemised ? `Dihitung saat diisi: ${report.unitemised}. ` : ''}
          {report.amortised.length > 0 ? `Dibagi rata per 12 bulan: ${report.amortised.join(', ')}. ` : ''}
          Tidak dihitung:{' '}
          {spendingExcluded.map((row) => `${row.label.toLowerCase()} (${money(row.total)})`).join(', ') || 'tidak ada'}.
        </p>
      </section>

      <section aria-labelledby="sisa" className={SECTION}>
        <div className="flex items-center gap-1">
          <h2 id="sisa" className={HEADING}>
            Sisa
          </h2>
          <InfoTip label="Arti sisa">
            <p>Pemasukan dikurangi pengeluaran, per bulan.</p>
          </InfoTip>
        </div>
        {/* The average is the figure this page is read for; the three months
            under it are the evidence, so they sit as rows rather than as
            three more tiles competing with it. */}
        <dl className="squircle divide-y divide-line rounded-md border border-line bg-surface px-4">
          <div className="py-3">
            <dt className={NOTE}>Rata-rata</dt>
            <dd className={`mt-1 text-2xl font-semibold tnum ${tone(report.remainder.average)}`}>
              {money(report.remainder.average)}
            </dd>
          </div>
          {report.months.map((month, position) => (
            <div key={month} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-ink-muted">{monthShort(month)}</dt>
              <dd className={`tnum ${tone(report.remainder.values[position])}`}>
                {money(report.remainder.values[position])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="tabungan" className={SECTION}>
        <h2 id="tabungan" className={HEADING}>
          Tabungan saat ini
        </h2>
        <dl className="squircle divide-y divide-line rounded-md border border-line bg-surface px-4">
          {pots.map((pot) => (
            <div key={pot.name} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-ink">{pot.name}</dt>
              <dd className="tnum text-ink">{money(pot.saved)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 py-3 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="tnum text-ink">{money(potsTotal)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="rencana" className={SECTION}>
        <h2 id="rencana" className={HEADING}>
          Rencana
        </h2>
        {note ? (
          <p className="squircle whitespace-pre-line rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">{note}</p>
        ) : (
          <p className={NOTE}>Belum ditulis.</p>
        )}
      </section>
    </div>
  )
}
